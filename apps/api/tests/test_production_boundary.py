"""Exercise the proxy configuration actually shipped in the production command."""

import json
from pathlib import Path
import re

from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from test_accounts import client, PASSWORD, ORIGIN  # noqa: F401
from unifr_api.main import app


def production_app():
    compose = Path("compose.production.yaml").read_text()
    override = re.search(r'command: (\["uvicorn"[^\n]+)', compose)
    command = json.loads(
        override[1]
        if override
        else re.search(r"CMD (.+)", Path("apps/api/Dockerfile").read_text())[1]
    )
    if "--no-proxy-headers" in command:
        return app
    assert "--proxy-headers" in command
    trusted = command[command.index("--forwarded-allow-ips") + 1]
    assert trusted == "172.30.85.2"  # one gateway address, never a network or wildcard
    assert "ipv4_address: 172.30.85.2" in compose
    assert "reverse_proxy api-proxy:8000" in Path("deploy/Caddy.production").read_text()
    return ProxyHeadersMiddleware(app, trusted_hosts=trusted)


def attempt(peer, forwarded, username):
    with TestClient(production_app(), client=(peer, 1234), base_url=ORIGIN) as browser:
        return browser.post(
            "/api/v1/account/login",
            headers={"Origin": ORIGIN, "X-Forwarded-For": forwarded},
            json={"username": username, "password": PASSWORD},
        ).status_code


def test_two_clients_via_production_gateway_do_not_share_ip_bucket(client):  # noqa: F811
    for index in range(30):
        assert attempt("172.30.85.2", "198.51.100.10", f"absent{index}") == 401
    assert attempt("172.30.85.2", "198.51.100.10", "limit") == 429
    assert attempt("172.30.85.2", "198.51.100.11", "other") == 401


def test_untrusted_peer_cannot_rotate_forwarded_header_to_escape_bucket(client):  # noqa: F811
    for index in range(30):
        assert attempt("198.51.100.12", f"203.0.113.{index + 1}", f"absent{index}") == 401
    assert attempt("198.51.100.12", "203.0.113.99", "limit") == 429
