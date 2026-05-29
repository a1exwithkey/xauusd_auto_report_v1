import { useEffect, useRef, useState } from 'react';
import { Candle, MarketAnalysis } from '../types';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import { calcEMA, calcVWAP } from '../lib/indicators';

interface Props {
  candles: Candle[];
  analysis: MarketAnalysis;
}

export function ChartView({ candles, analysis }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [mounted, setMounted] = useState(false);

  // Defer chart init by one tick so the container has width
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!containerRef.current || candles.length === 0) return;

    const container = containerRef.current;
    const w = Math.max(container.clientWidth, 400);

    // Cleanup previous
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e14' },
        textColor: '#8895aa',
      },
      grid: {
        vertLines: { color: '#1a2030' },
        horzLines: { color: '#1a2030' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#1a2030', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#1a2030', autoScale: true },
      width: w,
      height: 560,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });

    // biome-ignore lint: Time type cast
    candleSeries.setData(
      (candles as any[]).map(c => ({
        time: c.time as any,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }))
    );

    // EMAs & VWAP
    const ema20 = calcEMA(candles, 20);
    const ema50 = calcEMA(candles, 50);
    const ema610 = calcEMA(candles, 610);
    const vwap = calcVWAP(candles);

    for (const [data, color] of [
      [ema20, '#a855f7'],
      [ema50, '#eab308'],
      [vwap, '#3b82f6'],
    ] as const) {
      const s = chart.addSeries(LineSeries, { color, priceLineVisible: false, lastValueVisible: true });
      s.setData(data.map((v, i) => v != null ? { time: candles[i].time as any, value: v } : null).filter(Boolean) as any[]);
    }

    if (ema610.some(v => v != null)) {
      const s = chart.addSeries(LineSeries, { color: '#ef4444', priceLineVisible: false, lastValueVisible: true });
      s.setData(ema610.map((v, i) => v != null ? { time: candles[i].time as any, value: v } : null).filter(Boolean) as any[]);
    }

    // Swing markers
    createSeriesMarkers(candleSeries,
      analysis.swings.slice(-20).map(s => ({
        time: s.time as any,
        position: (s.type === 'high' ? 'aboveBar' : 'belowBar') as any,
        color: s.type === 'high' ? '#ef4444' : '#22c55e',
        shape: (s.type === 'high' ? 'arrowDown' : 'arrowUp') as any,
        text: s.type === 'high' ? 'H' : 'L',
        size: 2,
      }))
    );

    // Support / Resistance
    if (analysis.support) {
      candleSeries.createPriceLine({
        price: analysis.support, color: '#22c55e', lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: 'Support',
      });
    }
    if (analysis.resistance) {
      candleSeries.createPriceLine({
        price: analysis.resistance, color: '#ef4444', lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: 'Resist',
      });
    }

    // Liquidity lines
    for (const liq of analysis.liquidity.slice(0, 6)) {
      candleSeries.createPriceLine({
        price: liq.price,
        color: liq.type === 'buy_side' ? '#f59e0b' : '#3b82f6',
        lineWidth: 1, lineStyle: 1, axisLabelVisible: false,
        title: liq.type === 'buy_side' ? 'BSL' : 'SSL',
      });
    }

    // FVG lines
    for (const fvg of analysis.fvgZones.slice(-4)) {
      const clr = fvg.type === 'bullish' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
      candleSeries.createPriceLine({ price: fvg.top, color: clr, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });
      candleSeries.createPriceLine({ price: fvg.bottom, color: clr, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const onResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [mounted, candles, analysis]);

  return (
    <section className="bg-surface-card border border-surface-border rounded-lg overflow-hidden" style={{ width: '100%' }}>
      <div className="px-4 py-2 border-b border-surface-border flex items-center gap-3 text-xs text-text-secondary">
        <span className="font-semibold text-text-primary text-sm">XAUUSD · 5m</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: '#a855f7' }} /> EMA20
          <span className="w-2 h-2 rounded-full ml-2" style={{ background: '#eab308' }} /> EMA50
          <span className="w-2 h-2 rounded-full ml-2" style={{ background: '#3b82f6' }} /> VWAP
          <span className="w-2 h-2 rounded-full ml-2" style={{ background: '#ef4444' }} /> EMA610
        </span>
        <span className="ml-auto text-text-muted hidden sm:inline">Swing · BSL/SSL · FVG</span>
      </div>
      {!mounted ? (
        <div className="flex items-center justify-center text-text-muted text-sm" style={{ height: 560 }}>
          Loading chart...
        </div>
      ) : (
        <div ref={containerRef} style={{ width: '100%', height: 560 }} />
      )}
    </section>
  );
}
