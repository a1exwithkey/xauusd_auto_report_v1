# xauusd_auto_report_v1

XAUUSD 黄金/美元自动结构分析网页 V1。用于行情复盘和结构展示，不构成投资建议，不承诺胜率，不做真实交易。

## 安装

```bash
cd /Users/alex./Documents/New\ project/xauusd_auto_report_v1
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 运行

```bash
streamlit run app.py
```

## 数据源

- 黄金数据优先使用 `GC=F`，失败后尝试 `XAUUSD=X`
- DXY 使用 `DX-Y.NYB`，失败时页面显示 `DXY unavailable`
- 使用 `st.cache_data(ttl=3600)`，每小时刷新一次

## 功能

- 5min / 1H / 4H 多周期结构分析
- EMA20 / EMA50 / EMA200 / RSI14 / ATR14 / VWAP
- 优先调用 `smartmoneyconcepts` 识别 SMC 结构
- 如果 `smartmoneyconcepts` 不可用，自动使用自写简化规则 fallback
- Plotly K线图、FVG 区域、支撑阻力、流动性水平线
- 中文路径推演、交易计划和风险提示

## 免责声明

本工具只用于行情复盘、结构观察和可视化展示。页面中的“结构倾向”“路径推演”“交易计划”不是投资建议，也不是收益或胜率承诺。真实交易需自行判断并承担风险。
