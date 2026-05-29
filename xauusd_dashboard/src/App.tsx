import { useState, useCallback, useEffect } from 'react';
import { Candle, MarketAnalysis, DataStatus } from './types';
import { generateCandles } from './lib/mockData';
import { analyze } from './lib/strategy';
import { Header } from './components/Header';
import { ChartView } from './components/ChartView';
import { DecisionPanel } from './components/DecisionPanel';

const REFRESH_MS = 60 * 60 * 1000;
const CANDLE_COUNT = 580;

function buildData(): { candles: Candle[]; analysis: MarketAnalysis } {
  const candles = generateCandles(CANDLE_COUNT);
  const analysis = analyze(candles);
  return { candles, analysis };
}

export default function App() {
  const [data, setData] = useState(() => buildData());
  const [status, setStatus] = useState<DataStatus>('fresh');
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [nextRefresh, setNextRefresh] = useState(Date.now() + REFRESH_MS);
  const [chartError, setChartError] = useState('');

  const refresh = useCallback(() => {
    setStatus('refreshing');
    setTimeout(() => {
      try {
        setData(buildData());
        setStatus('fresh');
        setChartError('');
        setLastRefresh(Date.now());
        setNextRefresh(Date.now() + REFRESH_MS);
      } catch (e: any) {
        setStatus('error');
        setChartError(e?.message ?? 'Refresh failed');
      }
    }, 600);
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <Header
        analysis={data.analysis}
        status={chartError ? 'error' : status}
        lastRefresh={lastRefresh}
        nextRefresh={nextRefresh}
        onRefresh={refresh}
      />
      {chartError && (
        <div className="mx-auto max-w-[1600px] px-3 mb-3">
          <div className="bg-bear/10 border border-bear/30 rounded-lg p-3 text-sm" style={{ color: '#ef4444' }}>
            Error: {chartError}
            <button onClick={() => { setChartError(''); refresh(); }} className="ml-3 underline">Retry</button>
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
