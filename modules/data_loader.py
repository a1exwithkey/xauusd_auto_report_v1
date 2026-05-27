"""Market data loading helpers for XAUUSD report app."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd
import pytz
import streamlit as st
import yfinance as yf


REQUIRED_COLUMNS = ["Open", "High", "Low", "Close", "Volume"]
XAU_TICKERS = ["GC=F", "XAUUSD=X"]
DXY_TICKER = "DX-Y.NYB"


def _empty_ohlc() -> pd.DataFrame:
    return pd.DataFrame(columns=REQUIRED_COLUMNS)


def _normalise_ohlc(raw: pd.DataFrame | None) -> pd.DataFrame:
    """Return a single-level OHLCV dataframe from yfinance output."""
    if raw is None or raw.empty:
        return _empty_ohlc()

    df = raw.copy()

    if isinstance(df.columns, pd.MultiIndex):
        selected: dict[str, pd.Series] = {}
        for field in REQUIRED_COLUMNS:
            matches = [col for col in df.columns if field in [str(part) for part in col]]
            if matches:
                selected[field] = df[matches[0]]
        df = pd.DataFrame(selected, index=df.index)
    else:
        rename_map = {str(col).strip().title(): col for col in df.columns}
        selected = {}
        for field in REQUIRED_COLUMNS:
            source = rename_map.get(field)
            if source is not None:
                selected[field] = df[source]
        df = pd.DataFrame(selected, index=df.index)

    for col in REQUIRED_COLUMNS:
        if col not in df.columns:
            df[col] = 0.0 if col == "Volume" else pd.NA

    df = df[REQUIRED_COLUMNS].apply(pd.to_numeric, errors="coerce")
    df = df.dropna(subset=["Open", "High", "Low", "Close"])
    if df.empty:
        return _empty_ohlc()

    df["Volume"] = df["Volume"].fillna(0)
    df = df.sort_index()
    df.index = pd.to_datetime(df.index)
    return df


def _download(ticker: str, period: str, interval: str) -> tuple[pd.DataFrame, str | None]:
    try:
        raw = yf.download(
            ticker,
            period=period,
            interval=interval,
            auto_adjust=False,
            progress=False,
            threads=False,
        )
        df = _normalise_ohlc(raw)
        if df.empty:
            return df, f"{ticker} returned empty {interval} data"
        return df, None
    except Exception as exc:  # yfinance/network errors should not crash the app
        return _empty_ohlc(), f"{ticker} {interval} download failed: {exc}"


def _resample_4h(df_1h: pd.DataFrame) -> pd.DataFrame:
    if df_1h.empty:
        return _empty_ohlc()

    try:
        resampled = df_1h.resample("4h").agg(
            {
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum",
            }
        )
        return _normalise_ohlc(resampled.dropna(subset=["Open", "High", "Low", "Close"]))
    except Exception:
        return _empty_ohlc()


def _dxy_status(dxy: pd.DataFrame) -> str:
    if dxy.empty or len(dxy) < 2:
        return "DXY unavailable"

    try:
        latest = float(dxy["Close"].iloc[-1])
        day_open = float(dxy["Open"].dropna().iloc[-1])
        change = (latest - day_open) / day_open * 100 if day_open else 0.0
        if change > 0.15:
            return f"DXY strong ({change:+.2f}%)"
        if change < -0.15:
            return f"DXY weak ({change:+.2f}%)"
        return f"DXY neutral ({change:+.2f}%)"
    except Exception:
        return "DXY unavailable"


@st.cache_data(ttl=3600, show_spinner=False)
def load_market_data() -> dict[str, Any]:
    """Load XAUUSD/Gold futures and DXY data with ticker fallbacks."""
    errors: list[str] = []
    selected_symbol = ""
    m5 = _empty_ohlc()
    h1 = _empty_ohlc()

    for ticker in XAU_TICKERS:
        candidate_m5, err_m5 = _download(ticker, period="5d", interval="5m")
        candidate_h1, err_h1 = _download(ticker, period="60d", interval="1h")

        if err_m5:
            errors.append(err_m5)
        if err_h1:
            errors.append(err_h1)

        if not candidate_m5.empty and not candidate_h1.empty:
            selected_symbol = ticker
            m5 = candidate_m5
            h1 = candidate_h1
            break

    dxy, dxy_error = _download(DXY_TICKER, period="5d", interval="1h")
    if dxy_error:
        errors.append(dxy_error)

    tz = pytz.timezone("Asia/Shanghai")
    return {
        "symbol": selected_symbol or "Unavailable",
        "m5": m5,
        "h1": h1,
        "h4": _resample_4h(h1),
        "dxy": dxy,
        "dxy_status": _dxy_status(dxy),
        "errors": errors,
        "last_updated": datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S %Z"),
    }
