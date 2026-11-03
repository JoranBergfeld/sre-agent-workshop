"""Build deployment archives and their exact-source Actions metadata."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile


CONTRACTS = {
    "cloud-agent-handover": {"application": "dotnet-10-linux-x64"},
    "azure-boards-copilot-handover": {"application": "python-3.12-linux-x64"},
    "appservice-latency-context": {
        "healthy": "php-8.3-linux",
        "faulty": "php-8.3-linux",
        "reviewed-source": "php-8.3-linux",
    },
    "cosmos-rbac-removal": {"application": "linux/amd64"},
    "workload-identity-break": {"application": "linux/amd64"},
}


def files_under(directory):
    root = Path(directory)
    if not root.is_dir() or root.is_symlink():
        raise ValueError(f"Not a regular directory: {root}")
    files = []
    for file in sorted(root.rglob("*")):
        if file.is_symlink():
            raise ValueError(f"Symlinks are not deployment files: {file}")
        if file.is_file() and "__pycache__" not in file.parts and file.suffix != ".pyc":
            files.append((file.relative_to(root).as_posix(), file))
    if not files:
        raise ValueError(f"No deployment files: {root}")
    return files


def write_zip(output, entries):
    destination = Path(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, file in sorted(entries):
            entry = zipfile.ZipInfo(name)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(
                entry, file if isinstance(file, bytes) else file.read_bytes()
            )


def package_dotnet(source, output):
    entries = files_under(source)
    names = {name for name, _ in entries}
    for required in (
        "HandoverApp.dll",
        "HandoverApp.deps.json",
        "HandoverApp.runtimeconfig.json",
    ):
        if required not in names:
            raise ValueError(f"Missing published application file: {required}")
    write_zip(output, entries)


def package_functions(source, dependencies, output, source_sha):
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise ValueError("Functions package requires a full source SHA")
    source = Path(source)
    entries = []
    for name in ("function_app.py", "host.json", "requirements.txt"):
        file = source / name
        if not file.is_file() or file.is_symlink():
            raise ValueError(f"Missing Functions deployment file: {name}")
        entries.append((name, file))
    entries.extend(
        (f"order_events/{name}", file)
        for name, file in files_under(source / "order_events")
    )
    dependency_files = files_under(dependencies)
    names = {name for name, _ in dependency_files}
    for required in (
        "azure/functions/__init__.py",
        "azure/identity/__init__.py",
        "azure/servicebus/__init__.py",
        "azure/data/tables/__init__.py",
    ):
        if required not in names:
            raise ValueError(f"Missing packaged dependency: {required}")
    entries.extend(
        (f".python_packages/lib/site-packages/{name}", file)
        for name, file in dependency_files
    )
    entries.append(
        ("build-revision.json", json.dumps({"sourceSha": source_sha}).encode("utf-8"))
    )
    write_zip(output, entries)


def create_metadata(
    repository, scenario, source_sha, variant, archive=None, image=None, digest=None
):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Repository must be owner/name")
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise ValueError("Source SHA must be a full lowercase Git commit SHA")
    if scenario not in CONTRACTS or variant not in CONTRACTS[scenario]:
        raise ValueError("Unsupported scenario/variant")
    container = scenario in ("cosmos-rbac-removal", "workload-identity-break")
    if container != bool(image) or container == bool(archive):
        raise ValueError(
            "Supply an archive for ZIP scenarios or an image for container scenarios"
        )
    result = {
        "schemaVersion": 1,
        "repository": repository,
        "scenario": scenario,
        "sourceSha": source_sha,
        "variant": variant,
        "runtime": CONTRACTS[scenario][variant],
        "files": [],
    }
    if archive:
        archive = Path(archive)
        if archive.name != "deployment.zip" or archive.is_symlink():
            raise ValueError("Archive must be a regular deployment.zip")
        with zipfile.ZipFile(archive) as package:
            names = package.namelist()
            if not names or len(names) != len(set(names)) or package.testzip():
                raise ValueError("Empty, duplicate, or corrupt ZIP entries")
            for name in names:
                if name.startswith("/") or "\\" in name or ".." in name.split("/"):
                    raise ValueError(f"Unsafe archive path: {name}")
        result["files"].append(
            {
                "path": archive.name,
                "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                "size": archive.stat().st_size,
            }
        )
    else:
        expected = f"ghcr.io/{repository.lower()}/{scenario}/app"
        if (
            image != expected
            or not digest
            or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest)
        ):
            raise ValueError(
                "Image repository or OCI digest does not match the scenario"
            )
        result["image"] = {"reference": f"{image}@{digest}", "digest": digest}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for kind in ("dotnet", "functions"):
        command = commands.add_parser(kind)
        command.add_argument("--source", required=True)
        command.add_argument("--output", required=True)
        if kind == "functions":
            command.add_argument("--dependencies", required=True)
            command.add_argument("--source-sha", required=True)
    metadata = commands.add_parser("metadata")
    metadata.add_argument("--scenario", required=True, choices=CONTRACTS)
    metadata.add_argument("--variant", required=True)
    metadata.add_argument("--archive")
    metadata.add_argument("--image")
    metadata.add_argument("--digest")
    metadata.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.command == "dotnet":
        package_dotnet(args.source, args.output)
    elif args.command == "functions":
        package_functions(args.source, args.dependencies, args.output, args.source_sha)
    else:
        if os.environ["GITHUB_EVENT_NAME"] not in ("push", "workflow_dispatch"):
            raise ValueError(
                "Only push or explicit dispatch builds may publish deployment metadata"
            )
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        if sha != os.environ["GITHUB_SHA"]:
            raise ValueError("Checked-out source differs from the workflow source SHA")
        if (
            args.variant == "reviewed-source"
            and os.environ["GITHUB_REF"] != "refs/heads/main"
        ):
            raise ValueError("Reviewed latency source must come from main after review")
        result = create_metadata(
            os.environ["GITHUB_REPOSITORY"],
            args.scenario,
            sha,
            args.variant,
            args.archive,
            args.image,
            args.digest,
        )
        result["build"] = {
            "runId": os.environ["GITHUB_RUN_ID"],
            "runAttempt": os.environ["GITHUB_RUN_ATTEMPT"],
            "event": os.environ["GITHUB_EVENT_NAME"],
            "ref": os.environ["GITHUB_REF"],
        }
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
