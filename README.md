# XAUUSD 自动结构分析报告 v2.0

黄金/美元 (XAUUSD) 实时行情结构与交易辅助分析仪表盘。

本工具自动抓取行情数据，计算技术指标，识别 SMC/ICT 基础结构，生成中文分析报告。**仅用于行情复盘和结构分析，不构成投资建议。**

## 在线访问

Streamlit Cloud 已部署：

👉 **[https://xauusd-auto-report-v1.streamlit.app](https://xauusd-auto-report-v1.streamlit.app)**

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

需要配置 Secrets：

```toml
TWELVE_DATA_API_KEY = "你的 Twelve Data API Key"
```

不要把 API Key 写进代码或提交到 GitHub。

## 项目结构

```
xauusd_auto_report_v1/
├── app.py                       # 主入口，Streamlit UI
├── requirements.txt             # Python 依赖
├── README.md                    # 本文件
├── CHANGELOG.md                 # 版本历史
├── .gitignore
├── modules/
│   ├── data_loader.py           # 旧版 Streamlit 模块数据抓取
│   ├── indicators.py            # 技术指标（EMA/RSI/ATR/VWAP）
│   ├── smc_engine.py            # SMC 结构识别（Swing/BOS/CHoCH/FVG/流动性）
│   ├── scoring.py               # 多空评分引擎
│   ├── report_generator.py      # 中文报告生成 + 交易计划
│   └── charting.py              # Plotly 图表（K线 + 结构标注）
└── assets/
    └── .gitkeep
```

## 数据来源

当前线上仪表盘只使用 Twelve Data 的 `XAU/USD` 5 分钟 K 线。

| 数据 | 来源 | 周期 | 说明 |
|------|------|------|------|
| XAUUSD 现货黄金 | Twelve Data `XAU/USD` | 5m | 主数据源 |

- API Key 从环境变量 `TWELVE_DATA_API_KEY` 或 Streamlit Secrets 读取
- 服务端缓存有效期 3600 秒，每小时自动刷新一次
- 没有 API Key 或 API 返回失败时，页面会显示错误原因
- 不会自动生成 mock K 线，也不会用假数据生成结构判断
- 第一版暂不接真实下单，不承诺胜率

## 功能概述

- 自动抓取行情并计算 EMA20/50/200/610、RSI14、ATR14、VWAP
- 识别 Swing High/Low、BOS、CHoCH、FVG、流动性池
- 多时间周期结构分析（5min / 1H / 4H）
- 多空评分（Bullish / Bearish / Range）+ 置信度
- 交互式 K线图（Plotly）+ 结构标注
- 自动生成交易计划与场景推演
- 风险控制规则提醒

## Streamlit Cloud 部署排障

部署后页面显示 "You do not have access" 或跳转到登录页，请按顺序检查：

### 1. 确认 App 已部署且状态正常
登录 [share.streamlit.io](https://share.streamlit.io) → 找到你的 App → 首页应显示绿色 **"Running"** 状态。如果是 "Stopped" / "Error" / 转圈中，先点 Reboot。

### 2. 确认 App 设为 Public
Settings → Sharing → **"Who can view this app"** 必须选 **Public**。如果刚改完，等 30 秒再试。

### 3. 确认 GitHub 源码正确
浏览器直接打开 `https://github.com/A1exwithkey/xauusd_auto_report_v1/blob/main/app.py`，检查文件内容是否包含：
- `from modules.report_generator import _label, generate_report`（第 9 行）
- `load_market_data.clear()`（刷新按钮逻辑）
如果看不到这些，说明 GitHub 上的代码不是最新版，需要重新 push。

### 4. 确认入口文件路径
Settings → General → **Main file path** 必须是 `app.py`（不是 `streamlit_app.py` 或其他）。

### 5. 确认 Python 版本
Settings → General → **Python version** 选 `3.12`。

### 6. 清除浏览器缓存
Chrome 无痕窗口打开你的 URL。如果无痕能加载但正常窗口不能 → 清除 `streamlit.app` 的 cookie。

### 7. 检查 App Logs
Settings → 右侧 **App logs** → 看有没有 Python traceback（红色错误堆栈）。常见崩溃原因：
- `requirements.txt` 缺依赖
- import 路径错误
- `TWELVE_DATA_API_KEY` 没有配置
- Twelve Data 返回频率限制或接口错误

### 8. 终极重置
如果以上全试过还不行：
1. Settings → 最下面 **Delete app**
2. 回首页 → **Create app** → 填空：
   - Repository: `A1exwithkey/xauusd_auto_report_v1`
   - Branch: `main`
   - Main file path: `app.py`
3. Deploy 后手动把 Settings → Sharing 设成 Public

---

## 已知限制

- Twelve Data 免费额度和频率有限，超限时页面会显示数据错误
- 当前只接入 `XAU/USD` 5m 数据，暂未接 DXY、MT5 或付费数据源
- SMC/ICT 结构识别为规则化近似，不等同于人工判断
- 本工具不会下单，不发送真实交易信号

## 免责声明

本工具仅用于行情复盘、结构观察和可视化展示。所有结构倾向、路径推演、交易计划均不是投资建议，也不是收益或胜率承诺。真实交易需自行判断并承担风险。
