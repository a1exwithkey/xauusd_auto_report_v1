"""
XAUUSD Market Structure Dashboard — Streamlit wrapper.
Rebuilds a clean self-contained HTML from the Vite build output.
Injects real yfinance price data via window.__XAUUSD_REAL_DATA__.
"""

from __future__ import annotations

from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent

CANDIDATES: list[Path] = [
    ROOT / "xauusd_dashboard" / "dist",
    ROOT / "xauusd_dashboard" / "static",
    ROOT / "dist",
    ROOT / "static",
]

HTML_TPL = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>XAUUSD Market Structure Dashboard</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🟡</text></svg>"/>
<style>html,body,#root{width:100%;min-height:100vh;margin:0;background:#0a0e14;overflow:auto}</style>
<style>__CSS_PLACEHOLDER__</style>
<script>window.onerror=function(m,s,l,c,e){document.body.insertAdjacentHTML('beforeend','<div style="position:fixed;top:0;right:0;z-index:99999;max-width:420px;background:#1a0000;color:#f44;font:11px monospace;padding:10px;border:2px solid red">JS ERROR: '+String(m)+' @ '+String(s)+':'+l+'</div>');};</script>
__REAL_DATA_SCRIPT__
</head>
<body>
<div id="root"></div>
<script>__JS_PLACEHOLDER__</script>
</body>
</html>"""


def _find_build() -> Path | None:
    for folder in CANDIDATES:
        if (folder / "index.html").exists():
            return folder
    return None


def _fetch_real_close() -> dict | None:
    """Fetch the latest XAUUSD close from yfinance. Returns None on failure."""
    try:
        import yfinance as yf
        df = yf.download("GC=F", period="1d", interval="5m", auto_adjust=False, progress=False, threads=False)
        if df.empty:
            return None
        close = float(df["Close"].iloc[-1])
        ts = str(df.index[-1])
        return {"ticker": "GC=F", "close": close, "time": ts}
    except Exception:
        return None


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

    assets = folder / "assets"
    js_files = sorted(assets.glob("index-*.js")) if assets.exists() else []
    css_files = sorted(assets.glob("index-*.css")) if assets.exists() else []

    if not js_files:
        st.error(f"No JS bundle in `{assets}`. Found: {list(assets.iterdir()) if assets.exists() else 'none'}")
        st.stop()

    js_content = js_files[-1].read_text(encoding="utf-8")
    css_content = css_files[-1].read_text(encoding="utf-8") if css_files else ""

    # Try to inject real price data
    real = _fetch_real_close()
    if real:
        import json
        inject = f"<script>window.__XAUUSD_REAL_DATA__={json.dumps(real)};</script>"
    else:
        inject = ""

    html = HTML_TPL.replace("__REAL_DATA_SCRIPT__", inject)
    html = html.replace("__JS_PLACEHOLDER__", js_content)
    html = html.replace("__CSS_PLACEHOLDER__", css_content)

    st.markdown(
        """
        <style>
        .stApp { background: #0a0e14; }
        .block-container { padding: 0 !important; max-width: 100% !important; }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.components.v1.html(html, height=1800, scrolling=True)


if __name__ == "__main__":
    main()
