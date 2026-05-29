from __future__ import annotations

import pandas as pd
import streamlit as st

from modules.charting import create_price_chart, create_score_chart
from modules.data_loader import load_market_data
from modules.indicators import add_indicators
from modules.report_generator import _label, generate_report
from modules.scoring import calculate_scores
from modules.smc_engine import analyze_structure


st.set_page_config(
    page_title="XAUUSD 自动结构分析报告",
    page_icon="XAU",
    layout="wide",
)

st.markdown(
    """
    <style>
    .stApp { background:#090d13; color:#e8edf5; }
    .main .block-container { padding-top: 2rem; max-width: 1500px; }
    [data-testid="stMetric"] {
        background:linear-gradient(180deg,#171d27 0%,#111722 100%);
        border:1px solid #2a3446; border-radius:8px;
        padding:14px 16px; box-shadow:0 12px 30px rgba(0,0,0,.18);
    }
    [data-testid="stMetricLabel"] { color:#9da8bb; }
    [data-testid="stMetricValue"] { color:#f3f6fb; }
    .block-card {
        background:#131925; border:1px solid #293142; border-radius:8px;
        padding:16px; margin-bottom:14px;
    }
    .hero {
        border:1px solid #2f3a4f; border-radius:8px; padding:18px 20px;
        background:linear-gradient(135deg,#151b24 0%,#101722 58%,#211d12 100%);
        margin-bottom:14px;
    }
    .hero-title { font-size:28px; font-weight:760; margin-bottom:4px; color:#f7f1df; }
    .hero-sub { color:#aeb8c8; font-size:14px; }
    .status-row {
        display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; margin:12px 0 18px;
    }
    .status-pill {
        background:#101620; border:1px solid #273247; border-radius:8px; padding:10px 12px;
        min-height:62px;
    }
    .status-label { color:#8793a7; font-size:12px; margin-bottom:4px; }
    .status-value { color:#e9eef8; font-size:14px; font-weight:650; word-break:break-word; }
    .refresh-note {
        color:#aeb8c8; font-size:13px; margin:-4px 0 12px;
    }
    .section-card {
        background:#111823; border:1px solid #263147; border-radius:8px; padding:14px 16px;
        height:100%;
    }
    .section-card h4 { margin:0 0 10px; color:#f0d38a; font-size:16px; }
    .plan-line { border-top:1px solid #263147; padding-top:8px; margin-top:8px; }
    .risk { color:#f2c66d; font-size:13px; line-height:1.65; }
    .final-box {
        color:#edf4ff; background:#13253a; border:1px solid #2f5f96; border-radius:8px;
        padding:16px; line-height:1.75; font-size:15px;
    }
    @media (max-width: 900px) {
        .status-row { grid-template-columns:1fr 1fr; }
        .hero-title { font-size:22px; }
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def _format_time(index: pd.Index) -> str:
    if len(index) == 0:
        return "等待数据"
    try:
        return pd.Timestamp(index[-1]).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return "等待数据"


def _liquidity_text(items: list[dict]) -> str:
    if not items:
        return "待确认"
    names = {
        "smc_liquidity": "流动性池",
        "prior_high": "前高",
        "prior_low": "前低",
        "equal_high": "等高",
        "equal_low": "等低",
    }
    return " / ".join([f"{item.get('level')}（{names.get(item.get('type'), item.get('type'))}）" for item in items[:3]])


def main() -> None:
    st.markdown(
        """
        <div class="hero">
          <div class="hero-title">XAUUSD 黄金/美元 自动结构分析报告</div>
          <div class="hero-sub">自动抓取行情、计算技术指标、识别基础 SMC/PA 结构。数据每小时刷新；仅用于复盘展示，不构成投资建议。</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    refresh_col, note_col = st.columns([0.9, 3.1], vertical_alignment="center")
    with refresh_col:
        if st.button("立即刷新行情", type="primary", width="stretch"):
            load_market_data.clear()
            st.rerun()
    with note_col:
        st.markdown(
            "<div class='refresh-note'>缓存有效期：3600 秒。页面会每小时自动重新抓取行情；手动刷新会立即清空缓存并重新请求数据。</div>",
            unsafe_allow_html=True,
        )

    with st.spinner("正在抓取行情并计算结构..."):
        data = load_market_data()

    if data["errors"]:
        with st.expander("数据源提示", expanded=False):
            for err in data["errors"][-6:]:
                st.warning(err)

    m5, m5_meta = add_indicators(data["m5"], include_vwap=True)
    h1, _ = add_indicators(data["h1"], include_vwap=False)
    h4, _ = add_indicators(data["h4"], include_vwap=False)

    if m5.empty:
        st.error("GC=F 和 XAUUSD=X 行情都暂时不可用，页面无法生成报告。请稍后刷新。")
        return

    structures = {
        "5min": analyze_structure(m5, "5min"),
        "1H": analyze_structure(h1, "1H"),
        "4H": analyze_structure(h4, "4H"),
    }
    scores = calculate_scores(m5, structures["5min"], structures["1H"], structures["4H"], data["dxy_status"])
    report = generate_report(
        data["symbol"],
        m5,
        structures,
        scores,
        data["dxy_status"],
        data["last_updated"],
        m5_meta["vwap_status"],
    )
    overview = report["overview"]

    st.markdown(
        f"""
        <div class="status-row">
          <div class="status-pill"><div class="status-label">数据源</div><div class="status-value">{overview['品种']}</div></div>
          <div class="status-pill"><div class="status-label">5min / 1H 样本</div><div class="status-value">{len(m5):,} / {len(h1):,} 根</div></div>
          <div class="status-pill"><div class="status-label">最新5min K线（源时间）</div><div class="status-value">{_format_time(m5.index)}</div></div>
          <div class="status-pill"><div class="status-label">结构引擎</div><div class="status-value">{_label(structures['5min'].get('engine', 'fallback'))}</div></div>
          <div class="status-pill"><div class="status-label">VWAP</div><div class="status-value">{_label(overview['VWAP 状态'])}</div></div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("当前价格", overview["当前价格"])
    c2.metric("日内涨跌幅", overview["日内涨跌幅"])
    c3.metric("日高", overview["日高"])
    c4.metric("日低", overview["日低"])
    c5.metric("主方向", _label(overview["主方向"]), f"置信度 {_label(scores['confidence'])}")
    c6.metric("DXY 状态", overview["DXY 状态"])

    left, center, right = st.columns([1.05, 2.25, 1.3])
    with left:
        st.subheader("结构倾向")
        st.plotly_chart(create_score_chart(scores), width="stretch")
        st.progress(int(scores["bullish_score"]), text=f"Bullish {scores['bullish_score']}%")
        st.progress(int(scores["bearish_score"]), text=f"Bearish {scores['bearish_score']}%")
        st.progress(int(scores["range_score"]), text=f"Range {scores['range_score']}%")
        st.markdown("**打分理由**")
        for reason in scores["reasons"][:8]:
            st.write(f"- {reason}")

    with center:
        st.subheader("5min K线结构图")
        st.plotly_chart(create_price_chart(m5.tail(260), structures["5min"]), width="stretch")

    with right:
        st.subheader("高概率路径")
        for item in report["paths"]:
            st.write(f"- {item}")
        st.subheader("交易计划")
        for plan in report["plans"][:4]:
            with st.expander(plan["Direction"], expanded=plan is report["plans"][0]):
                for key, value in plan.items():
                    if key != "Direction":
                        st.write(f"**{key}:** {value}")

    st.divider()
    t1, t2, t3 = st.columns(3)
    t1.markdown(f"<div class='section-card'><h4>5min 结构</h4>{report['multi_timeframe']['5min']}</div>", unsafe_allow_html=True)
    t2.markdown(f"<div class='section-card'><h4>1H 结构</h4>{report['multi_timeframe']['1H']}</div>", unsafe_allow_html=True)
    t3.markdown(f"<div class='section-card'><h4>4H 结构</h4>{report['multi_timeframe']['4H']}</div>", unsafe_allow_html=True)

    b1, b2 = st.columns(2)
    with b1:
        st.subheader("关键流动性")
        st.write("Buy-side:", _liquidity_text(structures["5min"]["buy_side_liquidity"]))
        st.write("Sell-side:", _liquidity_text(structures["5min"]["sell_side_liquidity"]))
        st.write("VWAP:", _label(overview["VWAP 状态"]))
    with b2:
        st.subheader("风险控制")
        for risk in report["risk"]:
            st.markdown(f"<div class='risk'>- {risk}</div>", unsafe_allow_html=True)

    st.subheader("最终结论")
    st.markdown(f"<div class='final-box'>{report['conclusion']}</div>", unsafe_allow_html=True)

    with st.expander("原始计划表"):
        st.dataframe(pd.DataFrame(report["plans"]), width="stretch", hide_index=True)


if __name__ == "__main__":
    main()
