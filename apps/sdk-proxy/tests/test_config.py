"""Unit tests for network/security configuration and request validation."""

import pytest
from pydantic import ValidationError

from app import config
from app.models import FaucetRequest


def test_mainnet_blocked_without_allow(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "mainnet")
    monkeypatch.delenv("ALLOW_MAINNET", raising=False)
    with pytest.raises(RuntimeError):
        config.assert_network_allowed()


def test_mainnet_allowed_with_flag(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "mainnet")
    monkeypatch.setenv("ALLOW_MAINNET", "true")
    config.assert_network_allowed()        # should not raise
    assert config.is_mainnet() is True


def test_unknown_network_rejected(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "nope")
    with pytest.raises(RuntimeError):
        config.assert_network_allowed()


def test_testnet_ok(monkeypatch):
    monkeypatch.setenv("ACCUMULATE_NETWORK", "testnet")
    config.assert_network_allowed()
    assert config.is_mainnet() is False


def test_allowed_origins_explicit(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.app, https://b.app")
    assert config.allowed_origins() == ["https://a.app", "https://b.app"]


def test_allowed_origins_defaults_to_dev(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    origins = config.allowed_origins()
    assert "http://localhost:3000" in origins


def test_faucet_times_capped():
    with pytest.raises(ValidationError):
        FaucetRequest(session_id="s", account="acc://x", times=99)
    with pytest.raises(ValidationError):
        FaucetRequest(session_id="s", account="acc://x", times=0)
    # In-range values are accepted.
    assert FaucetRequest(session_id="s", account="acc://x", times=5).times == 5
