# XAUUSD 自动结构分析报告 v2.0

黄金/美元 (XAUUSD) 实时行情结构与交易辅助分析仪表盘。

本工具自动抓取行情数据，计算技术指标，识别 SMC/ICT 基础结构，生成中文分析报告。**仅用于行情复盘和结构分析，不构成投资建议。**

## 在线访问

Streamlit Cloud 已部署：

👉 **[https://xauusd-auto-report.streamlit.app](https://xauusd-auto-report.streamlit.app)**

## 本地运行

```bash
cd xauusd_auto_report_v1
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

打开 http://localhost:8501

## Streamlit Cloud 部署

| 字段 | 值 |
|------|----|
| Repository | `A1exwithkey/xauusd_auto_report_v1` |
| Branch | `main` |
| Main file path | `app.py` |
| Python version | 3.12 |

无需 Secrets。

## 项目结构

```
xauusd_auto_report_v1/
├── app.py                       # 主入口，Streamlit UI
├── requirements.txt             # Python 依赖
├── README.md                    # 本文件
├── CHANGELOG.md                 # 版本历史
├── .gitignore
├── modules/
│   ├── data_loader.py           # 数据抓取（yfinance）
│   ├── indicators.py            # 技术指标（EMA/RSI/ATR/VWAP）
│   ├── smc_engine.py            # SMC 结构识别（Swing/BOS/CHoCH/FVG/流动性）
│   ├── scoring.py               # 多空评分引擎
│   ├── report_generator.py      # 中文报告生成 + 交易计划
│   └── charting.py              # Plotly 图表（K线 + 结构标注）
└── assets/
    └── .gitkeep
```

## 数据来源

| 品种 | Yahoo Finance Ticker | 周期 | 说明 |
|------|---------------------|------|------|
| 黄金期货 | `GC=F` | 5m / 1H | 优先数据源 |
| 黄金现货（备用） | `XAUUSD=X` | 5m / 1H | GC=F 失败时自动 fallback |
| 美元指数 | `DX-Y.NYB` | 1H | DXY 强弱辅助判断 |

- 4H 数据由 1H 数据 resample 得到
- 缓存有效期 3600 秒，每小时自动刷新
- yfinance 为免费数据源，可能存在延迟或临时不可用

## 功能概述

- 自动抓取行情并计算 EMA20/50/200/610、RSI14、ATR14、VWAP
- 识别 Swing High/Low、BOS、CHoCH、FVG、流动性池
- 多时间周期结构分析（5min / 1H / 4H）
- 多空评分（Bullish / Bearish / Range）+ 置信度
- 交互式 K线图（Plotly）+ 结构标注
- 自动生成交易计划与场景推演
- 风险控制规则提醒

## 已知限制

- yfinance 免费数据可能延迟或临时不可用
- `GC=F` 是黄金期货，不完全等同于现货 XAUUSD
- SMC/ICT 结构识别为规则化近似，不等同于人工判断
- 本工具不会下单，不发送真实交易信号

## 免责声明

本工具仅用于行情复盘、结构观察和可视化展示。所有结构倾向、路径推演、交易计划均不是投资建议，也不是收益或胜率承诺。真实交易需自行判断并承担风险。
