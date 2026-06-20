"""Tests for per-request network selection (X-Accumulate-Network)."""

import asyncio

import pytest
from fastapi import HTTPException

from app import config
from app.net import request_network


# --- allowed_networks ------------------------------------------------------

def test_allowed_networks_defaults_to_deploy(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    monkeypatch.delenv("ALLOWED_NETWORKS", raising=False)
    assert config.allowed_networks() == {"testnet"}


def test_allowed_networks_includes_extras_and_deploy(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    monkeypatch.setenv("ALLOWED_NETWORKS", "kermit,devnet")
    assert config.allowed_networks() == {"testnet", "kermit", "devnet"}


def test_allowed_networks_excludes_mainnet_without_flag(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    monkeypatch.setenv("ALLOWED_NETWORKS", "mainnet,kermit")
    monkeypatch.delenv("ALLOW_MAINNET", raising=False)
    assert "mainnet" not in config.allowed_networks()
    assert "kermit" in config.allowed_networks()


def test_allowed_networks_allows_mainnet_with_flag(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    monkeypatch.setenv("ALLOWED_NETWORKS", "mainnet")
    monkeypatch.setenv("ALLOW_MAINNET", "true")
    assert "mainnet" in config.allowed_networks()


def test_allowed_networks_drops_unknown(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    monkeypatch.setenv("ALLOWED_NETWORKS", "nonsense,kermit")
    assert config.allowed_networks() == {"testnet", "kermit"}


# --- get_client cache ------------------------------------------------------

def test_get_client_caches_and_distinguishes(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    import app.main as main_mod
    main_mod._clients = {}
    a = main_mod.get_client("testnet")
    b = main_mod.get_client("testnet")
    c = main_mod.get_client("kermit")
    d = main_mod.get_client(None)        # deploy network == testnet
    try:
        assert a is b                    # cached
        assert a is not c                # different network → different client
        assert d is a                    # None resolves to deploy network
    finally:
        for cl in main_mod._clients.values():
            cl.close()
        main_mod._clients = {}


# --- request_network dependency --------------------------------------------

def test_request_network_allows_header(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    monkeypatch.setenv("ALLOWED_NETWORKS", "testnet,kermit")
    assert asyncio.run(request_network("kermit")) == "kermit"


def test_request_network_defaults_to_deploy(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    monkeypatch.delenv("ALLOWED_NETWORKS", raising=False)
    assert asyncio.run(request_network(None)) == "testnet"


def test_request_network_rejects_disallowed(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    monkeypatch.setenv("ALLOWED_NETWORKS", "testnet")
    with pytest.raises(HTTPException) as ei:
        asyncio.run(request_network("kermit"))
    assert ei.value.status_code == 400


# --- integration through the app -------------------------------------------

def test_query_with_allowed_network_header(api):
    r = api.post(
        "/api/query",
        json={"url": "acc://x.acme"},
        headers={"X-Accumulate-Network": "kermit"},
    )
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_query_with_disallowed_network_header(api):
    r = api.post(
        "/api/query",
        json={"url": "acc://x.acme"},
        headers={"X-Accumulate-Network": "devnet"},  # not in ALLOWED_NETWORKS
    )
    assert r.status_code == 400


def test_health_reports_allowed_networks(api):
    r = api.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert "allowed" in body
    assert "testnet" in body["allowed"]
