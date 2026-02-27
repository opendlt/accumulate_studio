#!/usr/bin/env python3
"""
Rust Code Validation Harness

Runs a compiled Rust binary without a network by starting a local mock HTTP
server that responds to JSON-RPC requests. Captures RPC call sequences and
outputs a JSON report.

Usage:
    python validate_rust.py <rust_binary>

Output (JSON to stdout):
    {"success": true, "calls": [...], "call_count": N, "error": null}
"""

import http.server
import json
import os
import subprocess
import sys
import threading


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


def run_binary(binary_path):
    """Run a Rust binary against a local mock HTTP server."""
    # Reset call log
    MockRPCHandler.calls_log = []

    # Start mock server on random port
    server = http.server.HTTPServer(("127.0.0.1", 0), MockRPCHandler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    mock_url = f"http://127.0.0.1:{port}"

    # Set environment variables for the Rust binary
    env = os.environ.copy()
    env["ACCUMULATE_V2_URL"] = mock_url
    env["ACCUMULATE_V3_URL"] = mock_url

    try:
        result = subprocess.run(
            [binary_path],
            env=env,
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
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "calls": [],
                    "call_count": 0,
                    "error": "Usage: validate_rust.py <binary_path>",
                }
            )
        )
        sys.exit(1)

    binary_path = sys.argv[1]
    if not os.path.isfile(binary_path):
        print(
            json.dumps(
                {
                    "success": False,
                    "calls": [],
                    "call_count": 0,
                    "error": f"Binary not found: {binary_path}",
                }
            )
        )
        sys.exit(1)

    result = run_binary(binary_path)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
