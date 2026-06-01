import {
  Candle,
  MarketAnalysis,
  Bias,
  Confidence,
  MarketState,
  Scenario,
  TimeframeCandles,
  TimeframeKey,
  TimeframeStructure,
  TradePlan,
} from '../types';
import { calcEMA, calcVWAP, calcATR, calcRSI, trendSignal } from './indicators';
import {
  detectSwings, detectBOS, detectCHoCH, detectFVG, detectLiquidity,
  detectSweep, detectSR, swingTrend, detectZone,
} from './smc';

type TfSnapshot = {
  key: TimeframeKey;
  label: string;
  candles: Candle[];
  trend: Bias;
  structure: TimeframeStructure['structure'];
  bos: string;
  choch: string;
  support: number | null;
  resistance: number | null;
  summary: string;
};

const TF_LABELS: Record<TimeframeKey, string> = {
  '5m': '5M 执行',
  '15m': '15M 中结构',
  '1h': '1H 主结构',
  '4h': '4H 大结构',
};

function lastValue(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return values[i];
  }
  return null;
}

function round(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '等待确认' : value.toFixed(2);
}

function pct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function structureLabel(trend: Bias, candles: Candle[], ema20: (number | null)[], ema50: (number | null)[]): TimeframeStructure['structure'] {
  const last = candles[candles.length - 1];
  const e20 = lastValue(ema20);
  const e50 = lastValue(ema50);
  if (!last || e20 == null || e50 == null) return '等待确认';
  if (trend === 'bullish' && last.close > e20 && last.close > e50) return '上涨';
  if (trend === 'bearish' && last.close < e20 && last.close < e50) return '下跌';
  return '震荡';
}

function analyzeTimeframe(key: TimeframeKey, candles: Candle[]): TfSnapshot {
  if (candles.length < 40) {
    return {
      key,
      label: TF_LABELS[key],
      candles,
      trend: 'neutral',
      structure: '等待确认',
      bos: 'none',
      choch: 'none',
      support: null,
      resistance: null,
      summary: '该周期数据不足，等待更多K线确认结构。',
    };
  }

  const ema20 = calcEMA(candles, 20);
  const ema50 = calcEMA(candles, 50);
  const swings = detectSwings(candles);
  const trend = swingTrend(swings);
  const bos = detectBOS(candles, swings);
  const choch = detectCHoCH(candles, swings);
  const sr = detectSR(swings);
  const structure = structureLabel(trend, candles, ema20, ema50);
  const summary =
    structure === '上涨'
      ? '高低点抬高，价格站在短均线上方，回踩确认比追高更合理。'
      : structure === '下跌'
        ? '高低点下移，价格压在短均线下方，反抽确认比追空更合理。'
        : structure === '震荡'
          ? '结构延续性不足，价格更像在消化区间，边界位置更重要。'
          : '结构样本不足，先观察。';

  return { key, label: TF_LABELS[key], candles, trend, structure, bos, choch, support: sr.support, resistance: sr.resistance, summary };
}

function candleMomentum(candles: Candle[]): 'bullish' | 'bearish' | 'neutral' {
  const recent = candles.slice(-5);
  if (recent.length < 3) return 'neutral';
  const bodies = recent.map(c => Math.abs(c.close - c.open));
  const ranges = recent.map(c => Math.max(c.high - c.low, 0.01));
  const strongBull = recent.filter((c, i) => c.close > c.open && bodies[i] / ranges[i] > 0.55).length;
  const strongBear = recent.filter((c, i) => c.close < c.open && bodies[i] / ranges[i] > 0.55).length;
  if (strongBull >= 3) return 'bullish';
  if (strongBear >= 3) return 'bearish';
  return 'neutral';
}

function normalizeScores(raw: { bullish: number; bearish: number; range: number; reversal: number }) {
  const total = raw.bullish + raw.bearish + raw.range + raw.reversal || 1;
  return {
    bullish: pct((raw.bullish / total) * 100),
    bearish: pct((raw.bearish / total) * 100),
    range: pct((raw.range / total) * 100),
    reversal: pct((raw.reversal / total) * 100),
  };
}

function buildTradePlans(
  bias: Bias,
  price: number,
  support: number | null,
  resistance: number | null,
  atr: number,
  probabilities: MarketAnalysis['probabilities'],
  conflict: boolean,
  zone: MarketAnalysis['priceZone'],
): TradePlan[] {
  const waitPlan: TradePlan = {
    name: '观望计划',
    direction: 'Wait',
    entry: '等待确认，当前位置不适合入场。',
    sl: '等待确认',
    tp1: '等待确认',
    tp2: '等待确认',
    tp3: '等待确认',
    rr: '等待确认',
    winRate: `${Math.max(probabilities.range, 35)}% 观察概率`,
    invalidation: '出现清晰BOS/CHoCH并回踩确认后，重新评估。',
    status: 'waiting',
  };

  const canLong = bias === 'bullish' && support != null && resistance != null && !conflict && zone !== 'mid';
  const canShort = bias === 'bearish' && support != null && resistance != null && !conflict && zone !== 'mid';
  const plans: TradePlan[] = [];

  if (canLong) {
    const entry = Math.min(price, support + atr * 0.35);
    const sl = support - atr * 0.75;
    const tp1 = Math.max(price + atr * 1.2, resistance);
    const tp2 = tp1 + atr * 1.4;
    const tp3 = tp2 + atr * 1.3;
    const rr = (tp1 - entry) / Math.max(entry - sl, 0.01);
    if (rr >= 1.5) {
      plans.push(
        makePlan('激进计划', 'Long', entry, sl, tp1, tp2, tp3, rr, probabilities.bullish, '跌破支撑并收在支撑下方。'),
        makePlan('稳健计划', 'Long', support, sl, tp1, tp2, tp3, rr, Math.max(probabilities.bullish - 5, 0), '回踩失败，价格重新跌回结构位下方。'),
        makePlan('反向计划', 'Short', resistance + atr * 0.15, resistance + atr * 0.85, support, support - atr, support - atr * 1.8, 1.6, probabilities.reversal, '突破阻力后站稳，不再做反向。'),
      );
    }
  }

  if (canShort) {
    const entry = Math.max(price, resistance - atr * 0.35);
    const sl = resistance + atr * 0.75;
    const tp1 = Math.min(price - atr * 1.2, support);
    const tp2 = tp1 - atr * 1.4;
    const tp3 = tp2 - atr * 1.3;
    const rr = (entry - tp1) / Math.max(sl - entry, 0.01);
    if (rr >= 1.5) {
      plans.push(
        makePlan('激进计划', 'Short', entry, sl, tp1, tp2, tp3, rr, probabilities.bearish, '突破阻力并收在阻力上方。'),
        makePlan('稳健计划', 'Short', resistance, sl, tp1, tp2, tp3, rr, Math.max(probabilities.bearish - 5, 0), '反抽失败后重新站上结构位。'),
        makePlan('反向计划', 'Long', support - atr * 0.15, support - atr * 0.85, resistance, resistance + atr, resistance + atr * 1.8, 1.6, probabilities.reversal, '跌破支撑后无法收回，不做反向。'),
      );
    }
  }

  if (plans.length === 0) {
    plans.push({
      name: '激进计划',
      direction: 'Wait',
      entry: '等待确认，当前位置不适合入场。',
      sl: '等待确认',
      tp1: '等待确认',
      tp2: '等待确认',
      tp3: '等待确认',
      rr: '不足 1:1.5 或结构冲突',
      winRate: `${Math.max(probabilities.bullish, probabilities.bearish)}% 方向倾向`,
      invalidation: conflict ? '多周期方向冲突，只输出观察计划。' : '价格在区间中部或关键位不清晰。',
      status: 'waiting',
    });
    plans.push({
      ...waitPlan,
      name: '稳健计划',
      invalidation: '等价格触及关键支撑/压力并出现确认K线。',
    });
    plans.push({
      ...waitPlan,
      name: '反向计划',
      invalidation: '只有扫流动性后快速收回，才考虑反向。',
    });
  }

  plans.push(waitPlan);
  return plans.slice(0, 4);
}

function makePlan(
  name: string,
  direction: 'Long' | 'Short',
  entry: number,
  sl: number,
  tp1: number,
  tp2: number,
  tp3: number,
  rr: number,
  winRate: number,
  invalidation: string,
): TradePlan {
  return {
    name,
    direction,
    entry: round(entry),
    sl: round(sl),
    tp1: round(tp1),
    tp2: round(tp2),
    tp3: round(tp3),
    rr: `1:${rr.toFixed(1)}`,
    winRate: `${pct(winRate)}%`,
    invalidation,
    status: 'ready',
  };
}

function buildScenarios(
  bias: Bias,
  support: number | null,
  resistance: number | null,
  probabilities: MarketAnalysis['probabilities'],
): Scenario[] {
  const upper = round(resistance);
  const lower = round(support);
  if (bias === 'bullish') {
    return [
      { label: 'A 主路径', probability: 'primary', probabilityValue: probabilities.bullish, trigger: `回踩${lower}附近不破并出现5M转强`, target: `先看${upper}，站稳后看上方流动性`, response: '等回踩确认，不在区间中部追多。', invalidation: `跌破${lower}并形成bearish CHoCH` },
      { label: 'B 次路径', probability: 'secondary', probabilityValue: probabilities.range, trigger: '价格继续卡在VWAP附近震荡', target: '区间上下沿来回测试', response: '降低频率，只看边界确认。', invalidation: '有效突破并回踩确认' },
      { label: 'C 破位延续', probability: 'breakout', probabilityValue: Math.max(probabilities.bullish - 8, 0), trigger: `放量突破${upper}后回踩不破`, target: '上方Buy Side Liquidity', response: '突破后等回踩，不追第一根。', invalidation: '突破后快速跌回区间' },
      { label: 'D 极端反转', probability: 'extreme', probabilityValue: probabilities.reversal, trigger: `扫高后跌回${upper}下方`, target: lower, response: '多头失效，等bearish CHoCH再考虑反向。', invalidation: '重新站上扫高位' },
    ];
  }
  if (bias === 'bearish') {
    return [
      { label: 'A 主路径', probability: 'primary', probabilityValue: probabilities.bearish, trigger: `反抽${upper}附近受压并出现5M转弱`, target: `先看${lower}，跌破后看下方流动性`, response: '等反抽确认，不在低位追空。', invalidation: `突破${upper}并形成bullish CHoCH` },
      { label: 'B 次路径', probability: 'secondary', probabilityValue: probabilities.range, trigger: '价格继续贴近VWAP横向运行', target: '回到区间中位', response: '只看高低边界，不追单。', invalidation: '突破后回踩确认' },
      { label: 'C 破位延续', probability: 'breakout', probabilityValue: Math.max(probabilities.bearish - 8, 0), trigger: `跌破${lower}后反抽不回`, target: '下方Sell Side Liquidity', response: '跌破后等反抽确认。', invalidation: '跌破后快速收回区间' },
      { label: 'D 极端反转', probability: 'extreme', probabilityValue: probabilities.reversal, trigger: `扫低后重新站回${lower}上方`, target: upper, response: '空头失效，等bullish CHoCH再考虑反向。', invalidation: '重新跌破扫低位' },
    ];
  }
  return [
    { label: 'A 主路径', probability: 'primary', probabilityValue: probabilities.range, trigger: '价格维持在支撑压力之间', target: `${lower} - ${upper}`, response: '区间边界确认，区间中部不动。', invalidation: '有效突破任一边界' },
    { label: 'B 次路径', probability: 'secondary', probabilityValue: probabilities.bullish, trigger: `突破${upper}并回踩确认`, target: '上方流动性', response: '确认后跟随，不提前猜方向。', invalidation: '突破后跌回区间' },
    { label: 'C 破位延续', probability: 'breakout', probabilityValue: probabilities.bearish, trigger: `跌破${lower}并反抽确认`, target: '下方流动性', response: '确认后跟随，不追第一根。', invalidation: '跌破后收回区间' },
    { label: 'D 极端反转', probability: 'extreme', probabilityValue: probabilities.reversal, trigger: '先扫一侧流动性，再快速反向收回', target: '回到区间另一侧', response: '只在扫流动性后做反向确认。', invalidation: '扫后不回区间' },
  ];
}

export function analyze(candles: Candle[], timeframes: TimeframeCandles = {}): MarketAnalysis {
  const last = candles[candles.length - 1];
  const price = last?.close ?? 0;
  const dayCandles = candles.slice(-288);
  const dayOpen = dayCandles[0]?.open ?? price;
  const change = dayOpen > 0 ? ((price - dayOpen) / dayOpen) * 100 : 0;
  const dayHigh = dayCandles.length ? Math.max(...dayCandles.map(c => c.high)) : price;
  const dayLow = dayCandles.length ? Math.min(...dayCandles.map(c => c.low)) : price;

  const tf5 = timeframes['5m']?.length ? timeframes['5m']! : candles;
  const tf15 = timeframes['15m']?.length ? timeframes['15m']! : tf5;
  const tf1h = timeframes['1h']?.length ? timeframes['1h']! : tf15;
  const tf4h = timeframes['4h']?.length ? timeframes['4h']! : tf1h;
  const snapshots = [
    analyzeTimeframe('4h', tf4h),
    analyzeTimeframe('1h', tf1h),
    analyzeTimeframe('15m', tf15),
  ];

  const ema20 = calcEMA(candles, 20);
  const ema50 = calcEMA(candles, 50);
  const ema200 = calcEMA(candles, 200);
  const vwap = calcVWAP(candles);
  const rsi = calcRSI(candles, 14);
  const atrArr = calcATR(candles, 14);
  const atr = lastValue(atrArr) ?? Math.max(price * 0.001, 1);
  const lastRsi = lastValue(rsi) ?? 50;
  const lastE20 = lastValue(ema20);
  const lastE50 = lastValue(ema50);
  const lastE200 = lastValue(ema200);
  const lastVwap = lastValue(vwap);

  const swings = detectSwings(candles);
  const bos = detectBOS(candles, swings);
  const choch = detectCHoCH(candles, swings);
  const fvg = detectFVG(candles);
  const liq = detectLiquidity(candles, swings);
  const swept = detectSweep(candles, liq);
  const sr = detectSR(swings);
  const zone = detectZone(candles, swings);
  const swTrend = swingTrend(swings);
  const signal = trendSignal(candles, ema20, ema50);
  const momentum = candleMomentum(candles);

  const trend4H = snapshots[0].trend;
  const trend1H = snapshots[1].trend;
  const trend15M = snapshots[2].trend;
  const conflict = (trend4H === 'bullish' && trend1H === 'bearish') || (trend4H === 'bearish' && trend1H === 'bullish');

  const raw = { bullish: 8, bearish: 8, range: 10, reversal: 5 };
  const addDirectional = (trend: Bias, weight: number) => {
    if (trend === 'bullish') raw.bullish += weight;
    else if (trend === 'bearish') raw.bearish += weight;
    else raw.range += weight * 0.8;
  };

  addDirectional(trend4H, 13);
  addDirectional(trend1H, 11);
  addDirectional(trend15M, 6);
  addDirectional(signal, 15);
  if (lastE200 != null && price > lastE200) raw.bullish += 4;
  if (lastE200 != null && price < lastE200) raw.bearish += 4;
  if (lastVwap != null && Math.abs(price - lastVwap) <= atr * 0.35) raw.range += 8;
  if (lastVwap != null && price > lastVwap) raw.bullish += 4;
  if (lastVwap != null && price < lastVwap) raw.bearish += 4;
  if (bos.includes('bullish')) raw.bullish += 10;
  if (bos.includes('bearish')) raw.bearish += 10;
  if (choch.includes('bullish')) { raw.bullish += 6; raw.reversal += 8; }
  if (choch.includes('bearish')) { raw.bearish += 6; raw.reversal += 8; }
  if (zone === 'discount') raw.bullish += 8;
  if (zone === 'premium') raw.bearish += 8;
  if (zone === 'mid') raw.range += 10;
  if (fvg.some(z => z.type === 'bullish')) raw.bullish += 7;
  if (fvg.some(z => z.type === 'bearish')) raw.bearish += 7;
  if (momentum === 'bullish') raw.bullish += 10;
  if (momentum === 'bearish') raw.bearish += 10;
  if (momentum === 'neutral') raw.range += 5;
  if (lastRsi > 58) raw.bullish += 10;
  else if (lastRsi < 42) raw.bearish += 10;
  else raw.range += 10;
  if (swept) raw.reversal += 12;
  if (conflict) raw.range += 15;

  const probabilities = normalizeScores(raw);
  let bias: Bias = 'neutral';
  if (probabilities.bullish > probabilities.bearish + 10 && probabilities.bullish > probabilities.range) bias = 'bullish';
  else if (probabilities.bearish > probabilities.bullish + 10 && probabilities.bearish > probabilities.range) bias = 'bearish';

  const top = Math.max(probabilities.bullish, probabilities.bearish, probabilities.range);
  const confidence: Confidence = top >= 45 ? 'high' : top >= 34 ? 'medium' : 'low';
  const scoreGap = Math.abs(probabilities.bullish - probabilities.bearish);

  let state: MarketState = 'waiting';
  if (bias === 'bullish' && bos === 'bullish BOS') state = 'trending_up';
  else if (bias === 'bearish' && bos === 'bearish BOS') state = 'trending_down';
  else if (choch !== 'none') state = 'structure_shift';
  else if (swept) state = 'sweeping_liquidity';
  else if (bias === 'neutral') state = 'ranging';
  else state = 'pullback';

  const tradeable = confidence !== 'low' && scoreGap >= 10 && !conflict && zone !== 'mid';
  const marketBiasText = bias === 'bullish' ? '偏多' : bias === 'bearish' ? '偏空' : '震荡/等待确认';
  const tradeSuitability = tradeable ? '适合等待关键位确认' : '不适合直接入场';
  const bestOpportunity =
    bias === 'bullish'
      ? '回踩支撑或多头FVG后看确认'
      : bias === 'bearish'
        ? '反抽压力或空头FVG后看确认'
        : '等待价格到区间边界';

  const decision =
    tradeable && bias === 'bullish'
      ? '只看多，等待回踩确认'
      : tradeable && bias === 'bearish'
        ? '只看空，等待反抽确认'
        : conflict
          ? '多周期冲突，只观察'
          : '等待确认，当前位置不适合入场';

  const reason =
    `4H ${snapshots[0].structure}，1H ${snapshots[1].structure}，15M ${snapshots[2].structure}。` +
    ` 当前价格位于${zone === 'premium' ? 'Premium' : zone === 'discount' ? 'Discount' : 'Mid-range'}，` +
    `RSI ${lastRsi.toFixed(0)}，${swept ? '刚出现扫流动性迹象。' : '暂无明确扫流动性确认。'}`;

  const trigger =
    bias === 'bullish'
      ? `回踩${round(sr.support)}附近不破，并出现5M bullish BOS/CHoCH。`
      : bias === 'bearish'
        ? `反抽${round(sr.resistance)}附近受压，并出现5M bearish BOS/CHoCH。`
        : '等待突破区间后回踩确认，或到达区间边界出现拒绝K线。';

  const invalidation =
    bias === 'bullish'
      ? `跌破${round(sr.support)}并收盘在下方，多头结构失效。`
      : bias === 'bearish'
        ? `突破${round(sr.resistance)}并收盘在上方，空头结构失效。`
        : '价格有效突破区间并回踩确认，震荡判断失效。';

  const tradePlans = buildTradePlans(bias, price, sr.support, sr.resistance, atr, probabilities, conflict || scoreGap < 10, zone);
  const scenarios = buildScenarios(bias, sr.support, sr.resistance, probabilities);
  const riskLevel = tradeable ? (confidence === 'high' ? 'low' : 'medium') : 'high';
  const finalConclusion =
    `${marketBiasText}。关键确认位：${bias === 'bullish' ? round(sr.support) : bias === 'bearish' ? round(sr.resistance) : `${round(sr.support)} / ${round(sr.resistance)}`}。` +
    `关键失效位：${invalidation} 优先策略：${tradeable ? bestOpportunity : '等待结构确认，不追单。'}`;

  return {
    currentPrice: price,
    changePercent: +change.toFixed(2),
    dayHigh,
    dayLow,
    bias,
    confidence,
    state,
    trend1H,
    trend4H,
    trend15M,
    bestOpportunity,
    marketBiasText,
    tradeSuitability,
    probabilities,
    timeframeStructures: snapshots.map(s => ({
      timeframe: s.key,
      label: s.label,
      structure: s.structure,
      trend: s.trend,
      bos: s.bos,
      choch: s.choch,
      resistance: s.resistance,
      support: s.support,
      summary: s.summary,
    })),
    bos,
    choch,
    priceZone: zone,
    tradeable,
    swings,
    fvgZones: fvg,
    liquidity: liq,
    support: sr.support,
    resistance: sr.resistance,
    decision,
    reason,
    trigger,
    invalidation,
    riskLevel,
    scenarios,
    tradePlans,
    finalConclusion,
    futureOutlook: [
      bias === 'bullish' ? '若回踩不破支撑，多头更容易延续到上方流动性。' : bias === 'bearish' ? '若反抽不过压力，空头更容易延续到下方流动性。' : '若继续卡在中位区，交易优势会很低。',
      '突破后没有回踩确认，仍按高风险处理。',
      '若先扫一侧流动性再快速收回，优先观察反向结构确认。',
    ],
    riskNotes: [
      '多空分差小于10%，不建议交易。',
      '价格在区间中部，不建议交易。',
      '多周期冲突，只输出观察计划。',
      'RR不足1:1.5，不生成明确交易计划。',
      '所有结论仅作行情结构分析，不构成投资建议。',
    ],
  };
}
