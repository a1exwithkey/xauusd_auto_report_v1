import { useState, type ReactNode } from 'react';
import { Candle, MarketAnalysis, DataStatus, TimeframeCandles, TimeframeStructure } from './types';
import { getCandles, dataSourceLabel } from './lib/mockData';
import { analyze } from './lib/strategy';
import { Header } from './components/Header';
import { ChartView } from './components/ChartView';
import { DecisionPanel, ScenariosPanel, TradePlansPanel } from './components/DecisionPanel';

const REFRESH_MS = 60 * 60 * 1000;

type DashboardData = {
  candles: Candle[];
  timeframes: TimeframeCandles;
  analysis: MarketAnalysis | null;
  error: string;
  partialErrors: string[];
  sourceLabel: string;
};

function buildData(): DashboardData {
  const { candles, timeframes, error, partialErrors } = getCandles();
  return {
    candles,
    timeframes,
    analysis: candles.length > 0 ? analyze(candles, timeframes) : null,
    error,
    partialErrors,
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
      {data.partialErrors.length > 0 && (
        <div className="mx-auto max-w-[1600px] px-3 mb-3">
          <div className="bg-warn/10 border border-warn/30 rounded-md px-3 py-2 text-xs text-warn">
            部分周期数据暂不可用：{data.partialErrors.slice(0, 2).join('；')}
          </div>
        </div>
      )}
      <main className="px-3 pb-6 mx-auto max-w-[1600px] space-y-3">
        <MarketOverview analysis={data.analysis} />

        <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_320px] gap-3 items-start">
          <div className="space-y-3">
            <ProbabilityPanel analysis={data.analysis} />
            <TimeframePanel items={data.analysis?.timeframeStructures ?? []} />
          </div>
          <div className="min-w-0">
            <ChartView candles={data.candles} analysis={data.analysis} />
          </div>
          <DecisionPanel analysis={data.analysis} />
        </div>

        {data.analysis && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ScenariosPanel scenarios={data.analysis.scenarios} />
            <TradePlansPanel plans={data.analysis.tradePlans} />
          </div>
        )}

        <BottomReport analysis={data.analysis} />
      </main>
      <footer className="text-center text-text-muted text-xs pb-6 px-4">
        以上内容仅为行情分析与交易计划辅助，不构成投资建议。交易有风险，入场必须等待价格到达关键区域并出现确认信号。
      </footer>
    </div>
  );
}

function MarketOverview({ analysis }: { analysis: MarketAnalysis | null }) {
  const items = [
    ['当前价格', analysis ? analysis.currentPrice.toFixed(2) : '--'],
    ['市场偏向', analysis?.marketBiasText ?? '等待行情'],
    ['当前最佳机会', analysis?.bestOpportunity ?? '等待真实行情'],
    ['关键压力位', analysis?.resistance?.toFixed(2) ?? '等待确认'],
    ['关键支撑位', analysis?.support?.toFixed(2) ?? '等待确认'],
    ['是否适合交易', analysis?.tradeSuitability ?? '暂停分析'],
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="bg-surface-card border border-gold/20 rounded-lg px-3 py-3 shadow-[0_0_18px_rgba(0,0,0,.18)]">
          <div className="text-[11px] text-text-muted mb-1">{label}</div>
          <div className="text-sm font-semibold text-text-primary truncate">{value}</div>
        </div>
      ))}
    </section>
  );
}

function ProbabilityPanel({ analysis }: { analysis: MarketAnalysis | null }) {
  const p = analysis?.probabilities ?? { bearish: 0, bullish: 0, range: 0, reversal: 0 };
  const rows = [
    ['空头概率', p.bearish, 'bg-bear', 'text-bear'],
    ['多头概率', p.bullish, 'bg-bull', 'text-bull'],
    ['震荡概率', p.range, 'bg-warn', 'text-warn'],
    ['极端反转概率', p.reversal, 'bg-purple-500', 'text-purple-300'],
  ] as const;
  return (
    <section className="bg-surface-card border border-gold/25 rounded-lg p-4">
      <h3 className="text-sm font-bold text-gold mb-3">多空结构倾向</h3>
      <div className="space-y-3">
        {rows.map(([label, value, bar, text]) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">{label}</span>
              <span className={`font-mono font-bold ${text}`}>{value}%</span>
            </div>
            <div className="h-2 bg-[#0d131d] rounded-full overflow-hidden border border-surface-border">
              <div className={`h-full ${bar}`} style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
        概率由结构方向、流动性位置、EMA/VWAP、FVG、蜡烛动能和RSI规则评分归一化得出，不代表胜率保证。
      </p>
    </section>
  );
}

function TimeframePanel({ items }: { items: TimeframeStructure[] }) {
  const display = items.length ? items : [];
  return (
    <section className="bg-surface-card border border-surface-border rounded-lg p-4">
      <h3 className="text-sm font-bold text-gold mb-3">多周期结构</h3>
      <div className="space-y-3">
        {display.length === 0 ? (
          <div className="text-sm text-text-muted">等待多周期行情数据。</div>
        ) : display.map(item => (
          <div key={item.timeframe} className="rounded-md border border-surface-border bg-[#0d131d] p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-bold text-text-primary">{item.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                item.structure === '上涨' ? 'bg-bull/15 text-bull' : item.structure === '下跌' ? 'bg-bear/15 text-bear' : 'bg-warn/15 text-warn'
              }`}>{item.structure}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-text-secondary">
              <span>BOS：{item.bos === 'none' ? '无' : item.bos}</span>
              <span>CHoCH：{item.choch === 'none' ? '无' : item.choch}</span>
              <span>压力：{item.resistance?.toFixed(2) ?? '待确认'}</span>
              <span>支撑：{item.support?.toFixed(2) ?? '待确认'}</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed mt-2">{item.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BottomReport({ analysis }: { analysis: MarketAnalysis | null }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <ReportBlock title="风控与失效条件" accent="text-bear">
        {(analysis?.riskNotes ?? ['等待真实行情后生成风控条件。']).map(note => (
          <li key={note}>{note}</li>
        ))}
      </ReportBlock>
      <ReportBlock title="未来走势推演" accent="text-gold">
        {(analysis?.futureOutlook ?? ['等待多周期结构形成后生成推演。']).map(note => (
          <li key={note}>{note}</li>
        ))}
      </ReportBlock>
      <div className="bg-surface-card border border-gold/25 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gold mb-3">最终结论</h3>
        <p className="text-sm text-text-secondary leading-relaxed">
          {analysis?.finalConclusion ?? '暂无实时行情，无法生成结论。'}
        </p>
      </div>
    </section>
  );
}

function ReportBlock({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4">
      <h3 className={`text-sm font-bold mb-3 ${accent}`}>{title}</h3>
      <ul className="space-y-2 text-sm text-text-secondary leading-relaxed list-disc pl-4">
        {children}
      </ul>
    </div>
  );
}
