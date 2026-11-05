#!/usr/bin/env python3
"""
MorpheFlow Release Notes & Title Generator
Generates clean, standardized GitHub release titles and markdown notes
with 1-click Obtainium deep links, patch details, and upstream APK source links.
"""

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

# Add scripts directory to path to import obtainium_link
scripts_dir = Path(__file__).resolve().parent
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))

from obtainium_link import build_obtainium_payload, get_deep_link, get_redirect_url


def format_bytes(bytes_num: int) -> str:
    """Formats byte counts into human-readable strings."""
    if bytes_num <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB"]
    val = float(bytes_num)
    for u in units:
        if val < 1024.0:
            return f"{val:.2f} {u}"
        val /= 1024.0
    return f"{val:.2f} TB"


def resolve_upstream_source(pkg: str, project_root: Path) -> tuple[str, str]:
    """
    Resolves the upstream base APK source link and description.
    Checks tools/morpheflow-data/app_sources.yaml, tools/automorph-data/app_sources.yaml,
    tools/defaults/app_sources.yaml, and tools/morpheflow-data/config.yaml.
    """
    sources_candidates = [
        project_root / "tools" / "morpheflow-data" / "app_sources.yaml",
        project_root / "tools" / "automorph-data" / "app_sources.yaml",
        project_root / "tools" / "defaults" / "app_sources.yaml",
    ]

    sources_data = {}
    for p in sources_candidates:
        if p.is_file():
            try:
                import yaml
                with open(p, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                    if isinstance(data, dict):
                        sources_data.update(data)
            except Exception:
                pass

    if pkg in sources_data:
        cfg = sources_data[pkg]
        if isinstance(cfg, dict):
            src_type = cfg.get("type", "auto").lower()
            if src_type == "github" and cfg.get("repo"):
                repo = cfg["repo"].strip()
                return f"GitHub Releases ({repo})", f"https://github.com/{repo}/releases"
            if src_type == "apkmirror":
                url = cfg.get("url") or f"https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s={pkg}"
                return "APKMirror", url
            if src_type == "direct" and cfg.get("url"):
                return "Custom Direct URL", cfg["url"]
            if src_type in ("google_play", "aurora"):
                return "Google Play / Aurora Store", f"https://play.google.com/store/apps/details?id={pkg}"

    # Check config.yaml for base_apk_url
    config_candidates = [
        project_root / "tools" / "morpheflow-data" / "config.yaml",
        project_root / "tools" / "automorph-data" / "config.yaml",
        project_root / "defaults" / "config.yaml",
    ]
    for cp in config_candidates:
        if cp.is_file():
            try:
                import yaml
                with open(cp, "r", encoding="utf-8") as f:
                    cdata = yaml.safe_load(f) or {}
                    for p in cdata.get("packages", []):
                        if (p.get("package") == pkg or p.get("package_name") == pkg):
                            custom_url = p.get("base_apk_url") or (p.get("options") or {}).get("base_apk_url")
                            if custom_url:
                                return "Custom Configured Base APK", custom_url
            except Exception:
                pass

    # Default to Google Play / Aurora Store
    return "Google Play Store (Aurora Store / goopdl)", f"https://play.google.com/store/apps/details?id={pkg}"


def extract_applied_patches(apk_path: Path, pkg: str, version: str, project_root: Path) -> list[str]:
    """Extracts applied patches from result.json, patched.json, or config.yaml."""
    patches = []

    # 1. Check result.json next to APK
    if apk_path and apk_path.parent.is_dir():
        result_json = apk_path.parent / "result.json"
        if result_json.is_file():
            try:
                with open(result_json, "r", encoding="utf-8") as f:
                    rdata = json.load(f)
                    applied = rdata.get("appliedPatches") or rdata.get("applied_patches")
                    if isinstance(applied, list):
                        patches = [str(p) for p in applied if p]
            except Exception:
                pass

    # 2. Check tools/morpheflow-data/state/patched.json
    if not patches:
        patched_json = project_root / "tools" / "morpheflow-data" / "state" / "patched.json"
        if not patched_json.is_file():
            patched_json = project_root / "tools" / "automorph-data" / "state" / "patched.json"
        if patched_json.is_file():
            try:
                with open(patched_json, "r", encoding="utf-8") as f:
                    pdata = json.load(f)
                    app_entry = pdata.get(pkg, {})
                    app_patches = app_entry.get("applied_patches", {})
                    if isinstance(app_patches, dict):
                        patches = list(app_patches.keys())
                    elif isinstance(app_patches, list):
                        patches = [str(x) for x in app_patches]
            except Exception:
                pass

    # 3. Check config.yaml patch_aliases
    if not patches:
        config_path = project_root / "tools" / "morpheflow-data" / "config.yaml"
        if not config_path.is_file():
            config_path = project_root / "tools" / "automorph-data" / "config.yaml"
        if config_path.is_file():
            try:
                import yaml
                with open(config_path, "r", encoding="utf-8") as f:
                    cdata = yaml.safe_load(f) or {}
                    for p in cdata.get("packages", []):
                        if (p.get("package") == pkg or p.get("package_name") == pkg):
                            aliases = p.get("patch_aliases", [])
                            for a in aliases:
                                if isinstance(a, dict) and a.get("alias"):
                                    patches.append(a["alias"])
                                elif isinstance(a, str):
                                    patches.append(a)
            except Exception:
                pass

    return sorted(list(dict.fromkeys(patches)))


def main():
    parser = argparse.ArgumentParser(description="Generate MorpheFlow Release Notes & Title")
    parser.add_argument("--pkg", required=True, help="Android package name (e.g. com.spocky.projengmenu)")
    parser.add_argument("--name", default="", help="Application display name (e.g. Projectivy Launcher)")
    parser.add_argument("--version", required=True, help="Application version (e.g. 4.73)")
    parser.add_argument("--apk", required=True, help="Path to patched APK file")
    parser.add_argument("--repo", default="wiwek13/MorpheFlow", help="GitHub repository slug")
    parser.add_argument("--out-notes", help="Output path for markdown release notes")
    parser.add_argument("--out-title", help="Output path for release title")

    args = parser.parse_args()

    pkg = args.pkg.strip()
    app_name = args.name.strip()
    version = args.version.strip().lstrip("v")
    apk_path = Path(args.apk).resolve()
    repo = args.repo.strip()
    project_root = Path(__file__).resolve().parent.parent

    if not app_name:
        app_name = pkg.split(".")[-1].capitalize()

    # Calculate SHA-256 and size
    sha256 = ""
    file_size_formatted = "0 B"
    filename = apk_path.name if apk_path.exists() else f"{pkg}_{version}_patched.apk"
    if apk_path.is_file():
        h = hashlib.sha256()
        with open(apk_path, "rb") as f:
            while chunk := f.read(128 * 1024):
                h.update(chunk)
        sha256 = h.hexdigest()
        file_size_formatted = format_bytes(apk_path.stat().st_size)

    # Obtainium Deep Link & Redirect
    obtainium_payload = build_obtainium_payload(pkg, app_name, repo)
    deep_link = get_deep_link(obtainium_payload)
    obtainium_url = get_redirect_url(deep_link)

    # Resolve upstream source
    source_desc, source_url = resolve_upstream_source(pkg, project_root)

    # Extract applied patches
    applied_patches = extract_applied_patches(apk_path, pkg, version, project_root)
    patches_count_str = f" ({len(applied_patches)})" if applied_patches else ""
    if applied_patches:
        patches_bullets = "\n".join(f"  - `{p}`" for p in applied_patches)
    else:
        patches_bullets = "  - *All compatible community patches applied*"

    vt_url = f"https://www.virustotal.com/gui/file/{sha256}" if sha256 else ""
    vt_line = f"- **VirusTotal Scan:** [🛡️ View Security Report]({vt_url})\n" if vt_url else ""

    tag = f"app-{pkg}"
    direct_download_url = f"https://github.com/{repo}/releases/download/{tag}/{filename}"

    # Standard clean title format: {App Name} v{Version}
    title = f"{app_name} v{version}"

    # Generate Markdown Notes
    notes = f"""# 🚀 {app_name} v{version}

### 📲 Instant 1-Click Install in Obtainium
👉 [**📲 Add to Obtainium**]({obtainium_url})

*(Tapping the button above automatically opens Obtainium with all update filters, version extraction, and fallback rules pre-configured!)*

---

### 📦 Build & Patch Information
- **Application:** {app_name} (`{pkg}`)
- **Version:** `v{version}` (arm64-v8a)
- **Patch Tool:** Morphe CLI
- **Applied Patches{patches_count_str}:**
{patches_bullets}
- **Base APK Upstream Source:** [{source_desc}]({source_url})
- **Binary File:** `{filename}` ({file_size_formatted})
- **SHA-256:** `{sha256}`
{vt_line}
---

### ⬇️ Direct Download
👉 [**Download {filename}**]({direct_download_url})

> 🔒 **Private Repository Note:** If your repository is private, ensure your GitHub Personal Access Token (PAT) with `repo` scope is entered in Obtainium: **Settings** ➔ **App Sources** ➔ **GitHub**.
"""

    if args.out_notes:
        out_p = Path(args.out_notes)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        out_p.write_text(notes, encoding="utf-8")

    if args.out_title:
        out_t = Path(args.out_title)
        out_t.parent.mkdir(parents=True, exist_ok=True)
        out_t.write_text(title, encoding="utf-8")

    print(title)


if __name__ == "__main__":
    main()
