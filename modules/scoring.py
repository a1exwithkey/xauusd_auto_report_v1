"""Directional scoring model for report display."""

from __future__ import annotations

from typing import Any

import pandas as pd


def _last(df: pd.DataFrame, column: str) -> float | None:
    try:
        series = pd.to_numeric(df[column], errors="coerce").dropna()
        return float(series.iloc[-1]) if not series.empty else None
    except Exception:
        return None


def _add(score: dict[str, int], bucket: str, points: int, reasons: list[str], reason: str) -> None:
    score[bucket] += points
    reasons.append(reason)


def calculate_scores(
    df_5m: pd.DataFrame,
    structure_5m: dict[str, Any],
    structure_1h: dict[str, Any],
    structure_4h: dict[str, Any],
    dxy_status: str,
) -> dict[str, Any]:
    raw = {"bullish": 0, "bearish": 0, "range": 0}
    reasons: list[str] = []

    close = _last(df_5m, "Close")
    ema20 = _last(df_5m, "EMA20")
    ema50 = _last(df_5m, "EMA50")
    ema200 = _last(df_5m, "EMA200")
    rsi14 = _last(df_5m, "RSI14")
    atr14 = _last(df_5m, "ATR14")

    if close is not None and ema20 is not None:
        if close > ema20:
            _add(raw, "bullish", 8, reasons, "当前价格高于 EMA20")
        elif close < ema20:
            _add(raw, "bearish", 8, reasons, "当前价格低于 EMA20")

    if ema20 is not None and ema50 is not None:
        if ema20 > ema50:
            _add(raw, "bullish", 10, reasons, "EMA20 高于 EMA50")
        elif ema20 < ema50:
            _add(raw, "bearish", 10, reasons, "EMA20 低于 EMA50")

        if close is not None and atr14 is not None and abs(ema20 - ema50) <= max(atr14 * 0.25, close * 0.0005):
            _add(raw, "range", 15, reasons, "EMA20 / EMA50 附近缠绕")

    if ema50 is not None and ema200 is not None:
        if ema50 > ema200:
            _add(raw, "bullish", 12, reasons, "EMA50 高于 EMA200")
        elif ema50 < ema200:
            _add(raw, "bearish", 12, reasons, "EMA50 低于 EMA200")

    if rsi14 is not None:
        if rsi14 > 55:
            _add(raw, "bullish", 8, reasons, "RSI14 高于 55")
        elif rsi14 < 45:
            _add(raw, "bearish", 8, reasons, "RSI14 低于 45")
        else:
            _add(raw, "range", 15, reasons, "RSI14 位于 45-55 区间")

    if structure_5m.get("bos") == "bullish BOS":
        _add(raw, "bullish", 15, reasons, "5min 出现 bullish BOS")
    elif structure_5m.get("bos") == "bearish BOS":
        _add(raw, "bearish", 15, reasons, "5min 出现 bearish BOS")

    for label, structure, points in (("1H", structure_1h, 15), ("4H", structure_4h, 15)):
        if structure.get("trend") == "bullish":
            _add(raw, "bullish", points, reasons, f"{label} 结构偏多")
        elif structure.get("trend") == "bearish":
            _add(raw, "bearish", points, reasons, f"{label} 结构偏空")

    if any(zone.get("type") == "bearish" for zone in structure_5m.get("fvg_zones", [])):
        _add(raw, "bearish", 8, reasons, "上方存在 bearish FVG / supply zone")
    if any(zone.get("type") == "bullish" for zone in structure_5m.get("fvg_zones", [])):
        _add(raw, "bullish", 8, reasons, "下方存在 bullish FVG / demand zone")

    if "strong" in dxy_status.lower():
        _add(raw, "bearish", 8, reasons, "DXY 当日偏强")
    elif "weak" in dxy_status.lower():
        _add(raw, "bullish", 8, reasons, "DXY 当日偏弱")

    if structure_5m.get("trend") != "neutral" and structure_1h.get("trend") != "neutral":
        if structure_5m.get("trend") != structure_1h.get("trend"):
            _add(raw, "range", 20, reasons, "5min 与 1H 方向冲突")

    if close is not None and not df_5m.empty:
        recent = df_5m.tail(min(len(df_5m), 96))
        high = float(recent["High"].max())
        low = float(recent["Low"].min())
        midpoint = (high + low) / 2
        if high > low and abs(close - midpoint) <= (high - low) * 0.15:
            _add(raw, "range", 10, reasons, "当前价格接近日内中位区")

    if atr14 is not None and "ATR14" in df_5m:
        atr_median = pd.to_numeric(df_5m["ATR14"], errors="coerce").dropna().median()
        if pd.notna(atr_median) and atr14 < float(atr_median) * 0.8:
            _add(raw, "range", 10, reasons, "ATR 相对近期偏低")

    total = sum(raw.values())
    if total <= 0:
        return {
            "bullish_score": 0,
            "bearish_score": 0,
            "range_score": 100,
            "main_bias": "range",
            "confidence": "low",
            "reasons": ["有效数据不足，默认按区间观察"],
        }

    normalized = {key: round(value / total * 100, 1) for key, value in raw.items()}
    main_bias = max(normalized, key=normalized.get)
    top_score = normalized[main_bias]
    confidence = "high" if top_score >= 60 else "medium" if top_score >= 45 else "low"

    return {
        "bullish_score": normalized["bullish"],
        "bearish_score": normalized["bearish"],
        "range_score": normalized["range"],
        "main_bias": main_bias,
        "confidence": confidence,
        "reasons": reasons[:10],
    }
