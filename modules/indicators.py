"""Technical indicator calculations — all functions are pure, deterministic, and cached."""

from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st


def _df_key(df: pd.DataFrame) -> str:
    """Fast deterministic key for DataFrame-based caching."""
    if df is None or df.empty:
        return "empty"
    return f"{len(df)}_{df.index[0]}_{df.index[-1]}_{df['Close'].iloc[-1]:.5f}"


def _safe_series(df: pd.DataFrame, column: str) -> pd.Series:
    return pd.to_numeric(df.get(column, pd.Series(index=df.index, dtype=float)), errors="coerce")


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False, min_periods=max(2, min(span, len(series)))).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    value = 100 - (100 / (1 + rs))
    return value.fillna(50)


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = _safe_series(df, "High")
    low = _safe_series(df, "Low")
    close = _safe_series(df, "Close")
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def _intraday_vwap(df: pd.DataFrame) -> tuple[pd.Series, str]:
    high = _safe_series(df, "High")
    low = _safe_series(df, "Low")
    close = _safe_series(df, "Close")
    volume = _safe_series(df, "Volume").fillna(0)
    typical = (high + low + close) / 3

    if volume.sum() <= 0:
        return typical.rolling(20, min_periods=1).mean(), "fallback_typical_price_rolling_mean"

    dates = pd.Series(df.index.date, index=df.index)
    cumulative_pv = (typical * volume).groupby(dates).cumsum()
    cumulative_volume = volume.groupby(dates).cumsum()
    vwap = cumulative_pv / cumulative_volume.replace(0, np.nan)
    return vwap.fillna(typical.rolling(20, min_periods=1).mean()), "volume_vwap"


@st.cache_data(ttl=3600, hash_funcs={pd.DataFrame: _df_key}, show_spinner=False)
def add_indicators(df: pd.DataFrame, include_vwap: bool = False) -> tuple[pd.DataFrame, dict[str, str]]:
    """Add EMA, RSI, ATR and optional VWAP columns. Cached per unique DataFrame fingerprint."""
    meta = {"vwap_status": "not_calculated"}
    if df is None or df.empty:
        return pd.DataFrame(), meta

    try:
        out = df.copy()
        close = _safe_series(out, "Close")

        for span in (20, 50, 200):
            out[f"EMA{span}"] = ema(close, span)

        if len(out) >= 610:
            out["EMA610"] = ema(close, 610)

        out["RSI14"] = rsi(close, 14)
        out["ATR14"] = atr(out, 14)

        if include_vwap:
            out["VWAP"], meta["vwap_status"] = _intraday_vwap(out)

        return out, meta
    except Exception as exc:
        fallback = df.copy()
        fallback.attrs["indicator_error"] = str(exc)
        return fallback, {"vwap_status": "indicator_error"}
