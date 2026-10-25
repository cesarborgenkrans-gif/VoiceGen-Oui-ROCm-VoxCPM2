#!/usr/bin/env python3
"""
Source Hygiene and Release Integrity Gate
Part of VoiceGen Oui! ROCm-VoxCPM2 release verification.

Checks:
1. Workstation & path disclosures (no workspace leaks or unsanitized drive paths)
2. JSON syntax validity for all tracked JSON files
3. Markdown link integrity for all internal markdown references
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SELF_PATH = Path(__file__).resolve()

# Build patterns dynamically so this verification script does not trigger literal pattern searches
TOKEN_CODEXA = "-".join(["ai", "codexa"])
TOKEN_03_LIVE = "_".join(["03", "LIVE"])
TOKEN_Z_LIVE = "-".join(["z", "live"])

FORBIDDEN_PATTERNS = [
    (re.compile(re.escape(TOKEN_CODEXA), re.IGNORECASE), f"leaked workspace name '{TOKEN_CODEXA}'"),
    (re.compile(re.escape(TOKEN_03_LIVE), re.IGNORECASE), f"leaked workstation lane '{TOKEN_03_LIVE}'"),
    (re.compile(re.escape(TOKEN_Z_LIVE), re.IGNORECASE), f"leaked workstation lane '{TOKEN_Z_LIVE}'"),
    (
        re.compile(r"[D|C]:\\(?!path\\to)[a-zA-Z0-9_\-\\]+", re.IGNORECASE),
        "hardcoded local Windows drive path",
    ),
]

# Text files to scan for disclosures (extensions)
SCANNABLE_EXTENSIONS = {
    ".py",
    ".js",
    ".html",
    ".css",
    ".json",
    ".md",
    ".txt",
    ".ps1",
    ".cmd",
    ".sh",
    ".yml",
    ".yaml",
}

# Explicit allow-list for benign documentation references
BENIGN_ALLOWLIST = {
    r"$env:VOICEGEN_OUI_AI_ADDON_LOG = \"D:\path\to\ai_addon_events.json\"",
    r"$env:VOICEGEN_OUI_APP_ROOT = \"D:\path\to\VoiceGen-Oui-ROCm-VoxCPM2\app\"",
    r"$env:VOXCPM_MODEL_PATH = \"D:\path\to\models\VoxCPM2\"",
    r"C:\Users\*username*\AppData\Local\VoiceGenOui",
}


def get_tracked_files():
    """Get list of files tracked by git, or fallback to filesystem walk."""
    try:
        res = subprocess.run(
            ["git", "ls-files"],
            cwd=str(ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        files = [ROOT / f.strip() for f in res.stdout.splitlines() if f.strip()]
        return [f for f in files if f.is_file()]
    except Exception:
        files = []
        for p in ROOT.rglob("*"):
            if p.is_file() and not any(part.startswith(".") for part in p.parts):
                files.append(p)
        return files


def check_disclosures(tracked_files):
    errors = []
    for file_path in tracked_files:
        if file_path.resolve() == SELF_PATH:
            continue
        if file_path.suffix.lower() not in SCANNABLE_EXTENSIONS:
            continue
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                for line_idx, line in enumerate(f, start=1):
                    # Check if line matches an allowlisted benign example
                    if any(allowed in line for allowed in BENIGN_ALLOWLIST):
                        continue
                    for pattern, desc in FORBIDDEN_PATTERNS:
                        if pattern.search(line):
                            rel_path = file_path.relative_to(ROOT)
                            errors.append(
                                f"{rel_path}:{line_idx}: Found {desc} -> {line.strip()}"
                            )
        except Exception as exc:
            errors.append(f"Failed to read {file_path}: {exc}")
    return errors


def check_json_files(tracked_files):
    errors = []
    for file_path in tracked_files:
        if file_path.suffix.lower() == ".json":
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    json.load(f)
            except Exception as exc:
                rel_path = file_path.relative_to(ROOT)
                errors.append(f"{rel_path}: Invalid JSON syntax -> {exc}")
    return errors


def check_markdown_links(tracked_files):
    errors = []
    link_pattern = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
    img_pattern = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']")

    for file_path in tracked_files:
        if file_path.suffix.lower() != ".md":
            continue
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Check markdown links
            for match in link_pattern.finditer(content):
                target = match.group(2).strip()
                if target.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                clean_target = target.split("#")[0].split("?")[0]
                if not clean_target:
                    continue
                resolved = (file_path.parent / clean_target).resolve()
                if not resolved.exists():
                    rel_path = file_path.relative_to(ROOT)
                    errors.append(
                        f"{rel_path}: Broken link '{target}' (target not found: {resolved})"
                    )

            # Check HTML img tags
            for match in img_pattern.finditer(content):
                target = match.group(1).strip()
                if target.startswith(("http://", "https://", "mailto:")):
                    continue
                clean_target = target.split("#")[0].split("?")[0]
                if not clean_target:
                    continue
                resolved = (file_path.parent / clean_target).resolve()
                if not resolved.exists():
                    rel_path = file_path.relative_to(ROOT)
                    errors.append(
                        f"{rel_path}: Broken img src '{target}' (target not found: {resolved})"
                    )
        except Exception as exc:
            errors.append(f"Failed to read {file_path}: {exc}")
    return errors


def main():
    print("=" * 60)
    print("VoiceGen Oui! Source Hygiene & Integrity Gate")
    print("=" * 60)

    tracked = get_tracked_files()
    # Ensure this script is included if it's already in the workspace
    if SELF_PATH not in tracked and SELF_PATH.exists():
        tracked.append(SELF_PATH)

    print(f"Tracking {len(tracked)} files in repository.")

    all_errors = []

    # 1. Disclosures
    disc_errors = check_disclosures(tracked)
    if disc_errors:
        print(f"\n[FAIL] Found {len(disc_errors)} disclosure issue(s):")
        for err in disc_errors:
            print(f"  - {err}")
        all_errors.extend(disc_errors)
    else:
        print("[OK] Zero workstation disclosures or leaked paths found.")

    # 2. JSON Validation
    json_errors = check_json_files(tracked)
    if json_errors:
        print(f"\n[FAIL] Found {len(json_errors)} JSON syntax error(s):")
        for err in json_errors:
            print(f"  - {err}")
        all_errors.extend(json_errors)
    else:
        print("[OK] All JSON files parsed cleanly.")

    # 3. Markdown Links
    link_errors = check_markdown_links(tracked)
    if link_errors:
        print(f"\n[FAIL] Found {len(link_errors)} broken markdown link(s):")
        for err in link_errors:
            print(f"  - {err}")
        all_errors.extend(link_errors)
    else:
        print("[OK] All internal markdown links and media references resolve.")

    print("=" * 60)
    if all_errors:
        print(f"FAILED: {len(all_errors)} total error(s) detected.")
        sys.exit(1)
    else:
        print("PASSED: All source hygiene gates green.")
        sys.exit(0)


if __name__ == "__main__":
    main()
