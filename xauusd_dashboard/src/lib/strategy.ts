import {
  Candle,
  MarketAnalysis,
  Bias,
  Confidence,
  FVGZone,
  LiquidityLevel,
  MarketState,
  Scenario,
  SwingPoint,
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

type LevelContext = {
  support: number | null;
  resistance: number | null;
  supportSource: string;
  resistanceSource: string;
  buyLiquidity: number | null;
  sellLiquidity: number | null;
  position: 'near_support' | 'near_resistance' | 'middle' | 'compressed';
  longRoom: number;
  shortRoom: number;
  valid: boolean;
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

function nearestAbove(levels: number[], price: number): number | null {
  const valid = levels.filter(v => Number.isFinite(v) && v > price).sort((a, b) => a - b);
  return valid[0] ?? null;
}

function nearestBelow(levels: number[], price: number): number | null {
  const valid = levels.filter(v => Number.isFinite(v) && v < price).sort((a, b) => b - a);
  return valid[0] ?? null;
}

function buildLevelContext(
  candles: Candle[],
  swings: SwingPoint[],
  fvg: FVGZone[],
  liquidity: LiquidityLevel[],
  atr: number,
): LevelContext {
  const price = candles[candles.length - 1]?.close ?? 0;
  const dayCandles = candles.slice(-288);
  const dayHigh = dayCandles.length ? Math.max(...dayCandles.map(c => c.high)) : price + atr;
  const dayLow = dayCandles.length ? Math.min(...dayCandles.map(c => c.low)) : price - atr;
  const minGap = Math.max(atr * 0.12, price * 0.00008, 0.25);

  const swingHighs = swings.filter(s => s.type === 'high').map(s => s.price);
  const swingLows = swings.filter(s => s.type === 'low').map(s => s.price);
  const bearishFvgAbove = fvg.filter(z => z.type === 'bearish' && z.bottom > price + minGap).map(z => z.bottom);
  const bullishFvgBelow = fvg.filter(z => z.type === 'bullish' && z.top < price - minGap).map(z => z.top);
  const buyLiqAbove = liquidity.filter(l => l.type === 'buy_side' && l.price > price + minGap).map(l => l.price);
  const sellLiqBelow = liquidity.filter(l => l.type === 'sell_side' && l.price < price - minGap).map(l => l.price);

  const resistanceCandidates = [...swingHighs, ...bearishFvgAbove, ...buyLiqAbove, dayHigh].filter(v => v > price + minGap);
  const supportCandidates = [...swingLows, ...bullishFvgBelow, ...sellLiqBelow, dayLow].filter(v => v < price - minGap);
  const resistance = nearestAbove(resistanceCandidates, price);
  const support = nearestBelow(supportCandidates, price);
  const buyLiquidity = nearestAbove([...buyLiqAbove, dayHigh], price);
  const sellLiquidity = nearestBelow([...sellLiqBelow, dayLow], price);

  const longRoom = resistance ? resistance - price : 0;
  const shortRoom = support ? price - support : 0;
  const totalRange = support && resistance ? resistance - support : 0;
  const rangePos = totalRange > 0 ? (price - support!) / totalRange : 0.5;

  let position: LevelContext['position'] = 'middle';
  if (!support || !resistance || totalRange < atr * 1.2) position = 'compressed';
  else if (longRoom <= atr * 0.9 || rangePos > 0.68) position = 'near_resistance';
  else if (shortRoom <= atr * 0.9 || rangePos < 0.32) position = 'near_support';

  const source = (level: number | null, side: 'support' | 'resistance') => {
    if (level == null) return '未确认';
    if (side === 'resistance' && Math.abs(level - dayHigh) <= minGap) return '日高/前高流动性';
    if (side === 'support' && Math.abs(level - dayLow) <= minGap) return '日低/前低流动性';
    if (side === 'resistance' && buyLiqAbove.some(v => Math.abs(v - level) <= minGap)) return 'Buy Side Liquidity';
    if (side === 'support' && sellLiqBelow.some(v => Math.abs(v - level) <= minGap)) return 'Sell Side Liquidity';
    if (side === 'resistance' && bearishFvgAbove.some(v => Math.abs(v - level) <= minGap)) return 'Bearish FVG';
    if (side === 'support' && bullishFvgBelow.some(v => Math.abs(v - level) <= minGap)) return 'Bullish FVG';
    return side === 'resistance' ? '结构压力' : '结构支撑';
  };

  return {
    support,
    resistance,
    supportSource: source(support, 'support'),
    resistanceSource: source(resistance, 'resistance'),
    buyLiquidity,
    sellLiquidity,
    position,
    longRoom,
    shortRoom,
    valid: support != null && resistance != null && totalRange >= atr * 1.2,
  };
}

function rrLabel(value: number | null): string {
  return value == null || !Number.isFinite(value) || value <= 0 ? '等待确认' : `1:${value.toFixed(1)}`;
}

function strongestProbability(probabilities: MarketAnalysis['probabilities']): 'bullish' | 'bearish' | 'range' | 'reversal' {
  const entries = Object.entries(probabilities) as Array<[keyof MarketAnalysis['probabilities'], number]>;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function validateConsistency(
  probabilities: MarketAnalysis['probabilities'],
  bias: Bias,
  primaryDirection: Scenario['direction'],
): string {
  const strongest = strongestProbability(probabilities);
  if (strongest === 'range' && primaryDirection !== 'Range') return '概率最大项为震荡，主路径不应强行多空';
  if (strongest === 'bullish' && primaryDirection === 'Short') return '概率最大项偏多，但主路径偏空';
  if (strongest === 'bearish' && primaryDirection === 'Long') return '概率最大项偏空，但主路径偏多';
  if (bias === 'neutral' && (primaryDirection === 'Long' || primaryDirection === 'Short')) return '顶部方向等待确认，但主路径给出单边方向';
  return '';
}

function isDirectionallyValidPlan(direction: 'Long' | 'Short', entry: number, sl: number, tp1: number): boolean {
  if (direction === 'Long') return entry < tp1 && sl < entry;
  return entry > tp1 && sl > entry;
}

function scenarioRoomRR(direction: Scenario['direction'], price: number, levels: LevelContext, atr: number): number | null {
  if (!levels.valid || levels.support == null || levels.resistance == null) return null;
  if (direction === 'Long') {
    const entry = Math.min(price, levels.support + atr * 0.35);
    const sl = levels.support - atr * 0.75;
    const tp = Math.max(levels.resistance, entry + atr);
    return (tp - entry) / Math.max(entry - sl, 0.01);
  }
  if (direction === 'Short') {
    const entry = Math.max(price, levels.resistance - atr * 0.35);
    const sl = levels.resistance + atr * 0.75;
    const tp = Math.min(levels.support, entry - atr);
    return (entry - tp) / Math.max(sl - entry, 0.01);
  }
  return null;
}

function capExtreme(probabilities: MarketAnalysis['probabilities'], swept: boolean, choch: string): MarketAnalysis['probabilities'] {
  const main = Math.max(probabilities.bullish, probabilities.bearish, probabilities.range);
  const confirmedReversal = swept && choch !== 'none';
  return {
    ...probabilities,
    reversal: confirmedReversal ? probabilities.reversal : Math.min(probabilities.reversal, Math.max(main - 8, 5)),
  };
}

function resolveBias(
  probabilities: MarketAnalysis['probabilities'],
  trend4H: Bias,
  trend1H: Bias,
  conflict: boolean,
): Bias {
  const gap = Math.abs(probabilities.bullish - probabilities.bearish);
  if (conflict || gap < 8) return 'neutral';
  if (probabilities.range >= Math.max(probabilities.bullish, probabilities.bearish)) return 'neutral';
  if (probabilities.bullish > probabilities.bearish && (trend4H !== 'bearish' || trend1H === 'bullish')) return 'bullish';
  if (probabilities.bearish > probabilities.bullish && (trend4H !== 'bullish' || trend1H === 'bearish')) return 'bearish';
  return 'neutral';
}

function buildTradePlans(
  scenarios: Scenario[],
  price: number,
  levels: LevelContext,
  atr: number,
  probabilities: MarketAnalysis['probabilities'],
  blockReason: string,
  zone: MarketAnalysis['priceZone'],
): TradePlan[] {
  const plans = scenarios.slice(0, 4).map((scenario) => {
    if (scenario.direction !== 'Long' && scenario.direction !== 'Short') {
      return waitPlanForScenario(scenario, blockReason || '该路径不是可执行方向，等待结构确认。');
    }

    if (!scenario.canTrade || levels.support == null || levels.resistance == null || zone === 'mid') {
      return waitPlanForScenario(scenario, blockReason);
    }

    if (scenario.direction === 'Long') {
      const entry = scenario.probability === 'breakout' ? levels.resistance + atr * 0.12 : Math.min(price, levels.support + atr * 0.35);
      const sl = scenario.probability === 'breakout' ? levels.resistance - atr * 0.55 : levels.support - atr * 0.75;
      const tp1 = Math.max(entry + atr * 1.4, levels.resistance + atr * 0.4);
      const tp2 = tp1 + atr * 1.2;
      const tp3 = tp2 + atr * 1.2;
      const rr = (tp1 - entry) / Math.max(entry - sl, 0.01);
      return rr >= 1.5 && isDirectionallyValidPlan('Long', entry, sl, tp1)
        ? makePlan(`${scenario.label} 计划`, scenario.label, 'Long', entry, sl, tp1, tp2, tp3, rr, scenario.probabilityValue, scenario.trigger, scenario.invalidation)
        : waitPlanForScenario(scenario, 'RR不足或多单方向关系不合法，等待更好的价格。');
    }

    const entry = scenario.probability === 'breakout' ? levels.support - atr * 0.12 : Math.max(price, levels.resistance - atr * 0.35);
    const sl = scenario.probability === 'breakout' ? levels.support + atr * 0.55 : levels.resistance + atr * 0.75;
    const tp1 = Math.min(entry - atr * 1.4, levels.support - atr * 0.4);
    const tp2 = tp1 - atr * 1.2;
    const tp3 = tp2 - atr * 1.2;
    const rr = (entry - tp1) / Math.max(sl - entry, 0.01);
    return rr >= 1.5 && isDirectionallyValidPlan('Short', entry, sl, tp1)
      ? makePlan(`${scenario.label} 计划`, scenario.label, 'Short', entry, sl, tp1, tp2, tp3, rr, scenario.probabilityValue, scenario.trigger, scenario.invalidation)
      : waitPlanForScenario(scenario, 'RR不足或空单方向关系不合法，等待更好的价格。');
  });

  return plans;
}

function makePlan(
  name: string,
  pathLabel: string,
  direction: 'Long' | 'Short',
  entry: number,
  sl: number,
  tp1: number,
  tp2: number,
  tp3: number,
  rr: number,
  winRate: number,
  trigger: string,
  invalidation: string,
): TradePlan {
  return {
    name,
    pathLabel,
    direction,
    entry: round(entry),
    sl: round(sl),
    tp1: round(tp1),
    tp2: round(tp2),
    tp3: round(tp3),
    rr: `1:${rr.toFixed(1)}`,
    winRate: `${pct(winRate)}%`,
    trigger,
    invalidation,
    status: 'ready',
  };
}

function waitPlanForScenario(scenario: Scenario, reason: string): TradePlan {
  return {
    name: `${scenario.label} 计划`,
    pathLabel: scenario.label,
    direction: 'Wait',
    entry: `等待触发：${scenario.trigger}`,
    sl: '等待确认',
    tp1: scenario.target,
    tp2: '等待路径确认',
    tp3: '等待路径确认',
    rr: '等待确认',
    winRate: `${scenario.probabilityValue}% 结构概率`,
    trigger: scenario.trigger,
    invalidation: reason || scenario.invalidation,
    status: 'waiting',
  };
}

function buildScenarios(
  bias: Bias,
  levels: LevelContext,
  price: number,
  atr: number,
  probabilities: MarketAnalysis['probabilities'],
  blocked: boolean,
  zone: MarketAnalysis['priceZone'],
  swept: boolean,
  choch: string,
  bos: string,
): Scenario[] {
  const upper = round(levels.resistance);
  const lower = round(levels.support);
  const noLevelsText = '暂无有效关键位';
  const longRR = scenarioRoomRR('Long', price, levels, atr);
  const shortRR = scenarioRoomRR('Short', price, levels, atr);
  const breakoutLongRR = levels.valid && levels.resistance ? (Math.max((levels.buyLiquidity ?? levels.resistance + atr * 1.5) - (levels.resistance + atr * 0.12), atr) / Math.max(atr * 0.67, 0.01)) : null;
  const breakoutShortRR = levels.valid && levels.support ? (Math.max((levels.support - atr * 0.12) - (levels.sellLiquidity ?? levels.support - atr * 1.5), atr) / Math.max(atr * 0.67, 0.01)) : null;
  const canMainTrade = !blocked && zone !== 'mid' && levels.valid;
  const strongReverseBos =
    (bias === 'bullish' && bos === 'bearish BOS') ||
    (bias === 'bearish' && bos === 'bullish BOS') ||
    (bias === 'neutral' && bos !== 'none');
  const hasExtremeTrigger = swept || choch !== 'none' || strongReverseBos;
  const canExtremeTrade = hasExtremeTrigger && !blocked;
  if (bias === 'bullish') {
    return [
      { label: 'A 主路径', probability: 'primary', probabilityValue: probabilities.bullish, direction: 'Long', rr: rrLabel(longRR), trigger: levels.valid ? `回踩${lower}附近不破，5M重新转强` : noLevelsText, target: levels.resistance ? `先看${upper}，再看上方流动性` : noLevelsText, response: '只等回踩，不追高。', invalidation: levels.support ? `跌破${lower}并收不回` : noLevelsText, canTrade: canMainTrade && (longRR ?? 0) >= 1.5 },
      { label: 'B 备选路径', probability: 'secondary', probabilityValue: Math.max(probabilities.range, 12), direction: 'Range', rr: '区间观察', trigger: levels.valid ? '价格继续围绕VWAP横向运行' : noLevelsText, target: levels.valid ? `${lower} - ${upper}` : noLevelsText, response: '区间边界处理，中间不动。', invalidation: '收盘突破区间并回踩确认', canTrade: false },
      { label: 'C 破位路径', probability: 'breakout', probabilityValue: Math.max(probabilities.bullish - 8, 8), direction: 'Long', rr: rrLabel(breakoutLongRR), trigger: levels.resistance ? `突破${upper}后回踩不破` : noLevelsText, target: levels.buyLiquidity ? `上方Buy Side Liquidity ${round(levels.buyLiquidity)}` : '上方空间待确认', response: '突破后等回踩确认。', invalidation: '突破后快速跌回区间', canTrade: false },
      { label: 'D 极端路径', probability: 'extreme', probabilityValue: probabilities.reversal, direction: 'Short', rr: rrLabel(shortRR), trigger: hasExtremeTrigger ? `扫高/反向结构确认后跌回${upper}下方并转弱` : '未出现扫流动性/CHoCH/强反向BOS，仅观察', target: levels.support ? lower : noLevelsText, response: '只作为反向条件路径。', invalidation: '重新站上扫高位', canTrade: canExtremeTrade && (shortRR ?? 0) >= 1.5 },
    ];
  }
  if (bias === 'bearish') {
    return [
      { label: 'A 主路径', probability: 'primary', probabilityValue: probabilities.bearish, direction: 'Short', rr: rrLabel(shortRR), trigger: levels.valid ? `反抽${upper}附近受压，5M重新转弱` : noLevelsText, target: levels.support ? `先看${lower}，再看下方流动性` : noLevelsText, response: '只等反抽，不追低。', invalidation: levels.resistance ? `突破${upper}并收不回` : noLevelsText, canTrade: canMainTrade && (shortRR ?? 0) >= 1.5 },
      { label: 'B 备选路径', probability: 'secondary', probabilityValue: Math.max(probabilities.range, 12), direction: 'Range', rr: '区间观察', trigger: levels.valid ? '价格继续贴近VWAP横向运行' : noLevelsText, target: levels.valid ? `${lower} - ${upper}` : noLevelsText, response: '只看边界，不追单。', invalidation: '收盘突破区间并回踩确认', canTrade: false },
      { label: 'C 破位路径', probability: 'breakout', probabilityValue: Math.max(probabilities.bearish - 8, 8), direction: 'Short', rr: rrLabel(breakoutShortRR), trigger: levels.support ? `跌破${lower}后反抽不回` : noLevelsText, target: levels.sellLiquidity ? `下方Sell Side Liquidity ${round(levels.sellLiquidity)}` : '下方空间待确认', response: '跌破后等反抽确认。', invalidation: '跌破后快速收回区间', canTrade: false },
      { label: 'D 极端路径', probability: 'extreme', probabilityValue: probabilities.reversal, direction: 'Long', rr: rrLabel(longRR), trigger: hasExtremeTrigger ? `扫低/反向结构确认后重新站回${lower}上方并转强` : '未出现扫流动性/CHoCH/强反向BOS，仅观察', target: levels.resistance ? upper : noLevelsText, response: '只作为反向条件路径。', invalidation: '重新跌破扫低位', canTrade: canExtremeTrade && (longRR ?? 0) >= 1.5 },
    ];
  }
  return [
    { label: 'A 主路径', probability: 'primary', probabilityValue: probabilities.range, direction: 'Range', rr: '区间观察', trigger: levels.valid ? '价格维持在支撑压力之间' : noLevelsText, target: levels.valid ? `${lower} - ${upper}` : noLevelsText, response: '区间边界确认，中部不动。', invalidation: '有效突破任一边界', canTrade: false },
    { label: 'B 备选路径', probability: 'secondary', probabilityValue: probabilities.bullish, direction: 'Long', rr: rrLabel(breakoutLongRR), trigger: levels.resistance ? `突破${upper}并回踩确认` : noLevelsText, target: levels.buyLiquidity ? `上方流动性 ${round(levels.buyLiquidity)}` : '上方空间待确认', response: '确认后跟随，不提前猜方向。', invalidation: '突破后跌回区间', canTrade: false },
    { label: 'C 破位路径', probability: 'breakout', probabilityValue: probabilities.bearish, direction: 'Short', rr: rrLabel(breakoutShortRR), trigger: levels.support ? `跌破${lower}并反抽确认` : noLevelsText, target: levels.sellLiquidity ? `下方流动性 ${round(levels.sellLiquidity)}` : '下方空间待确认', response: '确认后跟随，不追第一根。', invalidation: '跌破后收回区间', canTrade: false },
    { label: 'D 极端路径', probability: 'extreme', probabilityValue: probabilities.reversal, direction: hasExtremeTrigger ? 'Long' : 'Wait', rr: rrLabel(hasExtremeTrigger ? longRR : null), trigger: hasExtremeTrigger ? '先扫一侧流动性或出现反向结构，再快速反向收回' : '未出现扫流动性/CHoCH/强反向BOS，仅观察', target: '回到区间另一侧', response: '只在扫流动性后做反向确认。', invalidation: '扫后不回区间', canTrade: canExtremeTrade && (longRR ?? 0) >= 1.5 },
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
  const levels = buildLevelContext(candles, swings, fvg, liq, atr);
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

  const probabilities = normalizeScores(capExtreme(normalizeScores(raw), swept, choch));
  const bias = resolveBias(probabilities, trend4H, trend1H, conflict);

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

  const blockReasons = [
    conflict ? '4H/1H方向冲突' : '',
    scoreGap < 8 ? '多空分差不足' : '',
    levels.position === 'middle' ? '价格在区间中部' : '',
    confidence === 'low' ? '结构置信度偏低' : '',
    !levels.valid ? '暂无有效关键位' : '',
  ].filter(Boolean);
  const blocked = blockReasons.length > 0;
  const scenarios = buildScenarios(bias, levels, price, atr, probabilities, blocked, zone, swept, choch, bos);
  const primaryPath = scenarios[0];
  const consistencyIssue = validateConsistency(probabilities, bias, primaryPath.direction);
  const finalBlockReasons = consistencyIssue ? [...blockReasons, '方向信号不一致，暂不建议交易'] : blockReasons;
  const tradeable = primaryPath.canTrade && confidence !== 'low' && !consistencyIssue;
  const marketBiasText =
    consistencyIssue ? '震荡/等待确认' :
      bias === 'bullish' ? (scoreGap > 15 ? '明确偏多' : '轻微偏多') :
      bias === 'bearish' ? (scoreGap > 15 ? '明确偏空' : '轻微偏空') :
        '震荡/等待确认';
  const tradeSuitability = tradeable ? '适合等待路径触发' : `不适合直接入场：${finalBlockReasons[0] || '等待触发'}`;
  const bestOpportunity = primaryPath.canTrade ? primaryPath.trigger : `等待：${primaryPath.trigger}`;

  const decision =
    tradeable && primaryPath.direction === 'Long'
      ? '路径A偏多，等待回踩确认'
      : tradeable && primaryPath.direction === 'Short'
        ? '路径A偏空，等待反抽确认'
        : conflict
          ? '多周期冲突，只观察'
          : '等待路径触发，当前位置不追单';

  const reason =
    `4H ${snapshots[0].structure}，1H ${snapshots[1].structure}，15M ${snapshots[2].structure}。` +
    ` 价格在${zone === 'premium' ? 'Premium' : zone === 'discount' ? 'Discount' : 'Mid-range'}，` +
    `RSI ${lastRsi.toFixed(0)}，主路径为${primaryPath.label}。`;

  const trigger = primaryPath.trigger;

  const invalidation = primaryPath.invalidation;

  const tradePlans = buildTradePlans(scenarios.map(s => consistencyIssue ? { ...s, canTrade: false } : s), price, levels, atr, probabilities, finalBlockReasons.join('；') || primaryPath.invalidation, zone);
  const riskLevel = tradeable ? (confidence === 'high' ? 'low' : 'medium') : 'high';
  const finalConclusion =
    `当前${marketBiasText}，主看${primaryPath.label}。` +
    `最值得关注：${primaryPath.trigger}。` +
    `失效：${primaryPath.invalidation}。` +
    `${tradeable ? '可以等待触发，不追第一根。' : '当前位置不适合直接入场。'}`;

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
      resistance: s.key === '15m' ? levels.resistance : s.resistance,
      support: s.key === '15m' ? levels.support : s.support,
      summary: s.summary,
    })),
    bos,
    choch,
    priceZone: zone,
    tradeable,
    swings,
    fvgZones: fvg,
    liquidity: liq,
    support: levels.support,
    resistance: levels.resistance,
    decision,
    reason,
    trigger,
    invalidation,
    riskLevel,
    scenarios,
    tradePlans,
    finalConclusion,
    futureOutlook: [
      `${scenarios[0].label}：${scenarios[0].trigger}，目标${scenarios[0].target}。`,
      `${scenarios[1].label}：${scenarios[1].trigger}，目标${scenarios[1].target}。`,
      `${scenarios[2].label}：${scenarios[2].trigger}，目标${scenarios[2].target}。`,
    ],
    riskNotes: [
      finalBlockReasons[0] || '等待路径触发，不追单。',
      consistencyIssue || `关键位校验：压力${levels.resistance ? `在现价上方 ${round(levels.resistance)} (${levels.resistanceSource})` : '暂无有效'}，支撑${levels.support ? `在现价下方 ${round(levels.support)} (${levels.supportSource})` : '暂无有效'}。`,
      '路径C必须等突破后回踩/反抽确认。',
      '路径D必须等扫流动性后反向确认。',
      'RR不足1:1.5，不生成明确Entry。',
      '所有结论仅作行情结构分析，不构成投资建议。',
    ],
  };
}
