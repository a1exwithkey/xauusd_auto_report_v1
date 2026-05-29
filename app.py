"""
XAUUSD Market Structure Dashboard — Streamlit wrapper.
Finds the Vite build output and serves it via Streamlit's static folder.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"

# Ordered: first match wins
CANDIDATES: list[tuple[str, Path]] = [
    ("xauusd_dashboard/dist", ROOT / "xauusd_dashboard" / "dist"),
    ("xauusd_dashboard/static", ROOT / "xauusd_dashboard" / "static"),
    ("dist", ROOT / "dist"),
    ("static", ROOT / "static"),
]


def _find_build() -> tuple[Path, Path] | None:
    """Return (source_dir, index_path) for the first match, or None."""
    for _label, folder in CANDIDATES:
        idx = folder / "index.html"
        if idx.exists():
            return folder, idx
    return None


def _sync_to_static(source: Path) -> Path:
    """Copy source folder contents into STATIC/. Overwrites existing."""
    if STATIC.exists():
        shutil.rmtree(STATIC, ignore_errors=True)
    shutil.copytree(str(source), str(STATIC))
    return STATIC / "index.html"


def main() -> None:
    st.set_page_config(
        page_title="XAUUSD Market Structure Dashboard",
        page_icon="🟡",
        layout="wide",
    )

    found = _find_build()

    if not found:
        lines = []
        for label, folder in CANDIDATES:
            ok = (folder / "index.html").exists()
            lines.append(f"{'✅' if ok else '❌'} {label}/index.html")
        st.error(
            "**Build output not found.** Checked:\n\n"
            + "\n".join(lines)
            + "\n\nRun `npm run build` inside xauusd_dashboard/ first."
        )
        st.stop()

    source_dir, source_index = found

    # Streamlit only serves from <repo>/static/ — sync the build there
    if source_dir != STATIC:
        target = _sync_to_static(source_dir)
    else:
        target = STATIC / "index.html"

    if not target.exists():
        st.error(
            f"Sync failed. Source: `{source_dir}/` → Target: `{STATIC}/`.\n"
            "Check that the build folder is committed to the repo."
        )
        st.stop()

    st.markdown(
        """
        <style>
        .stApp { background: #0a0e14; }
        .block-container { padding: 0 !important; max-width: 100% !important; }
        iframe { border: none; }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.components.v1.iframe(
        src="/app/static/index.html",
        height=960,
        scrolling=True,
    )


if __name__ == "__main__":
    main()
