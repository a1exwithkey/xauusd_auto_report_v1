export type Candle = {
  time: number; // UTCTimestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SwingPoint = {
  time: number;
  price: number;
  type: 'high' | 'low';
};

export type FVGZone = {
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
  type: 'bullish' | 'bearish';
};

export type LiquidityLevel = {
  price: number;
  type: 'buy_side' | 'sell_side';
  source: 'equal_highs' | 'equal_lows' | 'prior_high' | 'prior_low' | 'day_high' | 'day_low';
  touches: number;
};

export type MarketState =
  | 'trending_up'
  | 'trending_down'
  | 'ranging'
  | 'structure_shift'
  | 'sweeping_liquidity'
  | 'pullback'
  | 'waiting';

export type Bias = 'bullish' | 'bearish' | 'neutral';

export type Confidence = 'high' | 'medium' | 'low';

export type DataSource = 'mock' | 'api' | 'manual';

export type DataStatus = 'fresh' | 'refreshing' | 'stale' | 'error';

export type TimeframeKey = '5m' | '15m' | '1h' | '4h';

export type TimeframeCandles = Partial<Record<TimeframeKey, Candle[]>>;

export type ProbabilitySet = {
  bearish: number;
  bullish: number;
  range: number;
  reversal: number;
};

export type TimeframeStructure = {
  timeframe: TimeframeKey;
  label: string;
  structure: '上涨' | '下跌' | '震荡' | '等待确认';
  trend: Bias;
  bos: string;
  choch: string;
  resistance: number | null;
  support: number | null;
  summary: string;
};

export type TradePlan = {
  name: string;
  direction: 'Long' | 'Short' | 'Wait';
  entry: string;
  sl: string;
  tp1: string;
  tp2: string;
  tp3: string;
  rr: string;
  winRate: string;
  invalidation: string;
  status: 'ready' | 'waiting';
};

export type MarketAnalysis = {
  currentPrice: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  bias: Bias;
  confidence: Confidence;
  state: MarketState;
  trend1H: Bias;
  trend4H: Bias;
  trend15M: Bias;
  bestOpportunity: string;
  marketBiasText: string;
  tradeSuitability: string;
  probabilities: ProbabilitySet;
  timeframeStructures: TimeframeStructure[];
  bos: string;
  choch: string;
  priceZone: 'premium' | 'discount' | 'mid';
  tradeable: boolean;
  swings: SwingPoint[];
  fvgZones: FVGZone[];
  liquidity: LiquidityLevel[];
  support: number | null;
  resistance: number | null;
  decision: string;
  reason: string;
  trigger: string;
  invalidation: string;
  riskLevel: 'low' | 'medium' | 'high';
  scenarios: Scenario[];
  tradePlans: TradePlan[];
  finalConclusion: string;
  futureOutlook: string[];
  riskNotes: string[];
};

export type Scenario = {
  label: string;
  probability: 'primary' | 'secondary' | 'breakout' | 'extreme';
  probabilityValue: number;
  trigger: string;
  target: string;
  response: string;
  invalidation: string;
};
