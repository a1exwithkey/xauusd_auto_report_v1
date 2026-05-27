"""SMC/ICT structure engine with optional smartmoneyconcepts support."""

from __future__ import annotations

from typing import Any

import pandas as pd


def _price(value: Any) -> float | None:
    try:
        if pd.isna(value):
            return None
        return round(float(value), 2)
    except Exception:
        return None


def _latest_atr(df: pd.DataFrame) -> float:
    if "ATR14" in df.columns and not df["ATR14"].dropna().empty:
        return float(df["ATR14"].dropna().iloc[-1])
    if df.empty:
        return 0.0
    return max(float(df["Close"].iloc[-1]) * 0.001, 0.1)


def _to_smc_ohlc(df: pd.DataFrame) -> pd.DataFrame:
    out = df.rename(columns={c: c.lower() for c in df.columns}).copy()
    cols = ["open", "high", "low", "close", "volume"]
    for col in cols:
        if col not in out:
            out[col] = 0.0
    return out[cols].reset_index(drop=True)


def identify_swings(df: pd.DataFrame, left: int = 3, right: int = 3) -> pd.DataFrame:
    out = df.copy()
    out["swing_high"] = pd.NA
    out["swing_low"] = pd.NA
    if len(out) < left + right + 1:
        return out

    for idx in range(left, len(out) - right):
        window = out.iloc[idx - left : idx + right + 1]
        current_high = out["High"].iloc[idx]
        current_low = out["Low"].iloc[idx]
        if current_high > window["High"].drop(window.index[left]).max():
            out.loc[out.index[idx], "swing_high"] = current_high
        if current_low < window["Low"].drop(window.index[left]).min():
            out.loc[out.index[idx], "swing_low"] = current_low
    return out


def _trend_from_swings(swing_highs: pd.Series, swing_lows: pd.Series) -> str:
    highs = swing_highs.dropna().tail(2)
    lows = swing_lows.dropna().tail(2)
    if len(highs) < 2 or len(lows) < 2:
        return "neutral"
    if highs.iloc[-1] > highs.iloc[-2] and lows.iloc[-1] > lows.iloc[-2]:
        return "bullish"
    if highs.iloc[-1] < highs.iloc[-2] and lows.iloc[-1] < lows.iloc[-2]:
        return "bearish"
    return "neutral"


def _detect_fvg(df: pd.DataFrame, limit: int = 5) -> list[dict[str, Any]]:
    zones: list[dict[str, Any]] = []
    if len(df) < 3:
        return zones
    for idx in range(2, len(df)):
        c1 = df.iloc[idx - 2]
        c3 = df.iloc[idx]
        zone = None
        if float(c3["Low"]) > float(c1["High"]):
            zone = {"type": "bullish", "lower": _price(c1["High"]), "upper": _price(c3["Low"]), "start_time": df.index[idx - 2]}
        elif float(c3["High"]) < float(c1["Low"]):
            zone = {"type": "bearish", "lower": _price(c3["High"]), "upper": _price(c1["Low"]), "start_time": df.index[idx - 2]}
        if not zone:
            continue
        future = df.iloc[idx + 1 :]
        filled = (
            not future.empty
            and (
                future["Low"].min() <= float(zone["lower"])
                if zone["type"] == "bullish"
                else future["High"].max() >= float(zone["upper"])
            )
        )
        if not filled:
            zones.append(zone)
    return zones[-limit:]


def _equal_levels(levels: pd.Series, atr_value: float, label: str) -> list[dict[str, Any]]:
    recent = levels.dropna().tail(8)
    if len(recent) < 2:
        return []
    threshold = max(atr_value * 0.25, 0.1)
    groups = []
    values = list(recent.items())
    for i, (_, value_i) in enumerate(values):
        cluster = [float(value_i)]
        for _, value_j in values[i + 1 :]:
            if abs(float(value_i) - float(value_j)) <= threshold:
                cluster.append(float(value_j))
        if len(cluster) >= 2:
            groups.append({"type": label, "level": _price(sum(cluster) / len(cluster)), "touches": len(cluster)})
    return groups[-3:]


def _fallback_structure(df: pd.DataFrame, timeframe: str) -> dict[str, Any]:
    work = identify_swings(df)
    latest_close = float(work["Close"].iloc[-1])
    atr_value = _latest_atr(work)
    trend = _trend_from_swings(work["swing_high"], work["swing_low"])
    highs = work["swing_high"].dropna()
    lows = work["swing_low"].dropna()

    bos = "none"
    if not highs.empty and latest_close > float(highs.iloc[-1]):
        bos = "bullish BOS"
    elif not lows.empty and latest_close < float(lows.iloc[-1]):
        bos = "bearish BOS"

    choch = "none"
    if trend == "bearish" and not highs.empty and latest_close > float(highs.iloc[-1]):
        choch = "bullish CHOCH"
    elif trend == "bullish" and not lows.empty and latest_close < float(lows.iloc[-1]):
        choch = "bearish CHOCH"

    support = [_price(v) for v in lows.tail(3).tolist()]
    resistance = [_price(v) for v in highs.tail(3).tolist()]
    support = [v for v in support if v is not None]
    resistance = [v for v in resistance if v is not None]
    equal_highs = _equal_levels(highs, atr_value, "equal_high")
    equal_lows = _equal_levels(lows, atr_value, "equal_low")

    buy_liquidity = equal_highs or ([{"type": "prior_high", "level": resistance[-1], "touches": 1}] if resistance else [])
    sell_liquidity = equal_lows or ([{"type": "prior_low", "level": support[-1], "touches": 1}] if support else [])

    return {
        "timeframe": timeframe,
        "engine": "fallback",
        "trend": trend,
        "bos": bos,
        "choch": choch,
        "support_levels": support,
        "resistance_levels": resistance,
        "fvg_zones": _detect_fvg(work),
        "order_blocks": [],
        "buy_side_liquidity": buy_liquidity,
        "sell_side_liquidity": sell_liquidity,
        "summary": f"{timeframe}: 结构{_cn_trend(trend)}；BOS={bos}；CHOCH={choch}；支撑 {support[-2:] or '待确认'}；阻力 {resistance[-2:] or '待确认'}。",
    }


def _smc_structure(df: pd.DataFrame, timeframe: str) -> dict[str, Any]:
    from smartmoneyconcepts import smc

    ohlc = _to_smc_ohlc(df)
    swing = smc.swing_highs_lows(ohlc, swing_length=5)
    bos_choch = smc.bos_choch(ohlc, swing, close_break=True)
    fvg = smc.fvg(ohlc, join_consecutive=False)
    liquidity = smc.liquidity(ohlc, swing, range_percent=0.01)
    try:
        ob = smc.ob(ohlc, swing, close_mitigation=False)
    except Exception:
        ob = pd.DataFrame()

    fallback = _fallback_structure(df, timeframe)
    fallback["engine"] = "smartmoneyconcepts"

    if "BOS" in bos_choch and not bos_choch["BOS"].dropna().empty:
        val = int(bos_choch["BOS"].dropna().iloc[-1])
        fallback["bos"] = "bullish BOS" if val == 1 else "bearish BOS"
    if "CHOCH" in bos_choch and not bos_choch["CHOCH"].dropna().empty:
        val = int(bos_choch["CHOCH"].dropna().iloc[-1])
        fallback["choch"] = "bullish CHOCH" if val == 1 else "bearish CHOCH"

    if not fvg.empty and {"FVG", "Top", "Bottom"}.issubset(fvg.columns):
        zones = []
        valid = fvg[fvg["FVG"].notna()].tail(5)
        for idx, row in valid.iterrows():
            zones.append({
                "type": "bullish" if int(row["FVG"]) == 1 else "bearish",
                "lower": _price(row["Bottom"]),
                "upper": _price(row["Top"]),
                "start_time": df.index[min(int(idx), len(df) - 1)],
            })
        fallback["fvg_zones"] = zones

    if not liquidity.empty and {"Liquidity", "Level"}.issubset(liquidity.columns):
        buy, sell = [], []
        for _, row in liquidity[liquidity["Liquidity"].notna()].tail(5).iterrows():
            item = {"type": "smc_liquidity", "level": _price(row["Level"]), "touches": 2}
            if int(row["Liquidity"]) == 1:
                buy.append(item)
            else:
                sell.append(item)
        fallback["buy_side_liquidity"] = buy or fallback["buy_side_liquidity"]
        fallback["sell_side_liquidity"] = sell or fallback["sell_side_liquidity"]

    if not ob.empty and {"OB", "Top", "Bottom"}.issubset(ob.columns):
        fallback["order_blocks"] = [
            {
                "type": "bullish" if int(row["OB"]) == 1 else "bearish",
                "upper": _price(row["Top"]),
                "lower": _price(row["Bottom"]),
            }
            for _, row in ob[ob["OB"].notna()].tail(5).iterrows()
        ]

    fallback["summary"] = (
        f"{timeframe}: 结构{_cn_trend(fallback['trend'])}；引擎=SMC包；"
        f"BOS={fallback['bos']}；CHOCH={fallback['choch']}。"
    )
    return fallback


def _cn_trend(trend: str) -> str:
    return {"bullish": "偏多", "bearish": "偏空", "neutral": "中性"}.get(trend, trend)


def analyze_structure(df: pd.DataFrame, timeframe: str = "5min") -> dict[str, Any]:
    if df is None or df.empty or len(df) < 12:
        return {
            "timeframe": timeframe,
            "engine": "none",
            "trend": "neutral",
            "bos": "none",
            "choch": "none",
            "support_levels": [],
            "resistance_levels": [],
            "fvg_zones": [],
            "order_blocks": [],
            "buy_side_liquidity": [],
            "sell_side_liquidity": [],
            "summary": f"{timeframe}: 数据不足，等待更多K线确认。",
        }
    try:
        return _smc_structure(df, timeframe)
    except Exception:
        return _fallback_structure(df, timeframe)
