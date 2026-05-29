import { Candle, SwingPoint, FVGZone, LiquidityLevel } from '../types';
import { calcATR } from './indicators';

// --- Swing High / Low Detection (fractal, left=3, right=3) ---

export function detectSwings(candles: Candle[], left = 3, right = 3): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const windowHighs = candles.slice(i - left, i + right + 1).map(c => c.high);

    if (candles[i].high >= Math.max(...windowHighs) &&
        windowHighs.filter(h => h === candles[i].high).length === 1) {
      swings.push({ time: candles[i].time, price: candles[i].high, type: 'high' });
    }
  }
  for (let i = left; i < candles.length - right; i++) {
    const windowLows = candles.slice(i - left, i + right + 1).map(c => c.low);

    if (candles[i].low <= Math.min(...windowLows) &&
        windowLows.filter(l => l === candles[i].low).length === 1) {
      swings.push({ time: candles[i].time, price: candles[i].low, type: 'low' });
    }
  }
  swings.sort((a, b) => a.time - b.time);
  return swings;
}

// --- BOS (Break of Structure) ---

export function detectBOS(candles: Candle[], swings: SwingPoint[]): string {
  if (swings.length < 2 || candles.length === 0) return 'none';
  const close = candles[candles.length - 1].close;
  const lastHigh = [...swings].reverse().find(s => s.type === 'high');
  const lastLow = [...swings].reverse().find(s => s.type === 'low');

  if (lastHigh && close > lastHigh.price) return 'bullish BOS';
  if (lastLow && close < lastLow.price) return 'bearish BOS';
  return 'none';
}

// --- CHoCH (Change of Character) ---

export function detectCHoCH(candles: Candle[], swings: SwingPoint[]): string {
  if (swings.length < 4) return 'none';
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  if (highs.length < 2 || lows.length < 2) return 'none';

  const last2H = highs.slice(-2);
  const last2L = lows.slice(-2);

  // Was trending down (LH) but now HH appears
  const wasDowntrend = last2H.length >= 2 && last2H[last2H.length - 2].price > last2H[last2H.length - 1].price;
  const nowHHSignal = last2H.length >= 2 && last2H[last2H.length - 2].price < last2H[last2H.length - 1].price;

  // Was trending up (HL) but now LL appears
  const wasUptrend = last2L.length >= 2 && last2L[last2L.length - 2].price < last2L[last2L.length - 1].price;
  const nowLLSignal = last2L.length >= 2 && last2L[last2L.length - 2].price > last2L[last2L.length - 1].price;

  if (wasDowntrend && nowHHSignal) return 'bullish CHoCH';
  if (wasUptrend && nowLLSignal) return 'bearish CHoCH';
  return 'none';
}

// --- FVG Detection ---

export function detectFVG(candles: Candle[]): FVGZone[] {
  const zones: FVGZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];

    // Bullish FVG: candle3 low > candle1 high (gap up)
    if (c3.low > c1.high) {
      zones.push({
        startTime: candles[i].time,
        endTime: candles[Math.min(i + 15, candles.length - 1)].time,
        top: c3.low,
        bottom: c1.high,
        type: 'bullish',
      });
    }
    // Bearish FVG: candle3 high < candle1 low (gap down)
    if (c3.high < c1.low) {
      zones.push({
        startTime: candles[i].time,
        endTime: candles[Math.min(i + 15, candles.length - 1)].time,
        top: c1.low,
        bottom: c3.high,
        type: 'bearish',
      });
    }
  }
  return zones.slice(-8); // keep recent
}

// --- Equal Highs / Equal Lows (Liquidity Pools) ---

export function detectLiquidity(
  candles: Candle[],
  swings: SwingPoint[],
): LiquidityLevel[] {
  const atrArr = calcATR(candles, 14);
  const fallbackPrice = candles.length > 0 ? candles[candles.length - 1].close : 2600;
  const lastATR = atrArr[atrArr.length - 1] ?? fallbackPrice * 0.001;
  const threshold = Math.max(lastATR * 0.25, 0.3);
  const levels: LiquidityLevel[] = [];

  const highs = swings.filter(s => s.type === 'high').slice(-8);
  const lows = swings.filter(s => s.type === 'low').slice(-8);

  // Check equal highs (buy-side liquidity)
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[i].price - highs[j].price) <= threshold) {
        levels.push({
          price: +((highs[i].price + highs[j].price) / 2).toFixed(2),
          type: 'buy_side',
          source: 'equal_highs',
          touches: 2,
        });
      }
    }
  }

  // Check equal lows (sell-side liquidity)
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[i].price - lows[j].price) <= threshold) {
        levels.push({
          price: +((lows[i].price + lows[j].price) / 2).toFixed(2),
          type: 'sell_side',
          source: 'equal_lows',
          touches: 2,
        });
      }
    }
  }

  // Fallback: most recent swing high/low as liquidity
  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];

  if (levels.filter(l => l.type === 'buy_side').length === 0 && lastHigh) {
    levels.push({ price: lastHigh.price, type: 'buy_side', source: 'prior_high', touches: 1 });
  }
  if (levels.filter(l => l.type === 'sell_side').length === 0 && lastLow) {
    levels.push({ price: lastLow.price, type: 'sell_side', source: 'prior_low', touches: 1 });
  }

  return levels;
}

// --- Sweep Detection ---

export function detectSweep(candles: Candle[], liquidity: LiquidityLevel[]): boolean {
  const recent = candles.slice(-10);
  for (const liq of liquidity) {
    const breachedHigh = recent.some(c => c.high > liq.price);
    const breachedLow = recent.some(c => c.low < liq.price);
    const lastClose = candles[candles.length - 1]?.close;

    if (liq.type === 'buy_side' && breachedHigh && lastClose < liq.price) return true;
    if (liq.type === 'sell_side' && breachedLow && lastClose > liq.price) return true;
  }
  return false;
}

// --- Support / Resistance ---

export function detectSR(swings: SwingPoint[]): { support: number | null; resistance: number | null } {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  const lastClose = swings.length > 0 ? null : null; // will use swings

  const resistance = highs.length > 0 ? Math.min(...highs.slice(-3).map(s => s.price)) : null;
  const support = lows.length > 0 ? Math.max(...lows.slice(-3).map(s => s.price)) : null;

  return { support, resistance };
}

// --- Trend from swings (HH/HL vs LH/LL) ---

export function swingTrend(swings: SwingPoint[]): 'bullish' | 'bearish' | 'neutral' {
  const highs = swings.filter(s => s.type === 'high').slice(-3);
  const lows = swings.filter(s => s.type === 'low').slice(-3);
  if (highs.length < 2 || lows.length < 2) return 'neutral';

  const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
  const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;

  if (hh && hl) return 'bullish';
  if (lh && ll) return 'bearish';
  return 'neutral';
}

// --- Premium / Discount zone ---

export function detectZone(candles: Candle[], swings: SwingPoint[]): 'premium' | 'discount' | 'mid' {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  if (highs.length === 0 || lows.length === 0) return 'mid';

  const recentHigh = Math.max(...highs.slice(-5).map(s => s.price));
  const recentLow = Math.min(...lows.slice(-5).map(s => s.price));
  const range = recentHigh - recentLow;
  const price = candles[candles.length - 1]?.close;
  if (!price || range <= 0) return 'mid';

  const pos = (price - recentLow) / range;
  if (pos > 0.65) return 'premium';
  if (pos < 0.35) return 'discount';
  return 'mid';
}
