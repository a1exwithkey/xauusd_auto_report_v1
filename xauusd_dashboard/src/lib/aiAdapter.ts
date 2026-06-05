import { AIAnalysisJSON, Bias, Candle, MarketAnalysis, MarketState, Scenario, TimeframeKey, TimeframeStructure, TradePlan } from '../types';

const UNKNOWN = '不知道';

function text(value: unknown, fallback = UNKNOWN): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function pct(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toBias(label: string): Bias {
  const v = label.toLowerCase();
  if (v.includes('多') || v.includes('bull') || v.includes('long') || v.includes('上涨')) return 'bullish';
  if (v.includes('空') || v.includes('bear') || v.includes('short') || v.includes('下跌')) return 'bearish';
  return 'neutral';
}

function toState(label: string): MarketState {
  const v = label.toLowerCase();
  if (v.includes('扫')) return 'sweeping_liquidity';
  if (v.includes('转换') || v.includes('choch')) return 'structure_shift';
  if (v.includes('震荡') || v.includes('range')) return 'ranging';
  if (v.includes('回踩') || v.includes('反抽')) return 'pullback';
  if (v.includes('多') || v.includes('上涨') || v.includes('bull')) return 'trending_up';
  if (v.includes('空') || v.includes('下跌') || v.includes('bear')) return 'trending_down';
  return 'waiting';
}

function structureFromTrend(trend: string): TimeframeStructure['structure'] {
  const v = trend.toLowerCase();
  if (v.includes('多') || v.includes('上涨') || v.includes('bull')) return '上涨';
  if (v.includes('空') || v.includes('下跌') || v.includes('bear')) return '下跌';
  if (v.includes('震荡') || v.includes('range')) return '震荡';
  return '等待确认';
}

function tfKey(value: string): TimeframeKey {
  const v = value.toLowerCase();
  if (v.includes('4')) return '4h';
  if (v.includes('1')) return '1h';
  if (v.includes('15')) return '15m';
  return '5m';
}

function direction(value: string): Scenario['direction'] {
  const v = value.toLowerCase();
  if (v.includes('long') || v.includes('多')) return 'Long';
  if (v.includes('short') || v.includes('空')) return 'Short';
  if (v.includes('range') || v.includes('区间') || v.includes('震荡')) return 'Range';
  return 'Wait';
}

function planDirection(value: string): TradePlan['direction'] {
  const v = value.toLowerCase();
  if (v.includes('long') || v.includes('多')) return 'Long';
  if (v.includes('short') || v.includes('空')) return 'Short';
  return 'Wait';
}

function latestPrice(candles: Candle[], fallback: number | null | undefined): number {
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  return candles[candles.length - 1]?.close ?? 0;
}

export function adaptAiAnalysis(ai: AIAnalysisJSON, base: MarketAnalysis | null, candles: Candle[], aiError = ''): MarketAnalysis {
  const price = latestPrice(candles, ai.market_overview.current_price);
  const bias = toBias(ai.market_overview.market_bias);
  const probabilities = {
    bullish: pct(ai.probability_view.bullish_probability),
    bearish: pct(ai.probability_view.bearish_probability),
    range: pct(ai.probability_view.range_probability),
    reversal: pct(ai.probability_view.reversal_probability),
  };
  const top = Math.max(probabilities.bullish, probabilities.bearish, probabilities.range, probabilities.reversal);

  const timeframeStructures: TimeframeStructure[] = ai.multi_timeframe_structure.map((item) => ({
    timeframe: tfKey(item.timeframe),
    label: text(item.timeframe),
    structure: structureFromTrend(item.trend),
    trend: toBias(`${item.trend} ${item.conclusion}`),
    bos: text(item.structure_notes, 'AI分析'),
    choch: text(item.conclusion, 'AI分析'),
    support: null,
    resistance: null,
    supportText: text(item.key_support),
    resistanceText: text(item.key_resistance),
    summary: `${text(item.structure_notes)} ${text(item.conclusion, '')}`.trim(),
  }));

  const scenarios: Scenario[] = ai.scenarios.map((item, index) => ({
    label: `${text(item.path, String.fromCharCode(65 + index))} ${text(item.name, '路径')}`,
    probability: index === 0 ? 'primary' : index === 1 ? 'secondary' : index === 2 ? 'breakout' : 'extreme',
    probabilityValue: pct(item.probability),
    direction: direction(item.direction),
    rr: '由 Gemini 判断',
    trigger: text(item.trigger),
    target: text(item.target),
    response: text(item.response),
    invalidation: text(item.invalidation),
    canTrade: !/wait|等待|观望|avoid|不适合/i.test(item.direction),
  }));

  const tradePlans: TradePlan[] = ai.trade_plans.map((item, index) => {
    const dir = planDirection(item.direction);
    return {
      name: `${text(item.linked_path, String.fromCharCode(65 + index))} 路径计划`,
      pathLabel: text(item.linked_path, String.fromCharCode(65 + index)),
      direction: dir,
      entry: text(item.entry, '等待确认'),
      sl: text(item.sl, '等待确认'),
      tp1: text(item.tp1, '等待确认'),
      tp2: text(item.tp2, '等待确认'),
      tp3: text(item.tp3, '等待确认'),
      rr: text(item.rr, '等待确认'),
      winRate: text(item.confidence, '不知道'),
      trigger: text(item.note, '等待确认'),
      invalidation: text(item.invalidation, '等待确认'),
      status: dir === 'Wait' ? 'waiting' : 'ready',
    };
  });

  return {
    currentPrice: price,
    changePercent: base?.changePercent ?? 0,
    dayHigh: base?.dayHigh ?? price,
    dayLow: base?.dayLow ?? price,
    bias,
    confidence: top >= 45 ? 'high' : top >= 30 ? 'medium' : 'low',
    state: toState(`${ai.market_overview.market_bias} ${ai.market_overview.summary}`),
    trend1H: timeframeStructures.find(t => t.timeframe === '1h')?.trend ?? 'neutral',
    trend4H: timeframeStructures.find(t => t.timeframe === '4h')?.trend ?? 'neutral',
    trend15M: timeframeStructures.find(t => t.timeframe === '15m')?.trend ?? 'neutral',
    bestOpportunity: text(ai.market_overview.best_opportunity),
    marketBiasText: text(ai.market_overview.market_bias),
    tradeSuitability: text(ai.market_overview.trade_suitability),
    probabilities,
    timeframeStructures,
    bos: 'Gemini分析',
    choch: 'Gemini分析',
    priceZone: base?.priceZone ?? 'mid',
    tradeable: !/不适合|等待|观望|avoid/i.test(ai.market_overview.trade_suitability),
    swings: base?.swings ?? [],
    fvgZones: base?.fvgZones ?? [],
    liquidity: base?.liquidity ?? [],
    support: null,
    resistance: null,
    decision: text(ai.final_conclusion.best_action_now),
    reason: text(ai.market_overview.summary),
    trigger: text(ai.final_conclusion.key_area_to_wait_for),
    invalidation: text(ai.risk_control.invalidation_summary),
    riskLevel: /不适合|等待|观望|高风险/i.test(ai.market_overview.trade_suitability) ? 'high' : 'medium',
    scenarios,
    tradePlans,
    finalConclusion: text(ai.final_conclusion.conclusion_text),
    futureOutlook: scenarios.map(s => `${s.label}：${s.trigger}，目标：${s.target}`),
    riskNotes: [
      ...ai.risk_control.no_trade_conditions,
      ...ai.risk_control.main_risks,
      ai.risk_control.invalidation_summary,
      aiError,
    ].filter(Boolean),
    aiAnalysis: ai,
    aiError,
    analysisSource: 'gemini',
  };
}
