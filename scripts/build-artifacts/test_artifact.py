import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from artifact import create_metadata, main, package_dotnet, package_functions


ROOT = Path(__file__).resolve().parents[2]
SHA = "a" * 40
REPOSITORY = "Learner/Workshop"


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def file(self, name, content="fixture"):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content, encoding="utf-8")
        return file

    def dotnet(self):
        for name in (
            "HandoverApp.dll",
            "HandoverApp.deps.json",
            "HandoverApp.runtimeconfig.json",
            "wwwroot/app.css",
            "wwwroot/_framework/app.js",
        ):
            self.file(f"publish/{name}")
        archive = self.root / "dist/deployment.zip"
        package_dotnet(self.root / "publish", archive)
        return archive

    def test_dotnet_archive_is_flat_and_preserves_static_assets(self):
        archive = self.dotnet()
        with zipfile.ZipFile(archive) as package:
            self.assertEqual(
                set(package.namelist()),
                {
                    "HandoverApp.dll",
                    "HandoverApp.deps.json",
                    "HandoverApp.runtimeconfig.json",
                    "wwwroot/app.css",
                    "wwwroot/_framework/app.js",
                },
            )
        first = archive.read_bytes()
        package_dotnet(self.root / "publish", archive)
        self.assertEqual(first, archive.read_bytes())

    def test_dotnet_rejects_unpublished_source(self):
        self.file("source/Program.cs")
        with self.assertRaisesRegex(ValueError, "Missing published"):
            package_dotnet(self.root / "source", self.root / "deployment.zip")

    def test_functions_archive_is_clean_and_keeps_linux_dependencies(self):
        for name in (
            "function_app.py",
            "host.json",
            "requirements.txt",
            "order_events/__init__.py",
            "order_events/normalizer/receipts.py",
            "tests/test_app.py",
            "local.settings.json",
            ".venv/bin/python",
            "repair-output.txt",
            "order_events/__pycache__/app.pyc",
        ):
            self.file(f"app/{name}")
        for name in (
            "azure/functions/__init__.py",
            "azure/identity/__init__.py",
            "azure/servicebus/__init__.py",
            "azure/data/tables/__init__.py",
            "cryptography/hazmat/bindings/_rust.abi3.so",
            "cryptography-1.dist-info/METADATA",
            "azure/__pycache__/app.pyc",
        ):
            self.file(f"deps/{name}")
        archive = self.root / "deployment.zip"
        package_functions(self.root / "app", self.root / "deps", archive)
        with zipfile.ZipFile(archive) as package:
            names = set(package.namelist())
            self.assertEqual(
                names,
                {
                    "function_app.py",
                    "host.json",
                    "requirements.txt",
                    "order_events/__init__.py",
                    "order_events/normalizer/receipts.py",
                    ".python_packages/lib/site-packages/azure/functions/__init__.py",
                    ".python_packages/lib/site-packages/azure/identity/__init__.py",
                    ".python_packages/lib/site-packages/azure/servicebus/__init__.py",
                    ".python_packages/lib/site-packages/azure/data/tables/__init__.py",
                    ".python_packages/lib/site-packages/cryptography/hazmat/bindings/_rust.abi3.so",
                    ".python_packages/lib/site-packages/cryptography-1.dist-info/METADATA",
                },
            )

    def test_functions_rejects_missing_dependencies(self):
        for name in (
            "function_app.py",
            "host.json",
            "requirements.txt",
            "order_events/__init__.py",
        ):
            self.file(f"app/{name}")
        self.file("deps/not-azure.py")
        with self.assertRaisesRegex(ValueError, "Missing packaged dependency"):
            package_functions(
                self.root / "app", self.root / "deps", self.root / "deployment.zip"
            )

    def test_zip_metadata_binds_repository_source_variant_runtime_and_actual_bytes(
        self,
    ):
        archive = self.dotnet()
        metadata = create_metadata(
            REPOSITORY, "cloud-agent-handover", SHA, "application", archive
        )
        self.assertEqual(
            metadata,
            {
                "schemaVersion": 1,
                "repository": REPOSITORY,
                "scenario": "cloud-agent-handover",
                "sourceSha": SHA,
                "variant": "application",
                "runtime": "dotnet-10-linux-x64",
                "files": [
                    {
                        "path": "deployment.zip",
                        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                        "size": len(archive.read_bytes()),
                    }
                ],
            },
        )
        old_hash = metadata["files"][0]["sha256"]
        with zipfile.ZipFile(archive, "a") as package:
            package.writestr("extra.txt", "different")
        self.assertNotEqual(
            old_hash,
            create_metadata(
                REPOSITORY,
                "cloud-agent-handover",
                SHA,
                "application",
                archive,
            )["files"][0]["sha256"],
        )

    def test_all_latency_variants_use_existing_packager_and_never_substitute_reviewed_source(
        self,
    ):
        capsule = ROOT / "scenarios/appservice-latency-context"
        actual = {}
        for variant in ("healthy", "faulty", "reviewed-source"):
            destination = self.root / variant
            subprocess.run(
                [
                    "node",
                    str(capsule / "scripts/build-artifact.mjs"),
                    variant,
                    str(destination),
                ],
                check=True,
                capture_output=True,
            )
            archive = destination / "deployment.zip"
            metadata = create_metadata(REPOSITORY, capsule.name, SHA, variant, archive)
            self.assertEqual(metadata["variant"], variant)
            self.assertEqual(metadata["runtime"], "php-8.3-linux")
            with zipfile.ZipFile(archive) as package:
                self.assertEqual(
                    set(package.namelist()),
                    {
                        "index.php",
                        "timing.php",
                        "telemetry.php",
                        "nginx.conf",
                        "deployment.json",
                    },
                )
                timing = package.read("timing.php")
                actual[variant] = timing
                expected = capsule / (
                    "src/timing.php"
                    if variant == "reviewed-source"
                    else f"tests/fixtures/timing-{variant}.php"
                )
                self.assertEqual(timing, expected.read_bytes())
                revision = json.loads(package.read("deployment.json"))["revision"]
                self.assertEqual(
                    revision,
                    {
                        "healthy": "baseline-v1",
                        "faulty": "candidate-v2",
                        "reviewed-source": "reviewed-source",
                    }[variant],
                )
        self.assertNotEqual(actual["healthy"], actual["faulty"])

    def test_latency_unknown_variant_fails(self):
        result = subprocess.run(
            [
                "node",
                str(
                    ROOT
                    / "scenarios/appservice-latency-context/scripts/build-artifact.mjs"
                ),
                "reviewed",
                str(self.root / "bad"),
            ],
            capture_output=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "bad/deployment.zip").exists())

    def test_container_metadata_records_digest_not_mutable_tag(self):
        for scenario in ("cosmos-rbac-removal", "workload-identity-break"):
            image = f"ghcr.io/{REPOSITORY.lower()}/{scenario}/app"
            digest = "sha256:" + "b" * 64
            metadata = create_metadata(
                REPOSITORY,
                scenario,
                SHA,
                "application",
                image=image,
                digest=digest,
            )
            self.assertEqual(metadata["files"], [])
            self.assertEqual(metadata["runtime"], "linux/amd64")
            self.assertEqual(
                metadata["image"], {"reference": f"{image}@{digest}", "digest": digest}
            )
            for bad_image, bad_digest in (
                (image, "latest"),
                (image, "sha256:abc"),
                (image + ":latest", digest),
                ("ghcr.io/other/repo/app", digest),
            ):
                with self.assertRaises(ValueError):
                    create_metadata(
                        REPOSITORY,
                        scenario,
                        SHA,
                        "application",
                        image=bad_image,
                        digest=bad_digest,
                    )

    def test_invalid_source_and_scenario_variant_bindings_fail_closed(self):
        archive = self.dotnet()
        for repo, scenario, sha, variant in (
            ("not-a-repository", "cloud-agent-handover", SHA, "application"),
            (REPOSITORY, "unknown", SHA, "application"),
            (REPOSITORY, "cloud-agent-handover", "main", "application"),
            (REPOSITORY, "cloud-agent-handover", "A" * 40, "application"),
            (REPOSITORY, "cloud-agent-handover", SHA, "faulty"),
            (REPOSITORY, "appservice-latency-context", SHA, "application"),
        ):
            with self.assertRaises(ValueError):
                create_metadata(repo, scenario, sha, variant, archive)

    def test_unsafe_archive_paths_are_rejected(self):
        for name in ("../escape", "/absolute", "nested\\windows"):
            archive = self.root / "deployment.zip"
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr(name, "unsafe")
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                create_metadata(
                    REPOSITORY, "cloud-agent-handover", SHA, "application", archive
                )

    def test_cli_rejects_pr_events_mismatched_sha_and_non_main_reviewed_source(self):
        archive = self.dotnet()
        output = self.root / "metadata.json"
        env = {
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_SHA": SHA,
            "GITHUB_REPOSITORY": REPOSITORY,
            "GITHUB_RUN_ID": "123",
            "GITHUB_RUN_ATTEMPT": "2",
            "GITHUB_REF": "refs/heads/main",
        }
        argv = [
            "artifact.py",
            "metadata",
            "--scenario",
            "cloud-agent-handover",
            "--variant",
            "application",
            "--archive",
            str(archive),
            "--output",
            str(output),
        ]
        with (
            patch.dict(os.environ, env),
            patch("sys.argv", argv),
            patch(
                "artifact.subprocess.check_output",
                return_value=SHA + "\n",
            ),
        ):
            main()
            metadata = json.loads(output.read_text())
            self.assertEqual(metadata["sourceSha"], SHA)
            self.assertEqual(
                metadata["build"],
                {
                    "runId": "123",
                    "runAttempt": "2",
                    "event": "workflow_dispatch",
                    "ref": "refs/heads/main",
                },
            )
            for event in ("pull_request", "pull_request_target", "workflow_run"):
                with patch.dict(os.environ, {"GITHUB_EVENT_NAME": event}):
                    with self.assertRaisesRegex(ValueError, "Only push"):
                        main()
            with patch.dict(os.environ, {"GITHUB_SHA": "b" * 40}):
                with self.assertRaisesRegex(ValueError, "differs"):
                    main()
            argv[3] = "appservice-latency-context"
            argv[5] = "reviewed-source"
            with patch.dict(os.environ, {"GITHUB_REF": "refs/tags/reviewed"}):
                with self.assertRaisesRegex(ValueError, "must come from main"):
                    main()


if __name__ == "__main__":
    unittest.main()
