#!/usr/bin/env python3
"""
C# Code Validation Harness

Runs a C# (.cs) file against a local mock HTTP server by copying it into a
.NET project and executing with ``dotnet run``. Captures RPC call sequences
and outputs a JSON report.

Usage:
    python validate_csharp.py <cs_file> [harness_dir]

    # Run an SDK example directly:
    python validate_csharp.py --example <example_dir>

Output (JSON to stdout):
    {"success": true, "calls": [...], "call_count": N, "error": null}
"""

import http.server
import json
import os
import shutil
import subprocess
import sys
import threading


# ── Default paths ─────────────────────────────────────────────────────────
DEFAULT_HARNESS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "csharp-harness"
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


def run_cs_file(cs_file, harness_dir=None):
    """Run a C# file against a local mock HTTP server.

    The .cs file is temporarily included in the harness .csproj project
    via a <Compile Include="..."/> reference, then executed with ``dotnet run``.
    """
    MockRPCHandler.calls_log = []

    if harness_dir is None:
        harness_dir = DEFAULT_HARNESS_DIR

    cs_file_abs = os.path.abspath(cs_file)

    # Start mock server on random port
    server = http.server.HTTPServer(("127.0.0.1", 0), MockRPCHandler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    mock_url = f"http://127.0.0.1:{port}"

    # Set environment variable for the dotnet process (single base URL)
    env = os.environ.copy()
    env["ACCUMULATE_BASE_URL"] = mock_url

    # Write a temporary csproj that includes just this one file
    tmp_csproj = os.path.join(harness_dir, "CSharpHarness.csproj.bak")
    orig_csproj = os.path.join(harness_dir, "CSharpHarness.csproj")

    # Read the original csproj
    with open(orig_csproj, "r") as f:
        csproj_content = f.read()

    # Temporarily modify csproj to include the target file
    # Replace EnableDefaultCompileItems to keep it false, add explicit include
    cs_file_escaped = cs_file_abs.replace("&", "&amp;")
    modified_csproj = csproj_content.replace(
        "</Project>",
        f'  <ItemGroup>\n    <Compile Include="{cs_file_escaped}" />\n  </ItemGroup>\n</Project>',
    )

    try:
        # Write modified csproj
        shutil.copy2(orig_csproj, tmp_csproj)
        with open(orig_csproj, "w") as f:
            f.write(modified_csproj)

        result = subprocess.run(
            ["dotnet", "run", "--project", harness_dir],
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
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
            "error": "Process timed out after 120 seconds",
        }
    except Exception as exc:
        return {
            "success": False,
            "calls": MockRPCHandler.calls_log[:],
            "call_count": len(MockRPCHandler.calls_log),
            "error": str(exc),
        }
    finally:
        # Restore original csproj
        if os.path.exists(tmp_csproj):
            shutil.move(tmp_csproj, orig_csproj)
        server.shutdown()


def run_example(example_dir):
    """Run a C# SDK example project directly against the mock server.

    Used for baseline capture — the example has its own .csproj with
    ProjectReference to the SDK.
    """
    MockRPCHandler.calls_log = []

    server = http.server.HTTPServer(("127.0.0.1", 0), MockRPCHandler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    mock_url = f"http://127.0.0.1:{port}"

    env = os.environ.copy()
    env["ACCUMULATE_BASE_URL"] = mock_url

    try:
        result = subprocess.run(
            ["dotnet", "run", "--project", example_dir],
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
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
            "error": "Process timed out after 120 seconds",
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
    # Support --example mode for running SDK examples (baseline capture)
    if len(sys.argv) >= 2 and sys.argv[1] == "--example":
        if len(sys.argv) < 3:
            print(
                json.dumps(
                    {
                        "success": False,
                        "calls": [],
                        "call_count": 0,
                        "error": "Usage: validate_csharp.py --example <example_dir>",
                    }
                )
            )
            sys.exit(1)

        example_dir = sys.argv[2]
        if not os.path.isdir(example_dir):
            print(
                json.dumps(
                    {
                        "success": False,
                        "calls": [],
                        "call_count": 0,
                        "error": f"Example directory not found: {example_dir}",
                    }
                )
            )
            sys.exit(1)

        result = run_example(example_dir)
        print(json.dumps(result, indent=2))
        sys.exit(0 if result["success"] else 1)

    # Normal mode: run a .cs file against mock harness
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "calls": [],
                    "call_count": 0,
                    "error": "Usage: validate_csharp.py <cs_file> [harness_dir]",
                }
            )
        )
        sys.exit(1)

    cs_file = sys.argv[1]
    harness_dir = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.isfile(cs_file):
        print(
            json.dumps(
                {
                    "success": False,
                    "calls": [],
                    "call_count": 0,
                    "error": f"C# file not found: {cs_file}",
                }
            )
        )
        sys.exit(1)

    result = run_cs_file(cs_file, harness_dir)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
