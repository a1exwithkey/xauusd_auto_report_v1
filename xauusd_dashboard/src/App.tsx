import { useState } from 'react';
import { Candle, MarketAnalysis, DataStatus } from './types';
import { getCandles, dataSourceLabel } from './lib/mockData';
import { analyze } from './lib/strategy';
import { Header } from './components/Header';
import { ChartView } from './components/ChartView';
import { DecisionPanel } from './components/DecisionPanel';

const REFRESH_MS = 60 * 60 * 1000;

type DashboardData = {
  candles: Candle[];
  analysis: MarketAnalysis | null;
  error: string;
  sourceLabel: string;
};

function buildData(): DashboardData {
  const { candles, error } = getCandles();
  return {
    candles,
    analysis: candles.length > 0 ? analyze(candles) : null,
    error,
    sourceLabel: dataSourceLabel(),
  };
}

export default function App() {
  const [data] = useState(() => buildData());
  const [status] = useState<DataStatus>(data.error ? 'error' : 'fresh');
  const [lastRefresh] = useState(Date.now());
  const [nextRefresh] = useState(Date.now() + REFRESH_MS);
  const chartError = data.error;

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <Header
        analysis={data.analysis}
        status={chartError ? 'error' : status}
        lastRefresh={lastRefresh}
        nextRefresh={nextRefresh}
        dataSource={data.sourceLabel}
      />
      {(chartError || data.error) && (
        <div className="mx-auto max-w-[1600px] px-3 mb-3">
          <div className="bg-bear/10 border border-bear/30 rounded-md px-3 py-2 text-xs leading-relaxed" style={{ color: '#ef4444' }}>
            {chartError || data.error}
            <span className="ml-2 text-text-secondary">配置后点击右上角“刷新”。</span>
          </div>
        </div>
      )}
      <main className="px-3 pb-6 mx-auto max-w-[1600px] flex flex-col lg:flex-row gap-3">
        <div className="flex-1 min-w-0">
          <ChartView candles={data.candles} analysis={data.analysis} />
        </div>
        <div className="w-full lg:w-[420px] flex-shrink-0">
          <DecisionPanel analysis={data.analysis} />
        </div>
      </main>
      <footer className="text-center text-text-muted text-xs pb-6 px-4">
        以上内容仅为行情分析与交易计划辅助，不构成投资建议。交易有风险，入场必须等待价格到达关键区域并出现确认信号。
      </footer>
    </div>
  );
}
