import { Candle, MarketAnalysis, Bias, Confidence, MarketState, Scenario } from '../types';
import { calcEMA, calcVWAP, calcATR, trendSignal } from './indicators';
import {
  detectSwings, detectBOS, detectCHoCH, detectFVG, detectLiquidity,
  detectSweep, detectSR, swingTrend, detectZone,
} from './smc';

export function analyze(candles: Candle[]): MarketAnalysis {
  const last = candles[candles.length - 1];
  const price = last?.close ?? 0;
  const prevDay = candles.slice(0, Math.max(1, candles.length - 288)); // ~24h ago in 5m
  const dayOpen = prevDay.length > 0 ? prevDay[prevDay.length - 1]?.close ?? price : price;
  const change = dayOpen > 0 ? ((price - dayOpen) / dayOpen) * 100 : 0;
  const dayHigh = Math.max(...candles.slice(-288).map(c => c.high));
  const dayLow = Math.min(...candles.slice(-288).map(c => c.low));

  const ema20 = calcEMA(candles, 20);
  const ema50 = calcEMA(candles, 50);

  const swings = detectSwings(candles);
  const bos = detectBOS(candles, swings);
  const choch = detectCHoCH(candles, swings);
  const fvg = detectFVG(candles);
  const liq = detectLiquidity(candles, swings);
  const swept = detectSweep(candles, liq);
  const sr = detectSR(swings);
  const swTrend = swingTrend(swings);
  const signal = trendSignal(candles, ema20, ema50);
  const zone = detectZone(candles, swings);

  // --- Determine bias ---
  let bias: Bias = 'neutral';
  let confidence: Confidence = 'low';
  let bullishScore = 0;
  let bearishScore = 0;

  if (signal === 'bullish') bullishScore += 25;
  if (signal === 'bearish') bearishScore += 25;
  if (swTrend === 'bullish') bullishScore += 20;
  if (swTrend === 'bearish') bearishScore += 20;
  if (bos === 'bullish BOS') bullishScore += 20;
  if (bos === 'bearish BOS') bearishScore += 20;
  if (choch === 'bullish CHoCH') bullishScore += 15;
  if (choch === 'bearish CHoCH') bearishScore += 15;
  if (zone === 'discount') bullishScore += 10;
  if (zone === 'premium') bearishScore += 10;
  if (swept) {
    if (choch.includes('bullish')) bullishScore += 10;
    if (choch.includes('bearish')) bearishScore += 10;
  }

  const total = bullishScore + bearishScore;
  if (total > 0) {
    if (bullishScore > bearishScore + 10) bias = 'bullish';
    else if (bearishScore > bullishScore + 10) bias = 'bearish';
    else bias = 'neutral';
    const top = Math.max(bullishScore, bearishScore);
    confidence = top >= 45 ? 'high' : top >= 25 ? 'medium' : 'low';
  }

  // --- Market state ---
  let state: MarketState = 'waiting';
  if (bias === 'bullish' && bos === 'bullish BOS') state = 'trending_up';
  else if (bias === 'bearish' && bos === 'bearish BOS') state = 'trending_down';
  else if (bias === 'neutral') state = 'ranging';
  else if (choch !== 'none') state = 'structure_shift';
  else if (swept) state = 'sweeping_liquidity';

  // --- Tradeable ---
  const tradeable = confidence !== 'low' && state !== 'waiting' && zone !== 'mid';

  // --- Decision text ---
  let decision: string;
  let reason: string;
  let trigger: string;
  let invalidation: string;

  if (bias === 'bullish' && confidence !== 'low') {
    decision = '偏向做多，等待回踩确认';
    reason = `结构${swTrend === 'bullish' ? '延续HH/HL' : '偏多'}，${bos !== 'none' ? `出现${bos}` : ''}，价格位于${zone === 'discount' ? '折扣区' : zone === 'premium' ? '溢价区（谨慎）' : '中位区'}`;
    trigger = bos === 'bullish BOS' ? '回踩最近FVG或支撑位后出现5m确认信号' : '等待bullish BOS确认后回踩入场';
    invalidation = `跌破${sr.support?.toFixed(2) ?? '最近支撑'}并形成bearish CHoCH`;
  } else if (bias === 'bearish' && confidence !== 'low') {
    decision = '偏向做空，等待反抽确认';
    reason = `结构${swTrend === 'bearish' ? '延续LH/LL' : '偏空'}，${bos !== 'none' ? `出现${bos}` : ''}，价格位于${zone === 'premium' ? '溢价区' : zone === 'discount' ? '折扣区（谨慎）' : '中位区'}`;
    trigger = bos === 'bearish BOS' ? '反抽最近FVG或阻力位后出现5m确认信号' : '等待bearish BOS确认后反抽入场';
    invalidation = `突破${sr.resistance?.toFixed(2) ?? '最近阻力'}并形成bullish CHoCH`;
  } else if (confidence === 'low') {
    decision = '等待确认，当前位置不适合入场';
    reason = '置信度不足，结构信号不够清晰，强行入场胜率低';
    trigger = `${swTrend === 'bullish' ? '价格回踩支撑' : swTrend === 'bearish' ? '价格反抽阻力' : '等待结构突破方向'}后出现明确BOS/CHoCH`;
    invalidation = '无明确失效条件，等待结构明朗';
  } else {
    decision = '区间操作，等待边界确认';
    reason = `价格在${zone}区域，方向不明确，按区间上下沿处理`;
    trigger = '触及区间边界后出现拒绝K线或反转结构';
    invalidation = '收盘有效突破区间边界';
  }

  // --- Scenarios ---
  const scenarios: Scenario[] = [];
  if (bias === 'bullish') {
    scenarios.push(
      { label: '主路径：回踩继续向上', probability: 'primary', trigger: '价格回踩支撑或bullish FVG后出现强阳线', target: `测试上方流动性 ${sr.resistance?.toFixed(2) ?? '待确认'}`, response: '回踩确认后入场做多，止损放在支撑下方', invalidation: '跌破支撑位并收盘在下方' },
      { label: '诱空路径：先扫低再上行', probability: 'secondary', trigger: `价格先扫sell-side liquidity ${sr.support?.toFixed(2) ?? ''} 后快速收回`, target: '形成bullish CHoCH后测试上方目标', response: '扫低后不追空，等收回确认再做多', invalidation: '扫低后继续下跌不回区间' },
      { label: '极端路径：多头结构失效', probability: 'extreme', trigger: `价格跌破${sr.support?.toFixed(2) ?? '关键支撑'}并形成bearish CHoCH`, target: '转向空头结构', response: '多头判断失效，停止做多思路', invalidation: '重新站回结构位上方' },
    );
  } else if (bias === 'bearish') {
    scenarios.push(
      { label: '主路径：反抽继续向下', probability: 'primary', trigger: '价格反抽阻力或bearish FVG后出现强阴线', target: `测试下方流动性 ${sr.support?.toFixed(2) ?? '待确认'}`, response: '反抽确认后入场做空，止损放在阻力上方', invalidation: '突破阻力位并收盘在上方' },
      { label: '诱多路径：先扫高再下行', probability: 'secondary', trigger: `价格先扫buy-side liquidity ${sr.resistance?.toFixed(2) ?? ''} 后快速跌回`, target: '形成bearish CHoCH后测试下方目标', response: '扫高后不追多，等跌回确认再做空', invalidation: '扫高后继续上涨不回区间' },
      { label: '极端路径：空头结构失效', probability: 'extreme', trigger: `价格突破${sr.resistance?.toFixed(2) ?? '关键阻力'}并形成bullish CHoCH`, target: '转向多头结构', response: '空头判断失效，停止做空思路', invalidation: '重新跌破结构位下方' },
    );
  } else {
    scenarios.push(
      { label: '主路径：区间震荡', probability: 'primary', trigger: '价格在区间内运行，未出现有效突破', target: `区间上沿 ${sr.resistance?.toFixed(2) ?? ''} / 下沿 ${sr.support?.toFixed(2) ?? ''}`, response: '区间上沿考虑做空，下沿考虑做多', invalidation: '收盘有效突破区间' },
      { label: '假突破路径', probability: 'secondary', trigger: '价格扫高/扫低后快速回到区间内', target: '回到区间中位区', response: '不追突破方向，等假突破确认后反向交易', invalidation: '突破后不回区间' },
      { label: '突破路径', probability: 'extreme', trigger: '收盘+回踩确认有效突破区间', target: '突破方向延续', response: '突破跟随，止损放在区间内', invalidation: '突破后重新回到区间' },
    );
  }

  return {
    currentPrice: price,
    changePercent: +change.toFixed(2),
    dayHigh,
    dayLow,
    bias,
    confidence,
    state,
    trend1H: swTrend,
    trend4H: swTrend, // Mock: same as 1H for MVP
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
    riskLevel: confidence === 'high' ? 'low' : confidence === 'medium' ? 'medium' : 'high',
    scenarios,
  };
}
