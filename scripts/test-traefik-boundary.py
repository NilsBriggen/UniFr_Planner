"""Exercise the shipped Caddy configuration on an isolated Docker network.

Usage: uv run python scripts/test-traefik-boundary.py --release <built image revision>
Run separately from browser tests: Docker network changes can interrupt Chromium requests.
"""

import argparse
import ipaddress
import json
from pathlib import Path
import subprocess
import uuid


def docker(*args: str) -> str:
    return subprocess.check_output(["docker", *args], text=True).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True)
    release = parser.parse_args().release
    name = "unifr-boundary-" + uuid.uuid4().hex[:10]
    config = Path(__file__).resolve().parents[1] / "deploy/Caddy.traefik"
    containers: list[str] = []
    docker("network", "create", name)
    try:
        network = json.loads(docker("network", "inspect", name))[0]
        subnet = ipaddress.ip_network(network["IPAM"]["Config"][0]["Subnet"])
        trusted, gateway, backend, untrusted = (str(subnet[i]) for i in (2, 3, 4, 5))
        echo = """
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps(dict(self.headers)).encode())
HTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
"""
        containers.append(name + "-echo")
        docker(
            "run",
            "-d",
            "--name",
            containers[-1],
            "--network",
            name,
            "--ip",
            backend,
            "--network-alias",
            "api-proxy",
            "--entrypoint",
            "python",
            f"unifr-planner-api:{release}",
            "-c",
            echo,
        )
        containers.append(name + "-caddy")
        docker(
            "run",
            "-d",
            "--name",
            containers[-1],
            "--network",
            name,
            "--ip",
            gateway,
            "-e",
            f"TRAEFIK_IP={trusted}",
            "-v",
            f"{config}:/etc/caddy/Caddyfile:ro",
            f"unifr-planner-caddy:{release}",
            "caddy",
            "run",
            "--config",
            "/etc/caddy/Caddyfile",
        )
        probe = """
import json, sys, time, urllib.request, urllib.error
gateway, trusted, mode = sys.argv[1:]
for attempt in range(30):
    try:
        urllib.request.urlopen('http://' + gateway + ':8081/health', timeout=2)
        break
    except urllib.error.URLError:
        time.sleep(0.1)
else:
    raise AssertionError('Caddy did not start')
if mode == 'trusted':
    for chain, expected in [('198.51.100.10', '198.51.100.10'),
                            ('192.0.2.66, 198.51.100.10', '198.51.100.10'),
                            ('198.51.100.11', '198.51.100.11')]:
        request = urllib.request.Request('http://' + gateway + ':8080/api/probe', headers={
            'X-Forwarded-For': chain, 'X-Forwarded-Proto': 'http',
            'Forwarded': 'for=192.0.2.99;proto=http'})
        with urllib.request.urlopen(request, timeout=5) as response:
            headers = {k.lower(): v for k, v in json.load(response).items()}
        assert headers['x-forwarded-for'] == expected, headers
        assert headers['x-forwarded-proto'] == 'https', headers
        assert 'forwarded' not in headers, headers
        print('PASS trusted peer:', expected, 'HTTPS enforced; forged prefix ignored')
else:
    for path in ['/api/probe', '/']:
        request = urllib.request.Request('http://' + gateway + ':8080' + path,
                                         headers={'X-Forwarded-For': trusted})
        try:
            urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            assert error.code == 403, error
        else:
            raise AssertionError('Untrusted peer reached ' + path)
        print('PASS untrusted peer refused:', path)
"""
        for address, mode in ((trusted, "trusted"), (untrusted, "untrusted")):
            print(
                docker(
                    "run",
                    "--rm",
                    "--network",
                    name,
                    "--ip",
                    address,
                    "--entrypoint",
                    "python",
                    f"unifr-planner-api:{release}",
                    "-c",
                    probe,
                    gateway,
                    trusted,
                    mode,
                )
            )
    finally:
        for container in reversed(containers):
            subprocess.run(["docker", "rm", "-f", container], check=False, capture_output=True)
        docker("network", "rm", name)


if __name__ == "__main__":
    main()
