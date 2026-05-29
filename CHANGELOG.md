# Changelog

## v2.0 (2026-05-29)

**性能优化 + 项目标准化**

- 所有计算函数添加 `@st.cache_data` 缓存（ttl=3600s），显著减少重复计算
  - `add_indicators()` — 技术指标计算缓存
  - `analyze_structure()` — SMC 结构分析缓存
  - `calculate_scores()` — 评分引擎缓存
  - `generate_report()` — 报告生成缓存
- DXY 数据与黄金数据并行下载，减少 I/O 等待时间约 30%
- 移除 app.py 中重复的 `_label()` 函数，统一从 report_generator 导入
- 更新 README.md：中文说明 + 在线部署地址 + 项目结构 + 免责声明
- 新增 CHANGELOG.md

## v1.1 (2026-05-27)

**UI 优化 + 本地反馈**

- 添加本地反馈邮箱和用量统计页
- 优化头部操作区布局
- 精简 FedEx 用量统计页脚

## v1.0 (2026-05-26)

**首个正式版本**

- Streamlit Web App 基础架构
- yfinance 行情抓取（GC=F / XAUUSD=X fallback）
- 技术指标：EMA20/50/200/610、RSI14、ATR14、VWAP
- SMC 结构识别：Swing、BOS、CHoCH、FVG、流动性
- 多空评分引擎 + 置信度
- 多周期分析：5min / 1H / 4H
- Plotly K线图 + 结构标注
- 中文分析报告 + 交易计划生成
- 风险控制规则
- 支持 smartmoneyconcepts 包（可选）
