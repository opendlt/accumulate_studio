#!/usr/bin/env python3
"""
Python Code Validation Harness

Runs any Python file (generated or SDK example) without a network by mocking
all HTTP calls. Captures RPC call sequences and outputs a JSON report.

Usage:
    python validate_python.py <python_file>

Output (JSON to stdout):
    {"success": true, "calls": [...], "call_count": N, "error": null}
"""

import importlib.util
import json
import sys
import types
import unittest.mock as mock


def make_mock_response(json_data):
    """Create a mock requests.Response with the given JSON data."""
    resp = types.SimpleNamespace()
    resp.status_code = 200
    resp.ok = True
    resp.text = json.dumps(json_data)
    resp.json = lambda: json_data
    resp.raise_for_status = lambda: None
    return resp


def route_rpc(method, params, calls_log):
    """Route a JSON-RPC call to the appropriate mock response."""
    entry = {"method": method}
    if params:
        entry["params"] = params

    calls_log.append(entry)

    if method == "faucet":
        idx = len(calls_log)
        return {
            "jsonrpc": "2.0",
            "result": {
                "type": "faucet",
                "txid": f"mock-faucet-tx-{idx:04d}",
            },
            "id": 1,
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
                "id": 1,
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
                "id": 1,
            }
        # Fallback for other queries
        return {
            "jsonrpc": "2.0",
            "result": {"status": {"delivered": True}},
            "id": 1,
        }

    if method == "network-status":
        return {
            "jsonrpc": "2.0",
            "result": {"oracle": {"price": 50000000}},
            "id": 1,
        }

    if method == "submit":
        idx = len(calls_log)
        return {
            "jsonrpc": "2.0",
            "result": [{"status": {"txID": f"0000000000000000000000000000000000000000000000000000000000{idx:06d}"}}],
            "id": 1,
        }

    # Default catch-all
    return {"jsonrpc": "2.0", "result": {}, "id": 1}


def run_file(filepath):
    """Run a Python file's main() under mock, capturing all RPC calls."""
    calls = []

    def mock_session_post(self, url, **kwargs):
        """Mock for requests.Session.post (V3 client calls)."""
        json_data = kwargs.get("json") or {}
        # V3 can batch calls as a list
        if isinstance(json_data, list):
            results = []
            for item in json_data:
                method = item.get("method", "unknown")
                params = item.get("params", {})
                resp = route_rpc(method, params, calls)
                results.append(resp.get("result", {}))
            return make_mock_response(results)
        method = json_data.get("method", "unknown")
        params = json_data.get("params", {})
        return make_mock_response(route_rpc(method, params, calls))

    def mock_requests_post(url, **kwargs):
        """Mock for requests.post (direct faucet calls in SDK examples)."""
        json_data = kwargs.get("json") or {}
        method = json_data.get("method", "unknown")
        params = json_data.get("params", {})
        return make_mock_response(route_rpc(method, params, calls))

    def mock_sleep(_seconds):
        """No-op sleep to speed up execution."""
        pass

    # Load the module from file
    spec = importlib.util.spec_from_file_location("target_module", filepath)
    if spec is None or spec.loader is None:
        return {"success": False, "calls": [], "call_count": 0, "error": f"Cannot load {filepath}"}

    module = importlib.util.module_from_spec(spec)

    # Install the module so internal imports within the target work
    sys.modules["target_module"] = module

    # Apply mocks and run
    with mock.patch("requests.Session.post", mock_session_post), \
         mock.patch("requests.post", mock_requests_post), \
         mock.patch("time.sleep", mock_sleep):
        try:
            spec.loader.exec_module(module)
            if hasattr(module, "main"):
                module.main()
            return {"success": True, "calls": calls, "call_count": len(calls), "error": None}
        except SystemExit:
            # Some scripts may call sys.exit(0) on success
            return {"success": True, "calls": calls, "call_count": len(calls), "error": None}
        except Exception as exc:
            return {"success": False, "calls": calls, "call_count": len(calls), "error": str(exc)}
        finally:
            sys.modules.pop("target_module", None)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "calls": [], "call_count": 0, "error": "Usage: validate_python.py <file>"}))
        sys.exit(1)

    filepath = sys.argv[1]
    result = run_file(filepath)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
