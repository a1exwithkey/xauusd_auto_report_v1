import { Candle } from '../types';

/** Exponential Moving Average */
export function calcEMA(candles: Candle[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return result;

  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  result[period - 1] = +ema.toFixed(2);

  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * k + ema;
    result[i] = +ema.toFixed(2);
  }
  return result;
}

/** Volume-Weighted Average Price (intraday reset) */
export function calcVWAP(candles: Candle[]): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length === 0) return result;

  let cumPV = 0;
  let cumV = 0;
  let lastDate = '';

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const date = new Date(c.time * 1000).toISOString().slice(0, 10);

    if (date !== lastDate) {
      cumPV = 0;
      cumV = 0;
      lastDate = date;
    }

    const tp = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumPV += tp * vol;
    cumV += vol;
    result[i] = cumV > 0 ? +((cumPV / cumV).toFixed(2)) : null;
  }
  return result;
}

/** Average True Range (Wilder's smoothing) */
export function calcATR(candles: Candle[], period: number = 14): (number | null)[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { tr.push(candles[i].high - candles[i].low); continue; }
    const prev = candles[i - 1];
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev.close),
      Math.abs(candles[i].low - prev.close),
    ));
  }

  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return result;

  let atr = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  result[period - 1] = +atr.toFixed(2);

  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result[i] = +atr.toFixed(2);
  }
  return result;
}

/** Relative Strength Index */
export function calcRSI(candles: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return result;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : +(100 - (100 / (1 + avgGain / avgLoss))).toFixed(2);

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : +(100 - (100 / (1 + avgGain / avgLoss))).toFixed(2);
  }

  return result;
}

/** Current price relative to EMA20/EMA50 status */
export function trendSignal(
  candles: Candle[],
  ema20: (number | null)[],
  ema50: (number | null)[],
): 'bullish' | 'bearish' | 'neutral' {
  const last = candles.length - 1;
  const p = candles[last]?.close;
  const e20 = ema20[last];
  const e50 = ema50[last];
  if (p == null || e20 == null || e50 == null) return 'neutral';

  if (p > e20 && e20 > e50) return 'bullish';
  if (p < e20 && e20 < e50) return 'bearish';
  return 'neutral';
}
