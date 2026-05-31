import { Candle } from '../types';

type RealPayload = {
  ticker: string;
  data_source: string;
  candles: Candle[];
  rows: number;
  latest_close: number | null;
  latest_time: string;
  is_demo_data: boolean;
};

type CandleResult = {
  candles: Candle[];
  ticker: string;
  dataSource: string;
  error: string;
};

function getRealPayload(): RealPayload | null {
  try {
    const payload = (window as any).__XAUUSD_REAL_DATA__ as RealPayload | null;
    if (payload && Array.isArray(payload.candles) && payload.candles.length > 0) {
      return payload;
    }
  } catch (_) {
    return null;
  }
  return null;
}

export function dataError(): string {
  try {
    return String((window as any).__XAUUSD_DATA_ERROR__ || '');
  } catch (_) {
    return '';
  }
}

export function dataSourceLabel(): string {
  const payload = getRealPayload();
  if (!payload) return 'Twelve Data · 无实时行情';

  const parts = [`${payload.ticker} · ${payload.data_source}`];
  if (payload.latest_close) parts.push(payload.latest_close.toFixed(2));
  if (payload.rows) parts.push(`${payload.rows} 根5m K线`);
  return parts.join(' · ');
}

export function getCandles(): CandleResult {
  const payload = getRealPayload();
  if (!payload) {
    return {
      candles: [],
      ticker: 'XAU/USD',
      dataSource: 'Twelve Data',
      error: dataError() || '未获取到实时 XAUUSD 行情数据。',
    };
  }

  return {
    candles: payload.candles,
    ticker: payload.ticker,
    dataSource: payload.data_source,
    error: '',
  };
}
