"""Plotly chart builders."""

from __future__ import annotations

from typing import Any

import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots


GOLD = "#d8aa4f"
GREEN = "#36d17c"
RED = "#ff6363"
PANEL = "#111823"
GRID = "#30394c"


def create_price_chart(df: pd.DataFrame, structure: dict[str, Any]) -> go.Figure:
    fig = make_subplots(
        rows=2,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.04,
        row_heights=[0.72, 0.28],
    )

    if df is None or df.empty:
        fig.update_layout(template="plotly_dark", height=650, title="No market data")
        return fig

    fig.add_trace(
        go.Candlestick(
            x=df.index,
            open=df["Open"],
            high=df["High"],
            low=df["Low"],
            close=df["Close"],
            name="K线",
            increasing_line_color=GREEN,
            decreasing_line_color=RED,
        ),
        row=1,
        col=1,
    )

    ema_styles = {
        "EMA20": "#f7c948",
        "EMA50": "#70a1ff",
        "EMA200": "#a4b0be",
        "EMA610": "#8e8e93",
        "VWAP": "#ffffff",
    }
    for column, color in ema_styles.items():
        if column in df.columns:
            fig.add_trace(
                go.Scatter(
                    x=df.index,
                    y=df[column],
                    name=column,
                    mode="lines",
                    line=dict(color=color, width=1.2 if column != "VWAP" else 1.6, dash="dot" if column == "VWAP" else "solid"),
                ),
                row=1,
                col=1,
            )

    x0 = df.index[0]
    x1 = df.index[-1]
    for level in structure.get("support_levels", [])[-3:]:
        fig.add_hline(y=level, line_color=GREEN, line_width=1, line_dash="dash", row=1, col=1)
    for level in structure.get("resistance_levels", [])[-3:]:
        fig.add_hline(y=level, line_color=RED, line_width=1, line_dash="dash", row=1, col=1)

    for liquidity in structure.get("buy_side_liquidity", []):
        level = liquidity.get("level")
        if level:
            fig.add_hline(y=level, line_color="#ffda79", line_width=1, line_dash="dot", row=1, col=1)

    for liquidity in structure.get("sell_side_liquidity", []):
        level = liquidity.get("level")
        if level:
            fig.add_hline(y=level, line_color="#7bed9f", line_width=1, line_dash="dot", row=1, col=1)

    for zone in structure.get("fvg_zones", []):
        lower = zone.get("lower")
        upper = zone.get("upper")
        if lower is None or upper is None:
            continue
        fill = "rgba(54, 209, 124, 0.18)" if zone.get("type") == "bullish" else "rgba(255, 99, 99, 0.18)"
        fig.add_shape(
            type="rect",
            x0=zone.get("start_time", x0),
            x1=x1,
            y0=lower,
            y1=upper,
            fillcolor=fill,
            line=dict(width=0),
            row=1,
            col=1,
        )

    if "RSI14" in df.columns:
        fig.add_trace(
            go.Scatter(
                x=df.index,
                y=df["RSI14"],
                name="RSI14",
                mode="lines",
                line=dict(color=GOLD, width=1.4),
            ),
            row=2,
            col=1,
        )
        for level in (30, 50, 70):
            fig.add_hline(y=level, line_color=GRID, line_width=1, line_dash="dot", row=2, col=1)

    fig.update_layout(
        template="plotly_dark",
        height=680,
        margin=dict(l=10, r=10, t=36, b=20),
        paper_bgcolor=PANEL,
        plot_bgcolor=PANEL,
        title="5min XAUUSD 结构图",
        legend=dict(orientation="h", yanchor="bottom", y=1.01, xanchor="left", x=0),
        xaxis_rangeslider_visible=False,
    )
    fig.update_xaxes(showgrid=True, gridcolor=GRID)
    fig.update_yaxes(showgrid=True, gridcolor=GRID, row=1, col=1)
    fig.update_yaxes(showgrid=True, gridcolor=GRID, range=[0, 100], row=2, col=1, title="RSI")
    return fig


def create_score_chart(scores: dict[str, Any]) -> go.Figure:
    labels = ["Bullish", "Bearish", "Range"]
    values = [
        scores.get("bullish_score", 0),
        scores.get("bearish_score", 0),
        scores.get("range_score", 0),
    ]
    colors = [GREEN, RED, GOLD]
    fig = go.Figure(
        data=[
            go.Pie(
                labels=labels,
                values=values,
                hole=0.62,
                marker=dict(colors=colors),
                textinfo="label+percent",
            )
        ]
    )
    fig.update_layout(
        template="plotly_dark",
        height=260,
        margin=dict(l=10, r=10, t=20, b=20),
        paper_bgcolor=PANEL,
        plot_bgcolor=PANEL,
        showlegend=False,
        font=dict(color="#e8edf5"),
    )
    return fig
