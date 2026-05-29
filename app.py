"""
XAUUSD Market Structure Dashboard — Streamlit wrapper.
Copies the Vite build output to Streamlit's static folder on first run,
then serves the app inside a full-page iframe.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import streamlit as st

HERE = Path(__file__).resolve().parent
# React build output lives inside the xauusd_dashboard subdirectory
DASHBOARD = HERE / "xauusd_dashboard"
DIST = DASHBOARD / "dist"
# Streamlit only serves static files from <project_root>/static/
STATIC = HERE / "static"


def _ensure_static() -> None:
    """Copy dist → static once so Streamlit serves the assets."""
    if not (DIST / "index.html").exists():
        return

    index_mtime = (DIST / "index.html").stat().st_mtime
    static_index = STATIC / "index.html"

    if static_index.exists():
        dest_mtime = static_index.stat().st_mtime
        if dest_mtime >= index_mtime:
            return

    # Remove old then copy fresh
    if STATIC.exists():
        shutil.rmtree(STATIC)
    shutil.copytree(DIST, STATIC)


def main() -> None:
    st.set_page_config(
        page_title="XAUUSD Market Structure Dashboard",
        page_icon="🟡",
        layout="wide",
    )

    _ensure_static()

    if not (STATIC / "index.html").exists():
        st.error("Build output not found. Run `npm run build` inside xauusd_dashboard/ first.")
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

    # Streamlit serves files from static/ at /app/static/
    st.components.v1.iframe(
        src="/app/static/index.html",
        height=960,
        scrolling=True,
    )


if __name__ == "__main__":
    main()
