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
  analysis: MarketAnalysis | null;
}

const CHART_HEIGHT = 660;
const DESKTOP_VISIBLE_BARS = 70;
const MOBILE_VISIBLE_BARS = 38;
const RANGE_OPTIONS = [40, 70, 120] as const;
type RangeOption = typeof RANGE_OPTIONS[number];

export function ChartView({ candles, analysis }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showEMA610, setShowEMA610] = useState(false);
  const [showSwings, setShowSwings] = useState(false);
  const [showLiquidity, setShowLiquidity] = useState(true);
  const [showFVG, setShowFVG] = useState(true);
  const [rangeBars, setRangeBars] = useState<RangeOption>(40);

  // Defer chart init by one tick so the container has width
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!containerRef.current || candles.length === 0) return;
    if (!analysis) return;

    const container = containerRef.current;
    const w = Math.max(container.clientWidth, 400);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const lastPriceColor = prev && last.close >= prev.close ? '#22c55e' : '#ef4444';
    const visibleBars = w < 700 ? Math.min(rangeBars, MOBILE_VISIBLE_BARS) : rangeBars;
    const visibleFrom = Math.max(0, candles.length - visibleBars);
    const visibleStartTime = candles[visibleFrom]?.time ?? 0;
    const visibleCandles = candles.slice(visibleFrom);
    const visibleHigh = Math.max(...visibleCandles.map(c => c.high));
    const visibleLow = Math.min(...visibleCandles.map(c => c.low));
    const visibleRange = Math.max(visibleHigh - visibleLow, last.close * 0.0002, 0.9);
    const paddedMax = visibleHigh + visibleRange * 0.35;
    const paddedMin = visibleLow - visibleRange * 0.35;

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
        vertLines: { color: 'rgba(42,51,71,0.55)' },
        horzLines: { color: 'rgba(42,51,71,0.55)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        priceFormatter: (price: number) => price.toFixed(2),
      },
      timeScale: {
        borderColor: '#1a2030',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: w < 700 ? 16 : 12,
        minBarSpacing: 8,
      },
      rightPriceScale: {
        borderColor: '#1a2030',
        autoScale: true,
        entireTextOnly: true,
        minimumWidth: 116,
        scaleMargins: { top: 0.24, bottom: 0.24 },
      },
      width: w,
      height: CHART_HEIGHT,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: 'rgba(34,197,94,0.08)', downColor: 'rgba(239,68,68,0.72)',
      borderUpColor: '#2dd47a', borderDownColor: '#f87171',
      wickUpColor: 'rgba(45,212,122,0.72)', wickDownColor: 'rgba(248,113,113,0.72)',
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    // biome-ignore lint: Time type cast
    candleSeries.setData(
      (candles as any[]).map(c => ({
        time: c.time as any,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }))
    );

    candleSeries.createPriceLine({
      price: last.close,
      color: lastPriceColor,
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: 'Last',
    });

    // EMAs & VWAP
    const ema20 = calcEMA(candles, 20);
    const ema50 = calcEMA(candles, 50);
    const ema200 = calcEMA(candles, 200);

    for (const [data, color, width] of [
      [ema20, '#a855f7', 2],
      [ema50, '#eab308', 2],
      [ema200, '#ef4444', 1],
    ] as const) {
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: width as 1 | 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      s.setData(data.map((v, i) => v != null ? { time: candles[i].time as any, value: v } : null).filter(Boolean) as any[]);
    }

    if (showVWAP) {
      const vwap = calcVWAP(candles);
      const s = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      s.setData(vwap.map((v, i) => v != null ? { time: candles[i].time as any, value: v } : null).filter(Boolean) as any[]);
    }

    if (showEMA610) {
      const ema610 = calcEMA(candles, 610);
      const s = chart.addSeries(LineSeries, {
        color: '#ef4444',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      if (ema610.some(v => v != null)) {
        s.setData(ema610.map((v, i) => v != null ? { time: candles[i].time as any, value: v } : null).filter(Boolean) as any[]);
      }
    }

    // Swing markers
    if (showSwings) {
      createSeriesMarkers(candleSeries,
        analysis.swings.filter(s => s.time >= visibleStartTime).slice(-10).map(s => ({
          time: s.time as any,
          position: (s.type === 'high' ? 'aboveBar' : 'belowBar') as any,
          color: s.type === 'high' ? '#ef4444' : '#22c55e',
          shape: (s.type === 'high' ? 'arrowDown' : 'arrowUp') as any,
          text: s.type === 'high' ? 'H' : 'L',
          size: 2,
        }))
      );
    }

    // Support / Resistance
    if (analysis.support) {
      candleSeries.createPriceLine({
        price: analysis.support, color: 'rgba(34,197,94,0.85)', lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: '关键支撑',
      });
    }
    if (analysis.resistance) {
      candleSeries.createPriceLine({
        price: analysis.resistance, color: 'rgba(239,68,68,0.85)', lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: '关键压力',
      });
    }

    // Liquidity lines
    if (showLiquidity) {
      for (const liq of analysis.liquidity.slice(0, 3)) {
        candleSeries.createPriceLine({
          price: liq.price,
          color: liq.type === 'buy_side' ? 'rgba(245,158,11,0.72)' : 'rgba(59,130,246,0.72)',
          lineWidth: 1, lineStyle: 1, axisLabelVisible: false,
          title: liq.type === 'buy_side' ? 'BSL' : 'SSL',
        });
      }
    }

    // FVG lines
    if (showFVG) {
      for (const fvg of analysis.fvgZones.slice(-3)) {
        const clr = fvg.type === 'bullish' ? 'rgba(34,197,94,0.42)' : 'rgba(239,68,68,0.42)';
        const label = fvg.type === 'bullish' ? 'Bull FVG' : 'Bear FVG';
        candleSeries.createPriceLine({ price: fvg.top, color: clr, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: label });
        candleSeries.createPriceLine({ price: fvg.bottom, color: clr, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });
      }
    }

    candleSeries.priceScale().setAutoScale(false);
    candleSeries.priceScale().setVisibleRange({ from: paddedMin, to: paddedMax });

    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, candles.length - visibleBars),
      to: candles.length + 8,
    });
    chartRef.current = chart;

    const onResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [mounted, candles, analysis, rangeBars, showEMA610, showFVG, showLiquidity, showSwings, showVWAP]);

  return (
    <section className="bg-surface-card border border-gold/25 rounded-lg shadow-[0_0_28px_rgba(0,0,0,.24)]" style={{ width: '100%', overflow: 'visible' }}>
      <div className="px-4 py-2 border-b border-gold/15 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <div className="flex items-center gap-3 min-w-fit">
          <span className="font-semibold text-gold text-sm">XAUUSD · 5M 执行主图</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#a855f7' }} /> EMA20
            <span className="w-2 h-2 rounded-full ml-2" style={{ background: '#eab308' }} /> EMA50
            <span className="w-2 h-2 rounded-full ml-2" style={{ background: '#ef4444' }} /> EMA200
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1 rounded-md bg-[#0d131d] border border-surface-border p-0.5">
            {RANGE_OPTIONS.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setRangeBars(option)}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  rangeBars === option ? 'bg-gold/20 text-gold' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <ToggleButton label="VWAP" active={showVWAP} onClick={() => setShowVWAP(v => !v)} />
          <ToggleButton label="EMA610" active={showEMA610} onClick={() => setShowEMA610(v => !v)} />
          <ToggleButton label="Swing" active={showSwings} onClick={() => setShowSwings(v => !v)} />
          <ToggleButton label="Liquidity" active={showLiquidity} onClick={() => setShowLiquidity(v => !v)} />
          <ToggleButton label="FVG" active={showFVG} onClick={() => setShowFVG(v => !v)} />
        </div>
      </div>
      {!mounted ? (
        <div className="flex items-center justify-center text-text-muted text-sm" style={{ height: CHART_HEIGHT }}>
          Loading chart...
        </div>
      ) : candles.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center px-6" style={{ height: CHART_HEIGHT }}>
          <div className="text-bear font-semibold mb-2">无实时 XAUUSD K线数据</div>
          <div className="text-text-muted text-sm max-w-xl">
            当前不会使用模拟行情，也不会生成结构判断。请配置 Twelve Data API Key 后刷新页面。
          </div>
        </div>
      ) : (
        <div ref={containerRef} style={{ width: '100%', height: CHART_HEIGHT }} />
      )}
    </section>
  );
}

function ToggleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
        active
          ? 'border-gold/60 bg-gold/15 text-gold'
          : 'border-surface-border bg-[#0d131d] text-text-muted hover:text-text-primary hover:border-text-muted/40'
      }`}
    >
      {label}
    </button>
  );
}
