#!/usr/bin/env python3
"""
JavaScript Code Validation Harness

Runs a JavaScript (.mjs) file against a local mock HTTP server that responds
to JSON-RPC requests. Captures RPC call sequences and outputs a JSON report.

Usage:
    python validate_javascript.py <js_file> [harness_dir] [sdk_dir]

The harness automatically creates a node_modules/accumulate.js shim that
re-exports from the SDK's built output, so generated code can
  import { ... } from "accumulate.js"
without needing npm install.

Output (JSON to stdout):
    {"success": true, "calls": [...], "call_count": N, "error": null}
"""

import http.server
import json
import os
import subprocess
import sys
import threading


# ── Default paths ─────────────────────────────────────────────────────────
DEFAULT_SDK_DIR = os.path.normpath(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "..", "..", "..", "..", "..",
        "opendlt-javascript-v2v3-sdk", "javascript",
    )
)


class MockRPCHandler(http.server.BaseHTTPRequestHandler):
    """Handle JSON-RPC requests with mock responses."""

    calls_log = []
    lock = threading.Lock()

    def log_message(self, format, *args):
        """Suppress default request logging."""
        pass

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            json_data = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        # Handle batch requests
        if isinstance(json_data, list):
            results = []
            for item in json_data:
                method = item.get("method", "unknown")
                params = item.get("params", {})
                req_id = item.get("id", 1)
                resp = self._route_rpc(method, params)
                resp["id"] = req_id
                results.append(resp)
            self._send_json(results)
        else:
            method = json_data.get("method", "unknown")
            params = json_data.get("params", {})
            req_id = json_data.get("id", 1)
            resp = self._route_rpc(method, params)
            resp["id"] = req_id
            self._send_json(resp)

    def _route_rpc(self, method, params):
        """Route a JSON-RPC call to the appropriate mock response."""
        entry = {"method": method}
        if params:
            entry["params"] = params

        with self.lock:
            self.calls_log.append(entry)
            idx = len(self.calls_log)

        if method == "faucet":
            return {
                "jsonrpc": "2.0",
                "result": {
                    "type": "faucet",
                    "transactionHash": f"mock-faucet-tx-{idx:04d}",
                    "txid": f"mock-faucet-tx-{idx:04d}",
                },
            }

        if method == "query":
            scope = params.get("scope", "") if isinstance(params, dict) else ""
            # Transaction status query: scope contains @ (e.g. txid@partition)
            if "@" in scope:
                return {
                    "jsonrpc": "2.0",
                    "result": {
                        "status": {"delivered": True},
                        "result": {"type": "unknown"},
                        "type": "transactionRecord",
                    },
                }
            if scope.startswith("acc://"):
                return {
                    "jsonrpc": "2.0",
                    "result": {
                        "account": {
                            "version": 1,
                            "balance": "100000000000",
                            "creditBalance": 10000,
                            "type": "liteTokenAccount",
                            "url": scope,
                        }
                    },
                }
            # Fallback for other queries
            return {
                "jsonrpc": "2.0",
                "result": {"status": {"delivered": True}},
            }

        if method == "network-status":
            return {
                "jsonrpc": "2.0",
                "result": {"oracle": {"price": 50000000}},
            }

        if method == "submit":
            return {
                "jsonrpc": "2.0",
                "result": [
                    {
                        "status": {
                            "txID": f"0000000000000000000000000000000000000000000000000000000000{idx:06d}"
                        }
                    }
                ],
            }

        # Default catch-all
        return {"jsonrpc": "2.0", "result": {}}

    def _send_json(self, data):
        response = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


def ensure_sdk_shim(harness_dir, sdk_dir):
    """
    Create a node_modules/accumulate.js shim in the harness directory that
    re-exports from the SDK's built output.  This lets generated .mjs files
    do ``import { ... } from "accumulate.js"`` without running npm install.
    """
    shim_dir = os.path.join(harness_dir, "node_modules", "accumulate.js")
    os.makedirs(shim_dir, exist_ok=True)

    # Resolve the SDK's compiled index
    sdk_index = os.path.join(os.path.abspath(sdk_dir), "lib", "src", "index.js")
    if not os.path.isfile(sdk_index):
        # Fallback: maybe the SDK's main is correct after all
        sdk_index = os.path.join(os.path.abspath(sdk_dir), "lib", "index.js")
    if not os.path.isfile(sdk_index):
        raise FileNotFoundError(
            f"Cannot find SDK index.js at {sdk_index}. "
            f"Is the SDK built? Try: cd {sdk_dir} && npm run build"
        )

    # Convert to forward-slash file:// URL for Node ESM
    sdk_index_url = "file:///" + sdk_index.replace("\\", "/")

    # Write shim package.json
    pkg = {"name": "accumulate.js", "version": "0.0.0", "type": "module", "main": "index.js"}
    with open(os.path.join(shim_dir, "package.json"), "w") as f:
        json.dump(pkg, f)

    # Write shim index.js that re-exports everything from the real SDK
    with open(os.path.join(shim_dir, "index.js"), "w") as f:
        f.write(f'export * from "{sdk_index_url}";\n')

    # Also copy the SDK's node_modules so transitive deps resolve
    sdk_nm = os.path.join(os.path.abspath(sdk_dir), "node_modules")
    harness_nm = os.path.join(harness_dir, "node_modules")
    for dep in os.listdir(sdk_nm):
        src = os.path.join(sdk_nm, dep)
        dst = os.path.join(harness_nm, dep)
        if dep == "accumulate.js":
            continue  # Don't overwrite our shim
        if dep.startswith("."):
            continue
        if not os.path.exists(dst):
            # Create symlink (or junction on Windows)
            try:
                if os.name == "nt":
                    # On Windows, use junction for directories
                    if os.path.isdir(src):
                        subprocess.run(
                            ["cmd", "/c", "mklink", "/J", dst, src],
                            capture_output=True, timeout=5,
                        )
                    else:
                        os.symlink(src, dst)
                else:
                    os.symlink(src, dst)
            except OSError:
                pass  # Best-effort; may not need all transitive deps


def run_js_file(js_file, harness_dir=None, sdk_dir=None):
    """Run a JavaScript file against a local mock HTTP server."""
    # Reset call log
    MockRPCHandler.calls_log = []

    if harness_dir is None:
        harness_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "js-harness"
        )
    if sdk_dir is None:
        sdk_dir = DEFAULT_SDK_DIR

    # Ensure the SDK shim is set up
    try:
        ensure_sdk_shim(harness_dir, sdk_dir)
    except FileNotFoundError as e:
        return {
            "success": False,
            "calls": [],
            "call_count": 0,
            "error": str(e),
        }

    # Start mock server on random port
    server = http.server.HTTPServer(("127.0.0.1", 0), MockRPCHandler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    mock_url = f"http://127.0.0.1:{port}"

    # Set environment variables for the Node process
    env = os.environ.copy()
    env["ACCUMULATE_V2_URL"] = mock_url
    env["ACCUMULATE_V3_URL"] = mock_url

    js_file_abs = os.path.abspath(js_file)

    try:
        result = subprocess.run(
            ["node", js_file_abs],
            env=env,
            cwd=harness_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )

        calls = MockRPCHandler.calls_log[:]

        if result.returncode != 0:
            return {
                "success": False,
                "calls": calls,
                "call_count": len(calls),
                "error": f"Process exited with code {result.returncode}: {result.stderr[:500]}",
                "stdout": result.stdout[:1000],
                "stderr": result.stderr[:1000],
            }

        return {
            "success": True,
            "calls": calls,
            "call_count": len(calls),
            "error": None,
            "stdout": result.stdout[:2000],
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "calls": MockRPCHandler.calls_log[:],
            "call_count": len(MockRPCHandler.calls_log),
            "error": "Process timed out after 60 seconds",
        }
    except Exception as exc:
        return {
            "success": False,
            "calls": MockRPCHandler.calls_log[:],
            "call_count": len(MockRPCHandler.calls_log),
            "error": str(exc),
        }
    finally:
        server.shutdown()


def run_ts_example(ts_file, sdk_dir=None):
    """
    Run a TypeScript SDK example via tsx against the mock server.
    Used for baseline capture — the example lives inside the SDK repo and
    imports from relative source paths, so we run it with the SDK as cwd.
    """
    MockRPCHandler.calls_log = []

    if sdk_dir is None:
        sdk_dir = DEFAULT_SDK_DIR

    server = http.server.HTTPServer(("127.0.0.1", 0), MockRPCHandler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    mock_url = f"http://127.0.0.1:{port}"

    env = os.environ.copy()
    env["ACCUMULATE_V2_URL"] = mock_url
    env["ACCUMULATE_V3_URL"] = mock_url

    ts_file_abs = os.path.abspath(ts_file)

    try:
        # Use npx tsx to run TypeScript directly
        result = subprocess.run(
            ["npx", "tsx", ts_file_abs],
            env=env,
            cwd=sdk_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )

        calls = MockRPCHandler.calls_log[:]

        if result.returncode != 0:
            return {
                "success": False,
                "calls": calls,
                "call_count": len(calls),
                "error": f"Process exited with code {result.returncode}: {result.stderr[:500]}",
                "stdout": result.stdout[:1000],
                "stderr": result.stderr[:1000],
            }

        return {
            "success": True,
            "calls": calls,
            "call_count": len(calls),
            "error": None,
            "stdout": result.stdout[:2000],
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "calls": MockRPCHandler.calls_log[:],
            "call_count": len(MockRPCHandler.calls_log),
            "error": "Process timed out after 60 seconds",
        }
    except Exception as exc:
        return {
            "success": False,
            "calls": MockRPCHandler.calls_log[:],
            "call_count": len(MockRPCHandler.calls_log),
            "error": str(exc),
        }
    finally:
        server.shutdown()


def main():
    # Support --tsx mode for running TypeScript SDK examples (baseline capture)
    # Usage: validate_javascript.py --tsx <ts_file> <sdk_dir>
    if len(sys.argv) >= 2 and sys.argv[1] == "--tsx":
        if len(sys.argv) < 3:
            print(
                json.dumps(
                    {
                        "success": False,
                        "calls": [],
                        "call_count": 0,
                        "error": "Usage: validate_javascript.py --tsx <ts_file> [sdk_dir]",
                    }
                )
            )
            sys.exit(1)

        ts_file = sys.argv[2]
        sdk_dir = sys.argv[3] if len(sys.argv) > 3 else None

        if not os.path.isfile(ts_file):
            print(
                json.dumps(
                    {
                        "success": False,
                        "calls": [],
                        "call_count": 0,
                        "error": f"TypeScript file not found: {ts_file}",
                    }
                )
            )
            sys.exit(1)

        result = run_ts_example(ts_file, sdk_dir)
        print(json.dumps(result, indent=2))
        sys.exit(0 if result["success"] else 1)

    # Normal mode: run a .mjs file against mock harness
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "calls": [],
                    "call_count": 0,
                    "error": "Usage: validate_javascript.py <js_file> [harness_dir] [sdk_dir]",
                }
            )
        )
        sys.exit(1)

    js_file = sys.argv[1]
    harness_dir = sys.argv[2] if len(sys.argv) > 2 else None
    sdk_dir = sys.argv[3] if len(sys.argv) > 3 else None

    if not os.path.isfile(js_file):
        print(
            json.dumps(
                {
                    "success": False,
                    "calls": [],
                    "call_count": 0,
                    "error": f"JavaScript file not found: {js_file}",
                }
            )
        )
        sys.exit(1)

    result = run_js_file(js_file, harness_dir, sdk_dir)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
