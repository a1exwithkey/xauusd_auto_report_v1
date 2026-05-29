"""
XAUUSD Market Structure Dashboard — Streamlit wrapper.
Reads the Vite build, inlines all assets as data URLs, renders via st.html.
No file-serving or iframe src required — works reliably on Streamlit Cloud.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent

CANDIDATES: list[Path] = [
    ROOT / "xauusd_dashboard" / "dist",
    ROOT / "xauusd_dashboard" / "static",
    ROOT / "dist",
    ROOT / "static",
]


def _find_build() -> Path | None:
    for folder in CANDIDATES:
        if (folder / "index.html").exists():
            return folder
    return None


def _data_url(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def _inline_assets(html: str, folder: Path) -> str:
    """Replace ./assets/*.js and ./assets/*.css references with base64 data URLs."""

    def _replace(m: re.Match) -> str:
        filename = m.group(1)
        asset_path = folder / "assets" / filename
        if not asset_path.exists():
            # try direct sibling
            asset_path = folder / filename
        if not asset_path.exists():
            return m.group(0)  # keep original
        if filename.endswith(".js"):
            return _data_url(asset_path, "application/javascript")
        return _data_url(asset_path, "text/css")

    html = re.sub(r'src="\./assets/([^"]+\.js)"', _replace, html)
    html = re.sub(r'href="\./assets/([^"]+\.css)"', _replace, html)
    # Also handle absolute /assets/ paths
    html = re.sub(r'src="/assets/([^"]+\.js)"', _replace, html)
    html = re.sub(r'href="/assets/([^"]+\.css)"', _replace, html)
    return html


def main() -> None:
    st.set_page_config(
        page_title="XAUUSD Market Structure Dashboard",
        page_icon="🟡",
        layout="wide",
    )

    folder = _find_build()

    if not folder:
        lines = [f"{'✅' if (f / 'index.html').exists() else '❌'} {f}" for f in CANDIDATES]
        st.error("**Build not found.**\n\n" + "\n".join(lines))
        st.stop()

    html = (folder / "index.html").read_text(encoding="utf-8")
    html = _inline_assets(html, folder)

    st.markdown(
        """
        <style>
        .stApp { background: #0a0e14; }
        .block-container { padding: 0 !important; max-width: 100% !important; }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.components.v1.html(html, height=1200, scrolling=True)


if __name__ == "__main__":
    main()
