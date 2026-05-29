"""Chinese report generation for the XAUUSD structure dashboard. Cached per input fingerprint."""

from __future__ import annotations

from typing import Any

import pandas as pd
import streamlit as st


def fmt_price(value: float | int | None) -> str:
    if value is None:
        return "等待结构确认"
    try:
        return f"{float(value):,.2f}"
    except Exception:
        return "等待结构确认"


def _label(value: str) -> str:
    labels = {
        "bullish": "偏多",
        "bearish": "偏空",
        "range": "震荡",
        "high": "高",
        "medium": "中",
        "low": "低",
        "smartmoneyconcepts": "SMC包",
        "fallback": "简化规则",
        "volume_vwap": "成交量VWAP",
        "fallback_typical_price_rolling_mean": "均价VWAP替代",
        "indicator_error": "指标计算异常",
        "not_calculated": "未计算",
    }
    return labels.get(str(value), str(value))


def _latest(df: pd.DataFrame, column: str) -> float | None:
    try:
        series = pd.to_numeric(df[column], errors="coerce").dropna()
        return float(series.iloc[-1]) if not series.empty else None
    except Exception:
        return None


def _day_stats(df_5m: pd.DataFrame) -> dict[str, float | None]:
    if df_5m.empty:
        return {"open": None, "high": None, "low": None, "change_pct": None}
    today = df_5m[df_5m.index.date == df_5m.index[-1].date()]
    if today.empty:
        today = df_5m.tail(96)
    day_open = _latest(today.head(1), "Open")
    latest_close = _latest(df_5m, "Close")
    high = float(today["High"].max()) if not today.empty else None
    low = float(today["Low"].min()) if not today.empty else None
    change_pct = None
    if day_open and latest_close:
        change_pct = (latest_close - day_open) / day_open * 100
    return {"open": day_open, "high": high, "low": low, "change_pct": change_pct}


def _levels(structures: dict[str, dict[str, Any]]) -> tuple[list[float], list[float]]:
    supports: list[float] = []
    resistances: list[float] = []
    for structure in structures.values():
        supports.extend([float(v) for v in structure.get("support_levels", []) if v is not None])
        resistances.extend([float(v) for v in structure.get("resistance_levels", []) if v is not None])
    return sorted(set(supports)), sorted(set(resistances))


def _nearest_below(levels: list[float], price: float | None) -> float | None:
    if price is None:
        return None
    below = [level for level in levels if level < price]
    return max(below) if below else None


def _nearest_above(levels: list[float], price: float | None) -> float | None:
    if price is None:
        return None
    above = [level for level in levels if level > price]
    return min(above) if above else None


def _rr(entry: float | None, stop: float | None, target: float | None) -> str:
    if entry is None or stop is None or target is None or entry == stop:
        return "等待结构确认"
    risk = abs(entry - stop)
    reward = abs(target - entry)
    if risk <= 0:
        return "等待结构确认"
    return f"1:{reward / risk:.1f}"


def _plan(
    direction: str,
    entry: float | None,
    stop: float | None,
    tp1: float | None,
    tp2: float | None,
    trigger: str,
    invalidation: str,
) -> dict[str, str]:
    return {
        "Direction": direction,
        "Entry zone": fmt_price(entry),
        "Stop Loss": fmt_price(stop),
        "TP1": fmt_price(tp1),
        "TP2": fmt_price(tp2),
        "Risk Reward": _rr(entry, stop, tp2),
        "触发条件": trigger,
        "失效条件": invalidation,
    }


def _generate_plans(
    main_bias: str,
    price: float | None,
    atr: float | None,
    supports: list[float],
    resistances: list[float],
) -> list[dict[str, str]]:
    if price is None or atr is None or atr <= 0:
        return [_plan("等待", None, None, None, None, "等待更多数据", "等待结构确认")]

    support = _nearest_below(supports, price)
    resistance = _nearest_above(resistances, price)

    if main_bias == "bearish":
        entry_pullback = resistance or price + atr * 0.8
        breakdown = support or price - atr * 0.8
        return [
            _plan("反抽空", entry_pullback, entry_pullback + atr * 0.8, price - atr, price - atr * 2, "反抽阻力或 bearish FVG 后收盘转弱", "重新站上阻力并形成 bullish CHOCH"),
            _plan("破位空", breakdown, breakdown + atr * 0.7, breakdown - atr, breakdown - atr * 2, "收盘跌破最近支撑并放量延续", "跌破后快速收回区间"),
            _plan("已有空单管理", price, price + atr, support, support - atr if support else price - atr * 2, "价格维持 EMA20 下方", "5min 连续收回 EMA50 上方"),
            _plan("扫低反弹谨慎多", support, support - atr * 0.6 if support else None, price + atr, resistance, "扫 sell-side liquidity 后出现 bullish CHOCH", "再次跌破扫低低点"),
        ]

    if main_bias == "bullish":
        entry_pullback = support or price - atr * 0.8
        breakout = resistance or price + atr * 0.8
        return [
            _plan("回踩多", entry_pullback, entry_pullback - atr * 0.8, price + atr, price + atr * 2, "回踩支撑或 bullish FVG 后收盘转强", "跌破支撑并形成 bearish CHOCH"),
            _plan("突破多", breakout, breakout - atr * 0.7, breakout + atr, breakout + atr * 2, "收盘突破最近阻力并延续", "突破后快速跌回区间"),
            _plan("已有多单管理", price, price - atr, resistance, resistance + atr if resistance else price + atr * 2, "价格维持 EMA20 上方", "5min 连续收回 EMA50 下方"),
            _plan("扫高回落谨慎空", resistance, resistance + atr * 0.6 if resistance else None, price - atr, support, "扫 buy-side liquidity 后出现 bearish CHOCH", "再次突破扫高高点"),
        ]

    upper = resistance or price + atr
    lower = support or price - atr
    return [
        _plan("区间高空", upper, upper + atr * 0.6, price, lower, "触及区间上沿后出现拒绝K线", "收盘站稳区间上沿"),
        _plan("区间低多", lower, lower - atr * 0.6, price, upper, "触及区间下沿后出现拒绝K线", "收盘跌破区间下沿"),
        _plan("突破跟随", upper, upper - atr * 0.6, upper + atr, upper + atr * 2, "收盘有效突破区间并回踩不破", "突破后重新回到区间"),
        _plan("假突破反打", upper, upper + atr * 0.5, price, lower, "扫高后快速回落至区间内", "重新站上扫高高点"),
    ]


def _df_key(df: pd.DataFrame) -> str:
    if df is None or df.empty:
        return "empty"
    return f"{len(df)}_{df.index[0]}_{df.index[-1]}_{df['Close'].iloc[-1]:.5f}"


@st.cache_data(ttl=3600, hash_funcs={pd.DataFrame: _df_key}, show_spinner=False)
def generate_report(
    symbol: str,
    df_5m: pd.DataFrame,
    structures: dict[str, dict[str, Any]],
    scores: dict[str, Any],
    dxy_status: str,
    last_updated: str,
    vwap_status: str,
) -> dict[str, Any]:
    price = _latest(df_5m, "Close")
    atr = _latest(df_5m, "ATR14")
    stats = _day_stats(df_5m)
    supports, resistances = _levels(structures)
    main_bias = scores.get("main_bias", "range")

    if main_bias == "bearish":
        paths = [
            "主路径：反抽 EMA20/阻力后继续向下测试卖方流动性。",
            "次路径：先回补上方 FVG，再出现弱收盘确认延续。",
            "极端路径：站回关键阻力并触发 bullish CHOCH，空头结构失效。",
        ]
        priority = "优先等待反抽空或破位空确认，不追低。"
    elif main_bias == "bullish":
        paths = [
            "主路径：回踩支撑或 bullish FVG 后继续向上测试买方流动性。",
            "次路径：先扫低制造流动性，再形成 bullish CHOCH 后上行。",
            "极端路径：跌破关键支撑并触发 bearish CHOCH，多头结构失效。",
        ]
        priority = "优先等待回踩多或突破多确认，不追高。"
    else:
        paths = [
            "主路径：维持区间震荡，围绕日内中位区反复换手。",
            "次路径：扫高或扫低后回到区间，形成假突破反打。",
            "极端路径：收盘有效脱离区间后，转为突破跟随。",
        ]
        priority = "优先按区间上下沿处理，突破确认前降低方向假设。"

    confirmation = _nearest_above(resistances, price) if main_bias == "bullish" else _nearest_below(supports, price)
    invalidation = _nearest_below(supports, price) if main_bias == "bullish" else _nearest_above(resistances, price)

    conclusion = (
        f"当前结构倾向为 {_label(main_bias)}，置信度 {_label(scores.get('confidence', 'low'))}。"
        f"关键确认位：{fmt_price(confirmation)}；关键失效位：{fmt_price(invalidation)}。"
        f"{priority} 本页面只用于复盘和结构分析，不构成投资建议。"
    )

    return {
        "overview": {
            "品种": symbol,
            "当前价格": fmt_price(price),
            "日内涨跌幅": "等待结构确认" if stats["change_pct"] is None else f"{stats['change_pct']:+.2f}%",
            "日高": fmt_price(stats["high"]),
            "日低": fmt_price(stats["low"]),
            "更新时间": last_updated,
            "DXY 状态": dxy_status,
            "主方向": main_bias,
            "VWAP 状态": vwap_status,
        },
        "multi_timeframe": {key: value.get("summary", "等待结构确认") for key, value in structures.items()},
        "paths": paths,
        "plans": _generate_plans(main_bias, price, atr, supports, resistances),
        "risk": [
            "单笔风险建议控制在账户权益的 0.5%-1% 以内。",
            "重大宏观事件、CPI、FOMC、非农前后谨慎降低仓位或暂停。",
            "若关键结构位被收盘价反向突破，原结构假设失效。",
            "本工具只做行情复盘和结构展示，不构成投资建议或收益承诺。",
        ],
        "conclusion": conclusion,
    }
