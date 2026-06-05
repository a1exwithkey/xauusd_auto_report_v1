import { useState, type ReactNode } from 'react';
import { Candle, MarketAnalysis, DataStatus, TimeframeCandles, TimeframeStructure } from './types';
import { getAiAnalysis, getCandles, dataSourceLabel } from './lib/mockData';
import { analyze } from './lib/strategy';
import { adaptAiAnalysis } from './lib/aiAdapter';
import { Header } from './components/Header';
import { ChartView } from './components/ChartView';
import { AwaitingGeminiPanel, DecisionPanel, ScenariosPanel, TradePlansPanel } from './components/DecisionPanel';

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
  const baseAnalysis = candles.length > 0 ? analyze(candles, timeframes) : null;
  const ai = getAiAnalysis();
  const analysis = ai.analysis && candles.length > 0
    ? adaptAiAnalysis(ai.analysis, baseAnalysis, candles, ai.error)
    : baseAnalysis ? { ...baseAnalysis, aiError: ai.error, analysisSource: 'local' as const } : null;
  return {
    candles,
    timeframes,
    analysis,
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
  const hasGeminiAnalysis = data.analysis?.analysisSource === 'gemini';

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
      {data.analysis?.analysisSource === 'local' && data.analysis.aiError && (
        <div className="mx-auto max-w-[1600px] px-3 mb-3">
          <div className="bg-warn/10 border border-warn/30 rounded-md px-3 py-2 text-xs text-warn">
            Gemini 分析暂不可用：{data.analysis.aiError} 当前仅显示 Twelve Data 行情和基础技术指标，不生成结构判断或交易建议。
          </div>
        </div>
      )}
      <main className="px-3 pb-6 mx-auto max-w-[1600px] space-y-3">
        <MarketOverview analysis={data.analysis} />

        <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_320px] gap-3 items-start">
          <div className="space-y-3">
            <ProbabilityPanel analysis={data.analysis} />
            <TimeframePanel items={data.analysis?.timeframeStructures ?? []} enabled={hasGeminiAnalysis} />
          </div>
          <div className="min-w-0">
            <ChartView candles={data.candles} analysis={data.analysis} />
          </div>
          <DecisionPanel analysis={data.analysis} />
        </div>

        {data.analysis && hasGeminiAnalysis && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ScenariosPanel scenarios={data.analysis.scenarios} />
            <TradePlansPanel plans={data.analysis.tradePlans} />
          </div>
        )}
        {data.analysis && !hasGeminiAnalysis && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <AwaitingGeminiPanel
              title="高概率路径"
              description="Gemini 未返回前不生成主路径、备选路径或极端路径，避免基础技术计算和 AI 判断混在一起。"
            />
            <AwaitingGeminiPanel
              title="交易计划卡片"
              description="没有 Gemini 结构判断时，不输出 Entry / SL / TP / RR。当前只保留行情事实和基础技术展示。"
            />
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
  const ai = analysis?.aiAnalysis;
  const levels = ai?.key_levels_and_liquidity;
  const hasGeminiAnalysis = analysis?.analysisSource === 'gemini';
  const items = [
    ['当前价格', analysis ? analysis.currentPrice.toFixed(2) : '--'],
    ['价格变化', ai?.market_overview.price_change ?? (analysis ? `${analysis.changePercent >= 0 ? '+' : ''}${analysis.changePercent.toFixed(2)}%` : '--')],
    ['市场偏向', hasGeminiAnalysis ? ai?.market_overview.market_bias ?? '等待 Gemini 分析' : '等待 Gemini 分析'],
    ['当前最佳机会', hasGeminiAnalysis ? ai?.market_overview.best_opportunity ?? '等待 Gemini 分析' : '等待 Gemini 分析'],
    ['关键压力区', hasGeminiAnalysis ? levels?.key_resistance_zone ?? '等待确认' : '等待 Gemini 分析'],
    ['关键支撑区', hasGeminiAnalysis ? levels?.key_support_zone ?? '等待确认' : '等待 Gemini 分析'],
    ['是否适合交易', hasGeminiAnalysis ? ai?.market_overview.trade_suitability ?? '等待 Gemini 分析' : '等待 Gemini 分析'],
    ['当前主路径', hasGeminiAnalysis ? analysis?.scenarios[0]?.label ?? '等待路径' : '等待 Gemini 分析'],
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
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
  const hasGeminiAnalysis = analysis?.analysisSource === 'gemini';
  const p = hasGeminiAnalysis ? analysis?.probabilities ?? { bearish: 0, bullish: 0, range: 0, reversal: 0 } : { bearish: 0, bullish: 0, range: 0, reversal: 0 };
  const bullEnd = p.bullish;
  const bearEnd = bullEnd + p.bearish;
  const rangeEnd = bearEnd + p.range;
  const pieStyle = {
    background: `conic-gradient(#22c55e 0 ${bullEnd}%, #ef4444 ${bullEnd}% ${bearEnd}%, #f59e0b ${bearEnd}% ${rangeEnd}%, #a855f7 ${rangeEnd}% 100%)`,
  };
  const rows = [
    ['多头概率', p.bullish, 'bg-bull', 'text-bull'],
    ['空头概率', p.bearish, 'bg-bear', 'text-bear'],
    ['震荡概率', p.range, 'bg-warn', 'text-warn'],
    ['极端反转概率', p.reversal, 'bg-purple-500', 'text-purple-300'],
  ] as const;
  return (
    <section className="bg-surface-card border border-gold/25 rounded-lg p-4">
      <h3 className="text-sm font-bold text-gold mb-3">结构概率分布</h3>
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-28 h-28 rounded-full shrink-0 border border-gold/25" style={pieStyle}>
          <div className="absolute inset-[18px] rounded-full bg-surface-card border border-surface-border flex flex-col items-center justify-center">
            <span className="text-[10px] text-text-muted">主概率</span>
            <span className="text-lg font-mono font-bold text-gold">
              {Math.max(p.bullish, p.bearish, p.range, p.reversal)}%
            </span>
          </div>
        </div>
        <div className="text-xs text-text-secondary leading-relaxed">
          {hasGeminiAnalysis
            ? '饼图展示 Gemini 结构概率，不是胜率承诺。最大块必须能解释路径 A；若震荡最大，系统应降级为等待或区间路径。'
            : '等待 Gemini 返回结构概率。当前不使用本地规则生成多空倾向。'}
        </div>
      </div>
      <div className="space-y-2">
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
        {analysis?.aiAnalysis?.probability_view.explanation ?? 'Gemini 未返回前，不展示结构概率、路径概率或交易倾向。'}
      </p>
    </section>
  );
}

function TimeframePanel({ items, enabled }: { items: TimeframeStructure[]; enabled: boolean }) {
  const display = items.length ? items : [];
  return (
    <section className="bg-surface-card border border-surface-border rounded-lg p-4">
      <h3 className="text-sm font-bold text-gold mb-3">多周期结构</h3>
      <div className="space-y-3">
        {!enabled ? (
          <div className="rounded-md border border-warn/25 bg-warn/5 p-3">
            <div className="text-sm font-bold text-warn mb-2">等待 Gemini 分析</div>
            <p className="text-xs text-text-secondary leading-relaxed">
              4H / 1H / 15M / 5M 结构判断属于分析层；Gemini 未返回前不展示本地规则结构，避免和 AI 结论混在一起。
            </p>
          </div>
        ) : display.length === 0 ? (
          <div className="text-sm text-text-muted">等待 Gemini 返回多周期结构。</div>
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
              <span>压力：{item.resistanceText || item.resistance?.toFixed(2) || '待确认'}</span>
              <span>支撑：{item.supportText || item.support?.toFixed(2) || '待确认'}</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed mt-2">{item.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BottomReport({ analysis }: { analysis: MarketAnalysis | null }) {
  const hasGeminiAnalysis = analysis?.analysisSource === 'gemini';
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <ReportBlock title="风控与失效条件" accent="text-bear">
        {((hasGeminiAnalysis ? analysis?.riskNotes : ['Gemini 未返回前，不生成路径失效条件；只保留通用风控。', '禁止把基础技术计算当作入场建议。']) ?? ['等待真实行情后生成风控条件。']).map(note => (
          <li key={note}>{note}</li>
        ))}
      </ReportBlock>
      <ReportBlock title="未来走势推演" accent="text-gold">
        {((hasGeminiAnalysis ? analysis?.futureOutlook : ['等待 Gemini 基于多周期行情生成路径推演。']) ?? ['等待多周期结构形成后生成推演。']).map(note => (
          <li key={note}>{note}</li>
        ))}
      </ReportBlock>
      <div className="bg-surface-card border border-gold/25 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gold mb-3">最终结论</h3>
        <p className="text-sm text-text-secondary leading-relaxed">
          {hasGeminiAnalysis ? analysis?.finalConclusion ?? '暂无实时行情，无法生成结论。' : '当前只确认行情数据已加载；Gemini 分析未返回，不输出交易方向、最佳机会或入场结论。'}
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
