"""
XAUUSD Market Structure Dashboard — Streamlit wrapper.
Primary: Twelve Data XAU/USD spot. Fallback: yfinance GC=F.
Injects full candles into window.__XAUUSD_REAL_DATA__.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parent
API_KEY = os.getenv("TWELVE_DATA_API_KEY", "")

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


def _rows_to_candles(df: pd.DataFrame) -> list[dict]:
    candles = []
    for idx, row in df.iterrows():
        candles.append({
            "time": int(pd.Timestamp(idx).timestamp()),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row.get("Volume", 0) or 0),
        })
    return candles


def _normalize_df(raw: pd.DataFrame) -> pd.DataFrame | None:
    if raw is None or raw.empty:
        return None
    df = raw.copy()

    if isinstance(df.columns, pd.MultiIndex):
        mapping = {}
        for col in df.columns:
            col_str = str(col[0]).strip().title()
            if col_str in ("Open", "High", "Low", "Close", "Volume"):
                mapping[col_str] = col
        df = pd.DataFrame({k: df[v] for k, v in mapping.items() if v is not None}, index=df.index)

    df.columns = [str(c).strip().title() for c in df.columns]
    for col in ("Open", "High", "Low", "Close", "Volume"):
        if col not in df.columns:
            df[col] = 0.0 if col == "Volume" else pd.NA

    df = df.dropna(subset=["Open", "High", "Low", "Close"])
    if df.empty:
        return None

    df["Volume"] = df["Volume"].fillna(0)
    df.index = pd.to_datetime(df.index)
    return df


def _fetch_from_twelvedata() -> dict | None:
    """Twelve Data XAU/USD 5min candles."""
    import urllib.request

    url = (
        f"https://api.twelvedata.com/time_series"
        f"?symbol=XAU/USD&interval=5min&outputsize=300"
        f"&apikey={API_KEY}"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except Exception:
        return None

    if body.get("status") == "error" or "values" not in body:
        return None

    rows = body["values"]
    # Twelve Data returns newest first — reverse to chronological
    rows.reverse()

    data: dict = {"time": [], "Open": [], "High": [], "Low": [], "Close": [], "Volume": []}
    for r in rows:
        data["time"].append(r["datetime"])
        data["Open"].append(float(r["open"]))
        data["High"].append(float(r["high"]))
        data["Low"].append(float(r["low"]))
        data["Close"].append(float(r["close"]))
        volume_raw = r.get("volume", 0) or 0
        try:
            volume = int(float(volume_raw))
        except Exception:
            volume = 0
        data["Volume"].append(volume)

    df = pd.DataFrame(data)
    df["time"] = pd.to_datetime(df["time"])
    df = df.set_index("time")

    candles = _rows_to_candles(df)
    return {
        "ticker": "XAU/USD",
        "data_source": "Twelve Data",
        "candles": candles,
        "rows": len(candles),
        "close": candles[-1]["close"] if candles else None,
        "latest_close": candles[-1]["close"] if candles else None,
        "latest_time": str(df.index[-1]),
        "is_demo_data": False,
    }


def _fetch_from_yfinance() -> dict | None:
    """Fallback: yfinance GC=F 5min candles."""
    import yfinance as yf

    for ticker in ("GC=F", "XAUUSD=X"):
        try:
            raw = yf.download(ticker, period="5d", interval="5m",
                              auto_adjust=False, progress=False, threads=False)
        except Exception:
            continue

        df = _normalize_df(raw)
        if df is None:
            continue

        candles = _rows_to_candles(df)
        return {
            "ticker": ticker,
            "data_source": "Yahoo Finance (fallback)",
            "candles": candles,
            "rows": len(candles),
            "close": candles[-1]["close"] if candles else None,
            "latest_close": candles[-1]["close"] if candles else None,
            "latest_time": str(df.index[-1]),
            "is_demo_data": False,
        }
    return None


def main() -> None:
    st.set_page_config(page_title="XAUUSD Market Structure Dashboard",
                       page_icon="🟡", layout="wide")

    folder = _find_build()
    if not folder:
        lines = [f"{'✅' if (f / 'index.html').exists() else '❌'} {f}" for f in CANDIDATES]
        st.error("**Build not found.**\n\n" + "\n".join(lines))
        st.stop()

    assets = folder / "assets"
    js_files = sorted(assets.glob("index-*.js")) if assets.exists() else []
    css_files = sorted(assets.glob("index-*.css")) if assets.exists() else []
    if not js_files:
        st.error(f"No JS bundle in `{assets}`.")
        st.stop()

    js_content = js_files[-1].read_text(encoding="utf-8")
    css_content = css_files[-1].read_text(encoding="utf-8") if css_files else ""

    # Fetch: Twelve Data → yfinance fallback
    real = _fetch_from_twelvedata()
    fallback_reason = ""
    if not real:
        fallback_reason = "Twelve Data returned empty/error; "
        real = _fetch_from_yfinance()
        if real:
            fallback_reason += "using Yahoo Finance fallback."
            real["fallback_reason"] = fallback_reason
        else:
            fallback_reason += "Yahoo Finance also failed."

    if real:
        inject = "<script>window.__XAUUSD_REAL_DATA__=" + json.dumps(real, ensure_ascii=False) + ";</script>"
    else:
        # No data at all — inject null so frontend shows error, never mock
        inject = f"<script>window.__XAUUSD_REAL_DATA__=null;window.__XAUUSD_FALLBACK__={json.dumps(fallback_reason)};</script>"

    html = HTML_TPL.replace("__REAL_DATA_SCRIPT__", inject)
    html = html.replace("__JS_PLACEHOLDER__", js_content)
    html = html.replace("__CSS_PLACEHOLDER__", css_content)

    st.markdown("""<style>.stApp{background:#0a0e14}.block-container{padding:0!important;max-width:100%!important}</style>""", unsafe_allow_html=True)
    st.components.v1.html(html, height=1800, scrolling=True)


if __name__ == "__main__":
    main()
