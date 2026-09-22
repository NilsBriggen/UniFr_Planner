"""Exercise shipped proxy/static compression with an isolated local Caddy process.

Usage: python scripts/test-response-compression.py --image unifr-planner-caddy:<revision>
Only local disposable containers and a temporary public-data fixture are used.
"""

import argparse
import gzip
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--sample", type=Path, help="Optional captured public discovery JSON")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    payload = (
        args.sample.read_bytes()
        if args.sample
        else json.dumps(
            {"courses": [{"title": "Programming", "dates": ["2026-09-22"] * 20}] * 1000}
        ).encode()
    )

    class Backend(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_args: object) -> None:
            pass

    backend = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
    threading.Thread(target=backend.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="unifr-compression-") as directory:
            temporary = Path(directory)
            temporary.chmod(0o755)
            (temporary / "index.html").write_bytes(payload)
            for variant in ("production", "traefik", "web"):
                port, health = free_port(), free_port()
                config = (root / "deploy" / f"Caddy.{variant}").read_text()
                config = config.replace(":8080 {", f"http://127.0.0.1:{port} {{")
                config = config.replace(":8081 {", f"http://127.0.0.1:{health} {{")
                config = config.replace("api-proxy:8000", f"127.0.0.1:{backend.server_port}")
                config_path = temporary / "Caddyfile"
                config_path.write_text(config)
                name = "unifr-compression-" + uuid.uuid4().hex[:10]
                process = subprocess.Popen(
                    [
                        "docker",
                        "run",
                        "--rm",
                        "--name",
                        name,
                        "--network",
                        "host",
                        "-e",
                        f"SITE_ADDRESS=http://127.0.0.1:{port}",
                        "-e",
                        "TRAEFIK_IP=127.0.0.1",
                        "-e",
                        "TLS_EMAIL=audit@example.invalid",
                        "-v",
                        f"{config_path}:/etc/caddy/Caddyfile:ro",
                        "-v",
                        f"{temporary}:/srv:ro",
                        args.image,
                        "caddy",
                        "run",
                        "--config",
                        "/etc/caddy/Caddyfile",
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                )
                try:
                    url = f"http://127.0.0.1:{port}" + (
                        "/" if variant == "web" else "/api/v1/catalogue/discovery?term=AS-2026"
                    )
                    for _attempt in range(80):
                        if process.poll() is not None:
                            raise AssertionError(process.stderr.read().decode())
                        try:
                            with urllib.request.urlopen(url, timeout=1) as response:
                                assert response.read() == payload
                            break
                        except OSError:
                            time.sleep(0.1)
                    else:
                        raise AssertionError(f"{variant} Caddy did not start")
                    request = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
                    with urllib.request.urlopen(request, timeout=5) as response:
                        encoded = response.read()
                        assert response.headers.get("Content-Encoding") == "gzip", response.headers
                        assert "accept-encoding" in response.headers.get("Vary", "").lower()
                        assert gzip.decompress(encoded) == payload
                        assert len(encoded) < len(payload) / 2
                        if args.sample:
                            assert len(encoded) < 1_500_000
                    if variant != "web":
                        request = urllib.request.Request(
                            f"http://127.0.0.1:{port}/api/v1/account/me",
                            headers={"Accept-Encoding": "gzip"},
                        )
                        with urllib.request.urlopen(request, timeout=5) as response:
                            assert response.headers.get("Content-Encoding") is None
                            assert response.read() == payload
                    print(
                        f"PASS {variant}: {len(payload)} -> {len(encoded)} bytes; identical decoded content"
                    )
                finally:
                    subprocess.run(["docker", "rm", "-f", name], capture_output=True, check=False)
                    process.wait(timeout=10)
    finally:
        backend.shutdown()
        backend.server_close()


if __name__ == "__main__":
    main()
