#!/usr/bin/env python3
"""
Download Font Awesome Free 6.x assets secara lokal (CSS + webfonts).

Contoh:
    python scripts/download_fontawesome.py               # auto-detect project root
    python scripts/download_fontawesome.py --out assets/fontawesome
    python scripts/download_fontawesome.py --version 6.5.1 --skip-existing

Hasil (default, project root terdeteksi):
    <project_root>/assets/fontawesome/css/all.min.css
    <project_root>/assets/fontawesome/webfonts/fa-solid-900.woff2
    ...

Lalu tambahkan ke <head> index.html:
    <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">

Tidak butuh dependensi eksternal — hanya stdlib.
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

CDN_PRIMARY  = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/{version}"
CDN_FALLBACK = "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@{version}"

# Font Awesome 6 tidak lagi mendistribusikan .woff — hanya .woff2 + .ttf.
# v4compatibility diperlukan karena all.min.css FA6 mereferensikannya.
FILES = [
    ("css/all.min.css",                     "css/all.min.css"),
    ("webfonts/fa-solid-900.woff2",         "webfonts/fa-solid-900.woff2"),
    ("webfonts/fa-solid-900.ttf",           "webfonts/fa-solid-900.ttf"),
    ("webfonts/fa-regular-400.woff2",       "webfonts/fa-regular-400.woff2"),
    ("webfonts/fa-regular-400.ttf",         "webfonts/fa-regular-400.ttf"),
    ("webfonts/fa-brands-400.woff2",        "webfonts/fa-brands-400.woff2"),
    ("webfonts/fa-brands-400.ttf",          "webfonts/fa-brands-400.ttf"),
    ("webfonts/fa-v4compatibility.woff2",   "webfonts/fa-v4compatibility.woff2"),
    ("webfonts/fa-v4compatibility.ttf",     "webfonts/fa-v4compatibility.ttf"),
]

def project_root() -> Path:
    """Cari folder yang berisi index.html (parent dari scripts/)."""
    here = Path(__file__).resolve().parent
    # cek parent langsung (scripts/ → project root)
    for cand in (here.parent, here.parent.parent):
        if (cand / "index.html").exists():
            return cand
    return here.parent

def fetch(url: str, dest: Path, timeout: int = 30) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Memora-DL"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r, open(dest, "wb") as f:
            f.write(r.read())
        size = dest.stat().st_size
        rel = dest.as_posix().split("assets/fontawesome/")[-1]
        print(f"    ✓ {rel:<42} {size:>9,} bytes")
        return True
    except urllib.error.HTTPError as e:
        print(f"    ✗ HTTP {e.code} — {url}", file=sys.stderr)
    except urllib.error.URLError as e:
        print(f"    ✗ Network — {e.reason} — {url}", file=sys.stderr)
    except OSError as e:
        print(f"    ✗ FS error — {e}", file=sys.stderr)
    return False

def download_asset(rel: str, out_dir: Path, version: str) -> bool:
    for base in (CDN_PRIMARY, CDN_FALLBACK):
        url = f"{base.format(version=version)}/{rel}"
        print(f"  ↓ {url}")
        if fetch(url, out_dir / rel):
            return True
    return False

def verify_css_references(out_dir: Path) -> tuple[bool, list[str]]:
    """Parse @font-face src dan pastikan file webfont yang dirujuk ada."""
    css = out_dir / "css" / "all.min.css"
    if not css.exists():
        return False, ["all.min.css tidak ditemukan"]
    text = css.read_text(encoding="utf-8", errors="ignore")
    refs = set(re.findall(r"\.\./webfonts/[\w.\-]+", text))
    missing = []
    for ref in refs:
        target = out_dir / ref.replace("../", "")
        if not target.exists():
            missing.append(ref)
    return len(missing) == 0, missing

def main() -> int:
    ap = argparse.ArgumentParser(description="Download Font Awesome Free assets.")
    ap.add_argument("--version", default="6.5.1", help="Font Awesome version (default: 6.5.1)")
    ap.add_argument("--out", default=None,
                    help="Output directory (default: <project_root>/assets/fontawesome)")
    ap.add_argument("--skip-existing", action="store_true",
                    help="Lewati file yang sudah ada (resume-friendly)")
    args = ap.parse_args()

    root = project_root()
    out_dir = Path(args.out) if args.out else (root / "assets" / "fontawesome")

    print(f"Project root : {root}")
    print(f"Font Awesome : {args.version}")
    print(f"Output       : {out_dir.resolve()}\n")

    if not (root / "index.html").exists():
        print("⚠  index.html tidak ditemukan di project root — path default mungkin salah.",
              file=sys.stderr)
        print("   Gunakan --out <path> secara eksplisit jika perlu.\n", file=sys.stderr)

    ok, fail = 0, 0
    for cdn_rel, local_rel in FILES:
        dest = out_dir / local_rel
        if args.skip_existing and dest.exists() and dest.stat().st_size > 0:
            print(f"  ⤼ {local_rel} (skip, {dest.stat().st_size:,} bytes)")
            ok += 1
            continue
        if download_asset(cdn_rel, out_dir, args.version):
            ok += 1
        else:
            fail += 1

    print(f"\n{'✓' if fail == 0 else '⚠'} {ok} file berhasil, {fail} gagal.")

    # Verifikasi referensi CSS → webfonts
    refs_ok, missing = verify_css_references(out_dir)
    if refs_ok:
        print("✓ Semua webfont yang dirujuk all.min.css tersedia.")
    else:
        print(f"⚠  {len(missing)} webfont dirujuk CSS tapi tidak ada:", file=sys.stderr)
        for m in missing:
            print(f"    - {m}", file=sys.stderr)

    # Info path relatif untuk HTML
    try:
        rel_css = (out_dir / "css" / "all.min.css").relative_to(root).as_posix()
        print(f"\nTambahkan ke <head> index.html:\n"
              f'  <link rel="stylesheet" href="{rel_css}">')
    except ValueError:
        print(f"\nCSS: {(out_dir / 'css' / 'all.min.css').as_posix()}")

    return 0 if (fail == 0 and refs_ok) else 1

if __name__ == "__main__":
    sys.exit(main())
