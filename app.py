"""
XAUUSD Market Structure Dashboard — Streamlit wrapper.
Primary: Twelve Data XAU/USD spot.
Injects full candles into window.__XAUUSD_REAL_DATA__.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parent
ENV_FILES = (ROOT / ".env", ROOT.parent / ".env")
TWELVE_TIMEOUT_SECONDS = 8
GEMINI_TIMEOUT_SECONDS = 18

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


def _get_secret(*names: str) -> str:
    for name in names:
        key = os.getenv(name, "").strip()
        if key:
            return key
    try:
        for name in names:
            key = str(st.secrets.get(name, "")).strip()
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
            if name.strip() in names:
                return value.strip().strip('"').strip("'")
    return ""


def _get_api_key() -> str:
    key = _get_secret("TWELVE_DATA_API_KEY")
    if key:
        return key
    return ""


def _get_gemini_key() -> str:
    return _get_secret("GEMINI_API_KEY", "GOOGLE_API_KEY")


def _fetch_interval(api_key: str, interval: str, outputsize: int) -> tuple[list[dict] | None, str]:
    params = urllib.parse.urlencode({
        "symbol": "XAU/USD",
        "interval": interval,
        "outputsize": outputsize,
        "apikey": api_key,
    })
    url = f"https://api.twelvedata.com/time_series?{params}"
    try:
        with urllib.request.urlopen(url, timeout=TWELVE_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
    except Exception as exc:
        return None, f"{interval}: Twelve Data request failed: {exc}"

    if body.get("status") == "error" or "values" not in body:
        return None, f"{interval}: {body.get('message') or 'Twelve Data returned no candle values.'}"

    rows = body["values"]
    if not rows:
        return None, f"{interval}: Twelve Data returned an empty candle list."

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
        return None, f"{interval}: Twelve Data candle parsing produced no usable rows."

    return candles, ""


def _compact_candles(candles: list[dict], limit: int) -> list[list[Any]]:
    compact: list[list[Any]] = []
    for c in candles[-limit:]:
        compact.append([
            datetime.fromtimestamp(int(c["time"]), timezone.utc).strftime("%Y-%m-%d %H:%M"),
            c["open"],
            c["high"],
            c["low"],
            c["close"],
        ])
    return compact


def _trim_payload_for_client(payload: dict) -> dict:
    trimmed = dict(payload)
    timeframes = dict(trimmed.get("timeframes") or {})
    limits = {"5m": 220, "15m": 120, "1h": 120, "4h": 80}
    for key, limit in limits.items():
        if isinstance(timeframes.get(key), list):
            timeframes[key] = timeframes[key][-limit:]
    primary = timeframes.get("5m") or trimmed.get("candles") or []
    trimmed["timeframes"] = timeframes
    trimmed["candles"] = primary[-limits["5m"]:]
    trimmed["rows"] = len(trimmed["candles"])
    return trimmed


def _analysis_schema() -> dict:
    text = {"type": "string"}
    number = {"type": "number"}
    return {
        "type": "object",
        "properties": {
            "market_overview": {
                "type": "object",
                "properties": {
                    "current_price": number,
                    "price_change": text,
                    "market_bias": text,
                    "best_opportunity": text,
                    "trade_suitability": text,
                    "summary": text,
                },
                "required": ["current_price", "price_change", "market_bias", "best_opportunity", "trade_suitability", "summary"],
            },
            "multi_timeframe_structure": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "timeframe": text,
                        "trend": text,
                        "key_support": text,
                        "key_resistance": text,
                        "structure_notes": text,
                        "conclusion": text,
                    },
                    "required": ["timeframe", "trend", "key_support", "key_resistance", "structure_notes", "conclusion"],
                },
            },
            "key_levels_and_liquidity": {
                "type": "object",
                "properties": {
                    "high_rejection_zone": text,
                    "key_resistance_zone": text,
                    "short_term_pressure": text,
                    "key_support_zone": text,
                    "buy_side_liquidity": text,
                    "sell_side_liquidity": text,
                    "stop_hunt_area": text,
                    "most_likely_sweep": text,
                },
                "required": ["high_rejection_zone", "key_resistance_zone", "short_term_pressure", "key_support_zone", "buy_side_liquidity", "sell_side_liquidity", "stop_hunt_area", "most_likely_sweep"],
            },
            "probability_view": {
                "type": "object",
                "properties": {
                    "bullish_probability": number,
                    "bearish_probability": number,
                    "range_probability": number,
                    "reversal_probability": number,
                    "explanation": text,
                },
                "required": ["bullish_probability", "bearish_probability", "range_probability", "reversal_probability", "explanation"],
            },
            "scenarios": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "path": text,
                        "name": text,
                        "probability": number,
                        "direction": text,
                        "trigger": text,
                        "target": text,
                        "invalidation": text,
                        "response": text,
                    },
                    "required": ["path", "name", "probability", "direction", "trigger", "target", "invalidation", "response"],
                },
            },
            "trade_plans": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "linked_path": text,
                        "direction": text,
                        "entry": text,
                        "sl": text,
                        "tp1": text,
                        "tp2": text,
                        "tp3": text,
                        "rr": text,
                        "confidence": text,
                        "invalidation": text,
                        "note": text,
                    },
                    "required": ["linked_path", "direction", "entry", "sl", "tp1", "tp2", "tp3", "rr", "confidence", "invalidation", "note"],
                },
            },
            "risk_control": {
                "type": "object",
                "properties": {
                    "no_trade_conditions": {"type": "array", "items": text},
                    "main_risks": {"type": "array", "items": text},
                    "invalidation_summary": text,
                },
                "required": ["no_trade_conditions", "main_risks", "invalidation_summary"],
            },
            "final_conclusion": {
                "type": "object",
                "properties": {
                    "main_direction": text,
                    "best_action_now": text,
                    "key_area_to_wait_for": text,
                    "dangerous_area": text,
                    "conclusion_text": text,
                },
                "required": ["main_direction", "best_action_now", "key_area_to_wait_for", "dangerous_area", "conclusion_text"],
            },
        },
        "required": ["market_overview", "multi_timeframe_structure", "key_levels_and_liquidity", "probability_view", "scenarios", "trade_plans", "risk_control", "final_conclusion"],
    }


def _build_gemini_prompt(payload: dict) -> str:
    timeframes = payload.get("timeframes") or {}
    market = {
        "symbol": payload.get("ticker", "XAU/USD"),
        "data_source": payload.get("data_source", "Twelve Data"),
        "latest_close": payload.get("latest_close"),
        "latest_time_utc": payload.get("latest_time"),
        "current_time_utc": datetime.now(timezone.utc).isoformat(),
        "rows_5m": payload.get("rows"),
        "rows_15m": len(timeframes.get("15m") or []),
        "rows_1h": len(timeframes.get("1h") or []),
        "rows_4h": len(timeframes.get("4h") or []),
    }
    compact = {
        "5m": _compact_candles(timeframes.get("5m") or payload.get("candles") or [], 60),
        "15m": _compact_candles(timeframes.get("15m") or [], 40),
        "1h": _compact_candles(timeframes.get("1h") or [], 40),
        "4h": _compact_candles(timeframes.get("4h") or [], 30),
    }
    return (
        "角色：你是 XAUUSD 黄金/美元盘面结构分析员，只做行情结构复盘和交易计划辅助，不做投资建议。\n"
        "数据边界：你只能使用我提供的 Twelve Data OHLC K线事实；不要补充新闻、宏观事件、订单流、成交量含义或外部价格。\n"
        "如果数据不足、市场疑似休市、最新K线不够新、结构不清楚、关键位不清楚，必须写“不知道”或“等待确认”。\n"
        "不要为了填满字段而编造压力、支撑、流动性、FVG、OB、Entry、SL、TP 或概率。\n\n"
        "分析框架：\n"
        "1. 4H 判断大方向，1H 判断主结构，15M 判断中短线节奏，5M 只负责执行观察。\n"
        "2. BOS 是顺趋势突破有效 swing；CHoCH 是反向突破有效结构点；FVG 是三根K失衡区；Liquidity 只能来自明显前高/前低、Equal High/Low 或日内极值附近。\n"
        "3. BOS/CHoCH/FVG/Liquidity 只是结构信息，不等于买卖信号。\n"
        "4. 如果多周期冲突、价格在区间中部、RR 不清楚、没有回踩/反抽确认，交易计划必须写 Wait。\n\n"
        "输出约束：\n"
        "1. 必须严格返回 JSON schema 要求的字段，不要输出 Markdown 或额外说明。\n"
        "2. multi_timeframe_structure 尽量输出 4 条：4H、1H、15M、5M；缺数据就该周期写“不知道”。\n"
        "3. probability_view 的四个概率必须是 0 到 100 的数字；如果不能判断，全部填 0，并在 explanation 说明原因。\n"
        "4. scenarios 必须对应路径 A/B/C/D。路径 A 必须和最大概率项、market_bias、final_conclusion 保持一致；如果不一致，整体降级为等待确认。\n"
        "5. trade_plans 必须绑定 linked_path=A/B/C/D。没有清晰 Entry、SL、TP1/TP2 或 RR 时，direction 写 Wait，Entry/SL/TP/RR 写“等待确认”。\n"
        "6. final_conclusion 必须说明：当前主方向、最该等的位置、危险区域、当前是否适合交易；不清楚就写等待确认。\n"
        "7. 文案短、具体、像真实交易员；不要教科书式解释，不要承诺胜率。\n\n"
        f"市场事实：{json.dumps(market, ensure_ascii=False)}\n"
        "K线格式：[UTC时间, open, high, low, close]。\n"
        f"多周期K线：{json.dumps(compact, ensure_ascii=False)}"
    )


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_gemini_analysis(payload: dict, gemini_key: str, cache_key: str) -> tuple[dict | None, str]:
    if not gemini_key:
        return None, "缺少 GEMINI_API_KEY，当前只显示行情数据和基础指标。"

    model = os.getenv("GEMINI_MODEL", "").strip() or "gemini-2.5-flash-lite"
    url_model = urllib.parse.quote(model, safe="")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{url_model}:generateContent?key={urllib.parse.quote(gemini_key)}"
    body = {
        "contents": [{"role": "user", "parts": [{"text": _build_gemini_prompt(payload)}]}],
        "generationConfig": {
            "temperature": 0.25,
            "responseMimeType": "application/json",
            "responseSchema": _analysis_schema(),
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=GEMINI_TIMEOUT_SECONDS) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
                break
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")[:500]
            if exc.code in (429, 500, 502, 503, 504) and attempt == 0:
                time.sleep(1.2)
                continue
            return None, f"Gemini request failed: HTTP {exc.code} {detail}"
        except Exception as exc:
            if attempt == 0:
                time.sleep(1.2)
                continue
            return None, f"Gemini request failed: {exc}"

    try:
        text = raw["candidates"][0]["content"]["parts"][0]["text"]
        analysis = json.loads(text)
        analysis["_meta"] = {
            "model": model,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "Gemini",
        }
        return analysis, ""
    except Exception as exc:
        return None, f"Gemini response parsing failed: {exc}"


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_from_twelvedata(api_key: str, cache_key: str) -> tuple[dict | None, str]:
    """Twelve Data XAU/USD multi-timeframe candles."""
    intervals = {
        "5m": ("5min", 300),
        "15m": ("15min", 220),
        "1h": ("1h", 220),
        "4h": ("4h", 160),
    }
    timeframes: dict[str, list[dict]] = {}
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=len(intervals)) as executor:
        futures = {
            executor.submit(_fetch_interval, api_key, interval, outputsize): key
            for key, (interval, outputsize) in intervals.items()
        }
        for future in as_completed(futures):
            key = futures[future]
            try:
                candles, error = future.result()
            except Exception as exc:
                candles, error = None, f"{key}: Twelve Data request failed: {exc}"
            if candles:
                timeframes[key] = candles
            elif error:
                errors.append(error)

    primary = timeframes.get("5m") or []
    if not primary:
        return None, "；".join(errors) or "Twelve Data returned no usable 5min XAU/USD data."

    return {
        "ticker": "XAU/USD",
        "data_source": "Twelve Data",
        "candles": primary,
        "timeframes": timeframes,
        "rows": len(primary),
        "close": primary[-1]["close"] if primary else None,
        "latest_close": primary[-1]["close"] if primary else None,
        "latest_time": datetime.fromtimestamp(primary[-1]["time"], timezone.utc).isoformat() if primary else "",
        "partial_errors": errors,
        "is_demo_data": False,
    }, ""


def _make_data_script(payload: dict | None, error: str = "", ai_analysis: dict | None = None, ai_error: str = "") -> str:
    safe_error = json.dumps(error, ensure_ascii=False)
    safe_ai_error = json.dumps(ai_error, ensure_ascii=False)
    ai_data = json.dumps(ai_analysis, ensure_ascii=False) if ai_analysis else "null"
    if payload:
        data = json.dumps(_trim_payload_for_client(payload), ensure_ascii=False)
        return (
            f"<script>window.__XAUUSD_REAL_DATA__={data};"
            "window.__XAUUSD_DATA_ERROR__='';"
            f"window.__XAUUSD_AI_ANALYSIS__={ai_data};"
            f"window.__XAUUSD_AI_ERROR__={safe_ai_error};</script>"
        )
    return (
        "<script>"
        "window.__XAUUSD_REAL_DATA__=null;"
        f"window.__XAUUSD_DATA_ERROR__={safe_error};"
        f"window.__XAUUSD_AI_ANALYSIS__={ai_data};"
        f"window.__XAUUSD_AI_ERROR__={safe_ai_error};"
        "</script>"
    )


def _refresh_cache_key() -> str:
    force_refresh = str(st.query_params.get("force_refresh", "")).strip()
    if force_refresh:
        return force_refresh
    return str(int(datetime.now(timezone.utc).timestamp() // 3600))


def _should_generate_ai() -> bool:
    return bool(str(st.query_params.get("generate_ai", "")).strip())


def _cached_ai_for_payload(payload: dict) -> tuple[dict | None, str]:
    cached = st.session_state.get("xauusd_ai_analysis")
    if not isinstance(cached, dict):
        return None, "AI 分析尚未生成，请点击顶部“生成 AI 分析”。"

    analysis = cached.get("analysis")
    source_close = cached.get("latest_close")
    current_close = payload.get("latest_close")
    if not analysis:
        return None, "AI 分析尚未生成，请点击顶部“生成 AI 分析”。"

    try:
        if source_close and current_close:
            change = abs(float(current_close) - float(source_close)) / max(float(source_close), 1)
            if change > 0.003:
                return None, "行情较上次 AI 分析已明显变化，请重新生成 AI 分析。"
    except Exception:
        pass

    return analysis, ""


def _store_ai_analysis(payload: dict, analysis: dict) -> None:
    st.session_state["xauusd_ai_analysis"] = {
        "analysis": analysis,
        "latest_close": payload.get("latest_close"),
        "latest_time": payload.get("latest_time"),
        "stored_at": datetime.now(timezone.utc).isoformat(),
    }


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
        if str(st.query_params.get("force_refresh", "")).strip():
            st.session_state.pop("xauusd_ai_analysis", None)

        real, error = _fetch_from_twelvedata(api_key, _refresh_cache_key())
        ai_analysis, ai_error = (None, "")
        if real:
            ai_analysis, ai_error = _cached_ai_for_payload(real)
            if _should_generate_ai():
                ai_analysis, ai_error = _fetch_gemini_analysis(real, _get_gemini_key(), str(st.query_params.get("generate_ai", "")))
                if ai_analysis:
                    _store_ai_analysis(real, ai_analysis)
        inject = _make_data_script(real, error, ai_analysis, ai_error)

    html = HTML_TPL.replace("__REAL_DATA_SCRIPT__", inject)
    html = html.replace("__JS_PLACEHOLDER__", js_content)
    html = html.replace("__CSS_PLACEHOLDER__", css_content)

    st.components.v1.html(html, height=4200, scrolling=True)


def main() -> None:
    st.set_page_config(page_title="XAUUSD Market Structure Dashboard",
                       page_icon="🟡", layout="wide")

    st.markdown("""
    <style>
      .stApp{background:#0a0e14}
      .block-container{padding:62px 0 0!important;max-width:100%!important}
    </style>
    """, unsafe_allow_html=True)

    _render_dashboard()


if __name__ == "__main__":
    main()
