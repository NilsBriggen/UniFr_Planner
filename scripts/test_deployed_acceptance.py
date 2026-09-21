"""Dependency-free safety controls; Docker, HTTP and browser processes are stubbed."""

import contextlib
import importlib.util
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class AcceptanceRunnerTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("run-deployed-acceptance.py")
        self.assertTrue(source.exists(), "guarded acceptance runner is missing")
        spec = importlib.util.spec_from_file_location("acceptance", source)
        self.runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.runner)
        self.root = source.parent.parent.resolve()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.envfile = Path(self.tmp.name) / "local acceptance.env"
        self.envfile.write_text("UNIFR_ADMIN_TOKEN=synthetic-private-token\n")
        self.sha = "a" * 40
        self.config = {
            "name": "unifr-production",
            "services": {
                "caddy": {
                    "environment": {"SITE_ADDRESS": "http://127.0.0.1:8080"},
                    "ports": [
                        {"host_ip": "127.0.0.1", "target": 8080, "published": "4173"},
                        {"host_ip": "127.0.0.1", "target": 8443, "published": "4443"},
                    ],
                },
                "api": {
                    "environment": {
                        "UNIFR_ACCOUNT_ORIGINS": '["http://127.0.0.1:4173"]',
                        "UNIFR_ADMIN_TOKEN": "synthetic-private-token",
                        "UNIFR_DATABASE_URL": "postgresql+psycopg://runtime:private-db-secret@db:5432/disposable_fixture",
                    }
                },
                "db": {
                    "environment": {
                        "POSTGRES_DB": "disposable_fixture",
                        "POSTGRES_USER": "bootstrap",
                    }
                },
            },
        }
        self.containers = []
        for service in ("db", "api", "web", "caddy"):
            labels = {
                "com.docker.compose.project": "unifr-production",
                "com.docker.compose.service": service,
                "com.docker.compose.project.working_dir": str(self.root),
                "com.docker.compose.project.config_files": str(
                    self.root / "compose.production.yaml"
                ),
                "org.opencontainers.image.revision": self.sha,
            }
            self.containers.append(
                {
                    "Id": service + "-id",
                    "State": {"Running": True},
                    "Config": {
                        "Labels": labels,
                        "Env": [
                            f"{k}={v}"
                            for k, v in self.config["services"]
                            .get(service, {})
                            .get("environment", {})
                            .items()
                        ],
                    },
                    "HostConfig": {"PortBindings": self.bindings() if service == "caddy" else {}},
                }
            )
        self.status = {"availability": "available", "development_fixture": True}
        self.commands = []
        self.fail_project = None
        self.database_markers = [True, True]

    def bindings(self):
        return {
            f"{p['target']}/tcp": [{"HostIp": p["host_ip"], "HostPort": p["published"]}]
            for p in self.config["services"]["caddy"]["ports"]
        }

    def process(self, command, **kwargs):
        self.commands.append((command, kwargs))
        if command[:2] == ["git", "rev-parse"]:
            output = self.sha
        elif "config" in command:
            output = json.dumps(self.config)
        elif "ps" in command:
            output = "\n".join(c["Id"] for c in self.containers)
        elif command[:2] == ["docker", "inspect"]:
            output = json.dumps(self.containers)
        elif command[:3] == ["docker", "context", "inspect"]:
            output = json.dumps("unix:///var/run/docker.sock")
        elif "exec" in command:
            if "catalogue_head" in kwargs.get("input", "") and not self.database_markers.pop(0):
                raise subprocess.CalledProcessError(3, command)
            output = "12\n"
        elif command[0] == "npm":
            if f"--project={self.fail_project}" in command:
                raise subprocess.CalledProcessError(7, command)
            output = ""
        else:
            self.fail(f"Unexpected process: {command}")
        return subprocess.CompletedProcess(command, 0, stdout=output, stderr="")

    def run_runner(self, **options):
        with (
            patch.object(self.runner.subprocess, "run", side_effect=self.process),
            patch.object(self.runner, "read_status", return_value=self.status),
            contextlib.redirect_stdout(io.StringIO()) as output,
        ):
            self.runner.run(self.envfile, Path(self.tmp.name) / "results", **options)
        return output.getvalue()

    def mutations(self):
        return [c for c, _ in self.commands if "exec" in c or c[0] == "npm"]

    def test_partitions_without_weakening_limits_and_preserves_secrets(self):
        with patch.dict(
            self.runner.os.environ, {"UNIFR_RELEASE_STRICT": "0", "UNIFR_RELEASE_KEEP_ACCOUNT": "1"}
        ):
            output = self.run_runner()
        actions = self.mutations()
        self.assertEqual(len(actions), 4)
        self.assertIn("exec", actions[0])
        self.assertIn("--project=desktop", actions[1])
        self.assertIn("exec", actions[2])
        self.assertIn("--project=phone", actions[3])
        reset_sql = next(
            options["input"] for command, options in self.commands if "exec" in command
        )
        self.assertIn("account_rate_limit", reset_sql)
        self.assertNotIn("account_user", reset_sql)
        self.assertNotIn("TRUNCATE", reset_sql)
        self.assertIn("db-id", actions[0])
        self.assertNotIn("synthetic-private-token", output)
        for command, kwargs in self.commands:
            self.assertNotIn("synthetic-private-token", " ".join(command))
            if command[0] in ("docker", "npm"):
                self.assertEqual(kwargs["env"]["RELEASE_ID"], self.sha)
            if command[0] == "npm":
                self.assertEqual(kwargs["env"]["UNIFR_E2E_ADMIN_TOKEN"], "synthetic-private-token")
                self.assertEqual(kwargs["env"]["UNIFR_RELEASE_STRICT"], "1")
                self.assertNotIn("UNIFR_RELEASE_KEEP_ACCOUNT", kwargs["env"])
                self.assertIn("--retries=0", command)

    def test_refuses_non_disposable_or_wrong_target_before_any_mutation(self):
        controls = (
            lambda: self.config["services"]["caddy"]["ports"][0].update(host_ip="0.0.0.0"),
            lambda: self.config["services"]["caddy"]["ports"][1].update(host_ip="0.0.0.0"),
            lambda: self.config["services"]["api"]["environment"].update(
                UNIFR_ACCOUNT_ORIGINS='["https://planner.example"]'
            ),
            lambda: self.config["services"]["caddy"]["ports"][0].update(published="9999"),
            lambda: self.status.update(development_fixture=False),
            lambda: self.status.update(availability="unavailable"),
            lambda: self.containers[0]["Config"]["Labels"].update(
                {"com.docker.compose.project.working_dir": "/some/other/repo"}
            ),
            lambda: self.containers[0]["Config"]["Labels"].update(
                {"com.docker.compose.project.config_files": "/some/other/compose.production.yaml"}
            ),
            lambda: self.containers[0]["Config"]["Labels"].update(
                {"com.docker.compose.project": "other-project"}
            ),
            lambda: self.containers[1]["Config"]["Labels"].update(
                {"org.opencontainers.image.revision": "old"}
            ),
            lambda: self.containers[1]["Config"].update(Env=["UNIFR_ADMIN_TOKEN=wrong"]),
            lambda: self.containers[3]["HostConfig"]["PortBindings"]["8080/tcp"][0].update(
                HostIp="0.0.0.0"
            ),
        )
        for mutate in controls:
            with self.subTest(control=controls.index(mutate)):
                self.setUp()
                mutate()
                with self.assertRaises(self.runner.Refused):
                    self.run_runner()
                self.assertEqual(self.mutations(), [])

    def test_desktop_failure_stops_before_second_reset_or_phone(self):
        self.fail_project = "desktop"
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_runner()
        self.assertEqual(len(self.mutations()), 2)

    def test_check_only_has_no_mutations(self):
        self.assertIn("no counters reset", self.run_runner(check_only=True))
        self.assertEqual(self.mutations(), [])

    def test_remote_docker_daemon_is_refused(self):
        with patch.dict(self.runner.os.environ, {"DOCKER_HOST": "tcp://remote:2375"}):
            with self.assertRaises(self.runner.Refused):
                self.run_runner()
        self.assertEqual(self.mutations(), [])

    def test_changed_fixture_between_projects_stops_before_second_reset(self):
        with (
            patch.object(self.runner.subprocess, "run", side_effect=self.process),
            patch.object(
                self.runner,
                "read_status",
                side_effect=[self.status, {"development_fixture": False}],
            ),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            with self.assertRaises(self.runner.Refused):
                self.runner.run(self.envfile, Path(self.tmp.name) / "results")
        self.assertEqual(len(self.mutations()), 2)

    def test_phone_failure_is_not_reported_as_success(self):
        self.fail_project = "phone"
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_runner()
        self.assertEqual(len(self.mutations()), 4)

    def test_failed_reset_never_starts_browser(self):
        def failed_reset(command, **kwargs):
            if "exec" in command:
                raise subprocess.CalledProcessError(3, command, stderr="synthetic-private-token")
            return self.process(command, **kwargs)

        with (
            patch.object(self.runner.subprocess, "run", side_effect=failed_reset),
            patch.object(self.runner, "read_status", return_value=self.status),
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                self.runner.run(self.envfile, Path(self.tmp.name) / "results")
        self.assertFalse(any(c[0] == "npm" for c, _ in self.commands))

    def test_cli_returns_external_failure_without_disclosing_captured_secrets(self):
        with (
            patch.object(
                self.runner.sys, "argv", ["runner", str(self.envfile), "--output", self.tmp.name]
            ),
            patch.object(
                self.runner,
                "run",
                side_effect=subprocess.CalledProcessError(
                    7,
                    ["docker"],
                    output="synthetic-private-token",
                    stderr="synthetic-private-token",
                ),
            ),
            contextlib.redirect_stderr(io.StringIO()) as error,
        ):
            self.assertEqual(self.runner.main(), 7)
        self.assertNotIn("synthetic-private-token", error.getvalue())

    def test_status_probe_cannot_follow_redirects(self):
        with self.assertRaises(self.runner.Refused):
            self.runner.NoRedirect().redirect_request(
                None, None, 302, "Found", {}, "https://public.example"
            )

    def test_database_identity_mismatches_refuse_before_reset_in_both_modes(self):
        for check_only in (False, True):
            for case in (
                "db-name",
                "db-user",
                "api-live",
                "wrong-host",
                "wrong-path",
                "empty-path",
                "wrong-port",
                "wrong-scheme",
                "query-host",
            ):
                with self.subTest(check_only=check_only, case=case):
                    self.setUp()
                    if case == "db-name":
                        self.containers[0]["Config"]["Env"] = [
                            "POSTGRES_DB=important_original_database",
                            "POSTGRES_USER=bootstrap",
                        ]
                    elif case == "db-user":
                        self.containers[0]["Config"]["Env"] = [
                            "POSTGRES_DB=disposable_fixture",
                            "POSTGRES_USER=other-bootstrap",
                        ]
                    elif case == "api-live":
                        self.containers[1]["Config"]["Env"][-1] = (
                            "UNIFR_DATABASE_URL=postgresql+psycopg://runtime:private-db-secret@db:5432/other"
                        )
                    else:
                        url = {
                            "wrong-host": "postgresql+psycopg://runtime:secret@remote:5432/disposable_fixture",
                            "wrong-path": "postgresql+psycopg://runtime:secret@db:5432/important_original_database",
                            "empty-path": "postgresql+psycopg://runtime:secret@db:5432/",
                            "wrong-port": "postgresql+psycopg://runtime:secret@db:9999/disposable_fixture",
                            "wrong-scheme": "sqlite:///disposable_fixture",
                            "query-host": "postgresql+psycopg://runtime:secret@db:5432/disposable_fixture?host=remote",
                        }[case]
                        self.config["services"]["api"]["environment"]["UNIFR_DATABASE_URL"] = url
                        self.containers[1]["Config"]["Env"][-1] = "UNIFR_DATABASE_URL=" + url
                    with self.assertRaises(self.runner.Refused):
                        self.run_runner(check_only=check_only)
                    self.assertEqual(self.mutations(), [])

    def test_reset_checks_actual_database_marker_in_locked_transaction(self):
        self.run_runner()
        resets = [(c, options) for c, options in self.commands if "exec" in c]
        for command, options in resets:
            self.assertIn("--single-transaction", command[-1])
            self.assertIn("-h /var/run/postgresql -p 5432", command[-1])
            sql = options.get("input", "")
            self.assertIn(
                "LOCK TABLE public.catalogue_head, public.catalogue_snapshot IN SHARE MODE", sql
            )
            self.assertIn("JOIN public.catalogue_snapshot", sql)
            self.assertIn("development-fixture-%", sql)
            self.assertIn("RAISE EXCEPTION", sql)
            self.assertLess(sql.index("RAISE EXCEPTION"), sql.index("DELETE FROM"))
            self.assertEqual(sql.count("DELETE FROM"), 1)
            self.assertIn("DELETE FROM public.account_rate_limit", sql)
            self.assertNotIn("private-db-secret", sql)

    def test_database_name_cannot_be_interpreted_as_libpq_connection_options(self):
        database_name = "host=remote"
        url = "postgresql+psycopg://runtime:secret@db:5432/host%3Dremote"
        self.config["services"]["api"]["environment"]["UNIFR_DATABASE_URL"] = url
        self.config["services"]["db"]["environment"]["POSTGRES_DB"] = database_name
        self.containers[0]["Config"]["Env"][0] = "POSTGRES_DB=" + database_name
        self.containers[1]["Config"]["Env"][-1] = "UNIFR_DATABASE_URL=" + url
        with self.assertRaises(self.runner.Refused):
            self.run_runner()
        self.assertEqual(self.mutations(), [])

    def test_missing_or_changed_database_marker_stops_before_browser(self):
        for markers, expected_browsers in (([False], 0), ([True, False], 1)):
            with self.subTest(markers=markers):
                self.setUp()
                self.database_markers = markers.copy()
                with self.assertRaises(subprocess.CalledProcessError):
                    self.run_runner()
                self.assertEqual(sum(c[0] == "npm" for c, _ in self.commands), expected_browsers)


if __name__ == "__main__":
    unittest.main()
