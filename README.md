# xauusd_auto_report_v1

XAUUSD 黄金/美元自动结构分析网页 V1。

这是一个 Streamlit Web App。用户打开页面后，程序会自动抓取黄金行情数据，计算常用技术指标，识别基础 SMC/ICT/PA 结构，并生成一份中文结构分析报告。

本项目只用于行情复盘、结构观察和可视化展示，不做真实交易，不接付费 API，不承诺胜率，不构成投资建议。

## 在线部署入口

Streamlit Cloud 部署时填写：

```text
Repository: A1exwithkey/xauusd_auto_report_v1
Branch: main
Main file path: app.py
Python version: 3.12
```

不需要填写 Secrets。

## 本地运行

```bash
cd /Users/alex./Documents/New\ project/xauusd_auto_report_v1
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

本地默认地址：

```text
http://localhost:8501
```

## 项目结构

```text
xauusd_auto_report_v1/
├── app.py
├── requirements.txt
├── README.md
├── modules/
│   ├── data_loader.py
│   ├── indicators.py
│   ├── smc_engine.py
│   ├── scoring.py
│   ├── report_generator.py
│   └── charting.py
└── assets/
    └── .gitkeep
```

## 页面展示内容

页面目前包含：

- 顶部标题和风险说明
- 手动刷新按钮
- 数据状态卡片：数据源、样本数量、最新 5min K 线时间、结构引擎、VWAP 状态
- 市场总览：当前价格、日内涨跌幅、日高、日低、主方向、DXY 状态
- 结构倾向评分：Bullish / Bearish / Range
- 5min K 线图
- EMA20 / EMA50 / EMA200 / VWAP
- FVG 区域矩形
- 支撑阻力线
- Buy-side / Sell-side liquidity 水平线
- 多周期结构摘要：5min / 1H / 4H
- 高概率路径
- 交易计划
- 风险控制
- 最终中文结论

## 数据抓取逻辑

数据抓取在 `modules/data_loader.py` 中完成。

### 黄金行情

优先使用 Yahoo Finance ticker：

```text
GC=F
```

如果 `GC=F` 抓取失败或返回空数据，自动 fallback 到：

```text
XAUUSD=X
```

抓取周期：

```text
5min: 最近 5 天
1H: 最近 60 天
4H: 由 1H 数据 resample 得到
```

标准化后的行情 DataFrame 只保留：

```text
Open
High
Low
Close
Volume
```

代码会处理 yfinance 可能返回的 MultiIndex columns，避免多层列导致指标计算失败。

### DXY

美元指数使用：

```text
DX-Y.NYB
```

如果 DXY 抓取失败，页面显示：

```text
DXY unavailable
```

不会让页面崩溃。

## 刷新机制

行情抓取函数使用：

```python
@st.cache_data(ttl=3600)
```

含义：

- 缓存有效期 3600 秒
- 页面每小时自动重新抓取一次行情
- 页面上的 `立即刷新行情` 按钮会清空缓存并重新请求数据

按钮逻辑：

```python
load_market_data.clear()
st.rerun()
```

## 技术指标逻辑

指标计算在 `modules/indicators.py` 中完成。

当前计算：

```text
EMA20
EMA50
EMA200
EMA610: 数据足够时才计算
RSI14
ATR14
VWAP
```

VWAP 逻辑：

- 如果 Volume 可用且大于 0，使用成交量 VWAP
- 如果 Volume 缺失或全为 0，使用 typical price rolling mean 作为 fallback
- 页面会显示 VWAP 状态，例如 `成交量VWAP` 或 `均价VWAP替代`

## SMC / ICT 结构识别逻辑

结构识别在 `modules/smc_engine.py` 中完成。

第一优先级：调用 `smartmoneyconcepts` 包。

尝试识别：

```text
swing_highs_lows
bos_choch
fvg
ob
liquidity
```

`smartmoneyconcepts` 要求字段为小写：

```text
open
high
low
close
volume
```

因此程序会先把标准 OHLCV 数据转换成该包需要的格式。

如果 `smartmoneyconcepts` 安装、兼容或运行失败，自动使用内置简化规则 fallback。

### fallback 规则

fallback 不追求完美，只保证可解释、可运行：

- Swing High / Swing Low：fractal 规则，默认左右各 3 根 K 线
- BOS：最新收盘价突破最近 swing high / swing low
- CHOCH：根据最近 swing 结构判断趋势反转
- FVG：三根 K 规则
  - Bullish FVG: 第 3 根 low 高于第 1 根 high
  - Bearish FVG: 第 3 根 high 低于第 1 根 low
- Equal High / Equal Low：用 ATR 的 0.25 倍作为容差
- 支撑：最近 swing low
- 阻力：最近 swing high
- Buy-side liquidity：等高或明显前高
- Sell-side liquidity：等低或明显前低

## 多空评分逻辑

评分在 `modules/scoring.py` 中完成。

输出：

```text
bullish_score
bearish_score
range_score
main_bias
confidence
reasons
```

评分参考因素：

- 当前价格与 EMA20 的关系
- EMA20 与 EMA50 的关系
- EMA50 与 EMA200 的关系
- RSI14 位置
- 5min BOS 状态
- 1H 结构方向
- 4H 结构方向
- FVG 方向
- 5min 与 1H 是否冲突
- DXY 当日强弱
- ATR 是否偏低
- 价格是否接近日内中位区

最终会把 bullish / bearish / range 原始分归一化为百分比。

页面只显示“结构倾向”，不显示“胜率保证”。

## 报告生成逻辑

报告生成在 `modules/report_generator.py` 中完成。

自动生成：

- 市场总览
- 多周期结构摘要
- 主路径 / 次路径 / 极端路径
- 交易计划
- 风险控制
- 最终结论

交易计划会根据主方向自动切换：

### 偏空时

- 反抽空
- 破位空
- 已有空单管理
- 扫低反弹谨慎多

### 偏多时

- 回踩多
- 突破多
- 已有多单管理
- 扫高回落谨慎空

### 震荡时

- 区间高空
- 区间低多
- 突破跟随
- 假突破反打

每个计划包含：

```text
Direction
Entry zone
Stop Loss
TP1
TP2
Risk Reward
触发条件
失效条件
```

价格区域使用最近支撑、阻力和 ATR 自动生成。数据不足时显示 `等待结构确认`。

## 图表和标注逻辑

图表在 `modules/charting.py` 中生成，使用 Plotly。

主图：

- Candlestick K 线
- EMA20
- EMA50
- EMA200
- VWAP
- 支撑线
- 阻力线
- FVG 半透明矩形区域
- Buy-side liquidity 水平虚线
- Sell-side liquidity 水平虚线

副图：

- RSI14
- RSI 30 / 50 / 70 水平线

图表不是静态图片，不需要额外抓取图标或图片资源。所有 K 线、指标线和结构区域都由行情数据实时计算后用 Plotly 绘制。

## 主要依赖

```text
streamlit
pandas
numpy
plotly
yfinance
pytz
smartmoneyconcepts
```

## 已知限制

- yfinance 免费数据可能延迟、缺口或临时不可用
- `GC=F` 是黄金期货，不完全等同于现货 XAUUSD
- `XAUUSD=X` 在不同时间段可能返回较少或空数据
- 结构识别是规则化近似，不等同于人工交易员判断
- SMC / ICT 概念本身存在主观性，第一版只做基础可解释实现
- 本工具不会下单，也不会发送真实交易信号

## 风险声明

本工具只用于行情复盘、结构观察和可视化展示。

页面中的“结构倾向”“路径推演”“交易计划”不是投资建议，也不是收益、胜率或风控承诺。

真实交易需自行判断并承担风险。
