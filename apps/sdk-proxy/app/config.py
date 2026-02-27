"""Network configuration for the SDK proxy."""

import os

NETWORK_ENDPOINTS = {
    "mainnet": "https://mainnet.accumulatenetwork.io",
    "testnet": "https://testnet.accumulatenetwork.io",
    "devnet": "https://devnet.accumulatenetwork.io",
    "kermit": "https://kermit.accumulatenetwork.io",
    "local": "http://localhost:26660",
}


def get_network_endpoint() -> str:
    """Get the Accumulate network endpoint from environment or default to testnet."""
    network = os.getenv("ACCUMULATE_NETWORK", "testnet")
    return NETWORK_ENDPOINTS.get(network, NETWORK_ENDPOINTS["testnet"])


def get_network_name() -> str:
    """Get the current network name."""
    return os.getenv("ACCUMULATE_NETWORK", "testnet")
