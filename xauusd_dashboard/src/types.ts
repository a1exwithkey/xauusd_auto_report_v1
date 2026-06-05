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
  resistanceText?: string;
  supportText?: string;
  summary: string;
};

export type TradePlan = {
  name: string;
  pathLabel: string;
  direction: 'Long' | 'Short' | 'Wait';
  entry: string;
  sl: string;
  tp1: string;
  tp2: string;
  tp3: string;
  rr: string;
  winRate: string;
  trigger: string;
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
  aiAnalysis?: AIAnalysisJSON;
  aiError?: string;
  analysisSource?: 'gemini' | 'local';
};

export type Scenario = {
  label: string;
  probability: 'primary' | 'secondary' | 'breakout' | 'extreme';
  probabilityValue: number;
  direction: 'Long' | 'Short' | 'Range' | 'Wait';
  rr: string;
  trigger: string;
  target: string;
  response: string;
  invalidation: string;
  canTrade: boolean;
};

export type AIAnalysisJSON = {
  _meta?: {
    model?: string;
    generated_at?: string;
    source?: string;
  };
  market_overview: {
    current_price: number | null;
    price_change: string;
    market_bias: string;
    best_opportunity: string;
    trade_suitability: string;
    summary: string;
  };
  multi_timeframe_structure: Array<{
    timeframe: string;
    trend: string;
    key_support: string;
    key_resistance: string;
    structure_notes: string;
    conclusion: string;
  }>;
  key_levels_and_liquidity: {
    high_rejection_zone: string;
    key_resistance_zone: string;
    short_term_pressure: string;
    key_support_zone: string;
    buy_side_liquidity: string;
    sell_side_liquidity: string;
    stop_hunt_area: string;
    most_likely_sweep: string;
  };
  probability_view: {
    bullish_probability: number | null;
    bearish_probability: number | null;
    range_probability: number | null;
    reversal_probability: number | null;
    explanation: string;
  };
  scenarios: Array<{
    path: string;
    name: string;
    probability: number | null;
    direction: string;
    trigger: string;
    target: string;
    invalidation: string;
    response: string;
  }>;
  trade_plans: Array<{
    linked_path: string;
    direction: string;
    entry: string;
    sl: string;
    tp1: string;
    tp2: string;
    tp3: string;
    rr: string;
    confidence: string;
    invalidation: string;
    note: string;
  }>;
  risk_control: {
    no_trade_conditions: string[];
    main_risks: string[];
    invalidation_summary: string;
  };
  final_conclusion: {
    main_direction: string;
    best_action_now: string;
    key_area_to_wait_for: string;
    dangerous_area: string;
    conclusion_text: string;
  };
};
