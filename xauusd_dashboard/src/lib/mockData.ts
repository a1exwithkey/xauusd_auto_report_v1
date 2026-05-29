import { Candle } from '../types';

// --- Mock OHLC Generator ---
// Produces realistic price action with trending, ranging, and sweep phases.

const BASE_PRICE = 2650;
const BAR_5M = 300; // seconds

type Phase = 'trend_up' | 'trend_down' | 'range' | 'sweep_low_up' | 'sweep_high_down';

interface PhaseDef {
  type: Phase;
  bars: number;
}

function makePhases(): PhaseDef[] {
  return [
    { type: 'trend_up', bars: 120 },
    { type: 'range', bars: 80 },
    { type: 'sweep_low_up', bars: 40 },
    { type: 'trend_up', bars: 80 },
    { type: 'range', bars: 100 },
    { type: 'sweep_high_down', bars: 40 },
    { type: 'trend_down', bars: 70 },
    { type: 'range', bars: 70 },
  ];
}

export function generateCandles(count: number, startPrice?: number): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * BAR_5M;
  const candles: Candle[] = [];
  let price = startPrice ?? BASE_PRICE + (Math.random() - 0.5) * 60;

  const phases = makePhases();
  let phaseIdx = 0;
  let barsInPhase = 0;
  let phase = phases[0];

  // State for range boundaries
  let rangeHigh = price + 8;
  let rangeLow = price - 8;
  let trendSwingHigh = price;
  let trendSwingLow = price;

  for (let i = 0; i < count; i++) {
    // Phase management
    if (barsInPhase <= 0 && phaseIdx < phases.length) {
      phase = phases[phaseIdx];
      barsInPhase = phase.bars;
      phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
      if (phase.type === 'range' || phase.type.startsWith('sweep')) {
        rangeHigh = price + 6 + Math.random() * 8;
        rangeLow = price - 6 - Math.random() * 8;
      }
    }
    barsInPhase--;

    const vol = price * 0.0006;
    let drift = 0;

    switch (phase.type) {
      case 'trend_up':
        drift = vol * 0.4;
        trendSwingHigh = Math.max(trendSwingHigh, price);
        break;
      case 'trend_down':
        drift = -vol * 0.4;
        trendSwingLow = Math.min(trendSwingLow, price);
        break;
      case 'range':
        // Mean-revert toward mid
        drift = ((rangeHigh + rangeLow) / 2 - price) * 0.015;
        break;
      case 'sweep_low_up':
        if (barsInPhase > 20) drift = -vol * 0.6; // push down first
        else drift = vol * 0.5; // then rally up
        break;
      case 'sweep_high_down':
        if (barsInPhase > 20) drift = vol * 0.6; // push up first
        else drift = -vol * 0.5; // then drop
        break;
    }

    const noise = (Math.random() - 0.48) * vol * 1.6;
    const change = drift + noise;
    const open = price;
    price += change;
    const close = price;

    const barRange = vol * (0.6 + Math.random() * 1.2);
    const high = Math.max(open, close) + Math.random() * barRange * 0.4;
    const low = Math.min(open, close) - Math.random() * barRange * 0.4;

    // Clamp in range phases
    if (phase.type === 'range') {
      price = Math.max(rangeLow - 2, Math.min(rangeHigh + 2, price));
    }

    candles.push({
      time: (startTime + i * BAR_5M) as number,
      open: +open.toFixed(2),
      high: +Math.max(high, open, close).toFixed(2),
      low: +Math.min(low, open, close).toFixed(2),
      close: +close.toFixed(2),
      volume: Math.floor(80 + Math.random() * 300),
    });

    price = close;
  }

  return candles;
}
