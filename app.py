"""
XAUUSD Market Structure Dashboard — Streamlit wrapper.
Primary: Twelve Data XAU/USD spot.
Injects full candles into window.__XAUUSD_REAL_DATA__.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parent
ENV_FILES = (ROOT / ".env", ROOT.parent / ".env")

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


def _get_api_key() -> str:
    key = os.getenv("TWELVE_DATA_API_KEY", "").strip()
    if key:
        return key
    try:
        key = str(st.secrets.get("TWELVE_DATA_API_KEY", "")).strip()
        if key:
            return key
    except Exception:
        pass

    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            name, value = stripped.split("=", 1)
            if name.strip() == "TWELVE_DATA_API_KEY":
                return value.strip().strip('"').strip("'")
    return ""


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_from_twelvedata(api_key: str, cache_key: str) -> tuple[dict | None, str]:
    """Twelve Data XAU/USD 5min candles."""
    import urllib.parse
    import urllib.request

    params = urllib.parse.urlencode({
        "symbol": "XAU/USD",
        "interval": "5min",
        "outputsize": 300,
        "apikey": api_key,
    })
    url = f"https://api.twelvedata.com/time_series?{params}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except Exception as exc:
        return None, f"Twelve Data request failed: {exc}"

    if body.get("status") == "error" or "values" not in body:
        return None, str(body.get("message") or "Twelve Data returned no candle values.")

    rows = body["values"]
    if not rows:
        return None, "Twelve Data returned an empty candle list."

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
    if not candles:
        return None, "Twelve Data candle parsing produced no usable rows."

    return {
        "ticker": "XAU/USD",
        "data_source": "Twelve Data",
        "candles": candles,
        "rows": len(candles),
        "close": candles[-1]["close"] if candles else None,
        "latest_close": candles[-1]["close"] if candles else None,
        "latest_time": str(df.index[-1]),
        "is_demo_data": False,
    }, ""


def _make_data_script(payload: dict | None, error: str = "") -> str:
    safe_error = json.dumps(error, ensure_ascii=False)
    if payload:
        data = json.dumps(payload, ensure_ascii=False)
        return f"<script>window.__XAUUSD_REAL_DATA__={data};window.__XAUUSD_DATA_ERROR__='';</script>"
    return (
        "<script>"
        "window.__XAUUSD_REAL_DATA__=null;"
        f"window.__XAUUSD_DATA_ERROR__={safe_error};"
        "</script>"
    )


def _refresh_cache_key() -> str:
    force_refresh = str(st.query_params.get("force_refresh", "")).strip()
    if force_refresh:
        return force_refresh
    return str(int(datetime.now(timezone.utc).timestamp() // 3600))


@st.fragment(run_every="1h")
def _render_dashboard() -> None:
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

    api_key = _get_api_key()
    if not api_key:
        inject = _make_data_script(None, "缺少 TWELVE_DATA_API_KEY，无法获取实时 XAUUSD 行情。请在环境变量或 Streamlit Secrets 中配置。")
    else:
        real, error = _fetch_from_twelvedata(api_key, _refresh_cache_key())
        inject = _make_data_script(real, error)

    html = HTML_TPL.replace("__REAL_DATA_SCRIPT__", inject)
    html = html.replace("__JS_PLACEHOLDER__", js_content)
    html = html.replace("__CSS_PLACEHOLDER__", css_content)

    st.components.v1.html(html, height=1800, scrolling=True)


def main() -> None:
    st.set_page_config(page_title="XAUUSD Market Structure Dashboard",
                       page_icon="🟡", layout="wide")

    st.markdown("""
    <style>
      .stApp{background:#0a0e14}
      .block-container{padding:62px 0 0!important;max-width:100%!important}
      div[data-testid="stButton"]{
        position:fixed;
        top:90px;
        right:18px;
        z-index:9999;
        width:auto!important;
      }
      div[data-testid="stButton"] button{
        background:rgba(212,175,55,.16);
        color:#f4d06f;
        border:1px solid rgba(212,175,55,.48);
        border-radius:7px;
        min-height:30px;
        padding:0 12px;
        font-size:12px;
        font-weight:800;
        letter-spacing:0;
        box-shadow:0 8px 20px rgba(0,0,0,.24);
      }
      div[data-testid="stButton"] button:hover{
        background:rgba(212,175,55,.28);
        border-color:rgba(244,208,111,.86);
        color:#ffe28a;
      }
      div[data-testid="stButton"] button p{font-size:12px}
    </style>
    """, unsafe_allow_html=True)

    if st.button("刷新", type="secondary", help="清除缓存并重新请求 Twelve Data"):
        _fetch_from_twelvedata.clear()
        st.query_params["force_refresh"] = str(int(datetime.now(timezone.utc).timestamp()))
        st.rerun()

    _render_dashboard()


if __name__ == "__main__":
    main()
