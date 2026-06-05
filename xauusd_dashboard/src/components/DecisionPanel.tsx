import { MarketAnalysis, Scenario, TradePlan } from '../types';

interface Props {
  analysis: MarketAnalysis | null;
}

const RISK_RULES = [
  '单笔风险不超过账户 1%',
  '不允许无止损，不允许满仓',
  '没到关键位置不进场',
  '没有确认信号不进场',
  '方向冲突时降低仓位或观望',
  '重要数据公布前后谨慎交易',
];

export function DecisionPanel({ analysis }: Props) {
  if (!analysis) {
    return (
      <aside className="space-y-3">
        <DecisionCard analysis={null} />
        <RiskBlock />
      </aside>
    );
  }

  if (analysis.analysisSource !== 'gemini') {
    return (
      <aside className="space-y-3">
        <section className="bg-surface-card border border-warn/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-warn mb-3">交易决策</h3>
          <div className="text-lg font-bold mb-2 text-warn">等待 Gemini 分析</div>
          <p className="text-sm text-text-secondary leading-relaxed">
            当前只展示 Twelve Data 行情和本地基础结构，不生成交易建议、路径计划或 Entry / SL / TP。
          </p>
        </section>
        <KeyLevelsCard analysis={analysis} />
        <RiskBlock />
      </aside>
    );
  }

  return (
    <aside className="space-y-3">
      <DecisionCard analysis={analysis} />
      <KeyLevelsCard analysis={analysis} />
      <RiskBlock />
    </aside>
  );
}

export function ScenariosPanel({ scenarios }: { scenarios: Scenario[] }) {
  return (
    <section className="bg-surface-card border border-surface-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gold mb-3">高概率路径</h3>
      <div className="space-y-3">
        {scenarios.map((scenario) => (
          <ScenarioCard key={scenario.label} scenario={scenario} />
        ))}
      </div>
    </section>
  );
}

export function TradePlansPanel({ plans }: { plans: TradePlan[] }) {
  return (
    <section className="bg-surface-card border border-gold/20 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gold mb-3">交易计划卡片</h3>
      <div className="space-y-3">
        {plans.map((plan) => (
          <TradePlanCard key={plan.name} plan={plan} />
        ))}
      </div>
    </section>
  );
}

export function AwaitingGeminiPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="bg-surface-card border border-warn/25 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-warn mb-3">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
      <div className="mt-3 rounded-md border border-surface-border bg-[#0d131d] px-3 py-2 text-xs text-text-muted">
        行情数据来自 Twelve Data；该模块必须等 Gemini 返回后才填充，避免把基础规则误当作交易建议。
      </div>
    </section>
  );
}

function DecisionCard({ analysis }: { analysis: MarketAnalysis | null }) {
  if (!analysis) {
    return (
      <section className="bg-surface-card border border-bear/30 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-bear mb-3">交易决策</h3>
        <div className="text-lg font-bold mb-2 text-bear">暂停分析，等待真实行情</div>
        <p className="text-sm text-text-secondary leading-relaxed">
          当前没有可用的 Twelve Data XAU/USD K线，系统不会使用模拟数据生成方向判断。
        </p>
      </section>
    );
  }

  return (
    <section className="bg-surface-card border border-gold/30 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gold">当前交易决策</h3>
          <div className={`text-lg font-bold mt-1 ${analysis.bias === 'bullish' ? 'text-bull' : analysis.bias === 'bearish' ? 'text-bear' : 'text-warn'}`}>
            {analysis.decision}
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-bold ${
          analysis.riskLevel === 'high' ? 'bg-bear/20 text-bear' : analysis.riskLevel === 'medium' ? 'bg-warn/20 text-warn' : 'bg-bull/20 text-bull'
        }`}>
          风险 {analysis.riskLevel === 'high' ? '高' : analysis.riskLevel === 'medium' ? '中' : '低'}
        </span>
      </div>
      <div className="space-y-2 text-sm">
        <TextRow label="主要原因" value={analysis.reason} />
        <TextRow label="触发条件" value={analysis.trigger} />
        <TextRow label="失效条件" value={analysis.invalidation} />
      </div>
    </section>
  );
}

export function KeyLevelsCard({ analysis }: { analysis: MarketAnalysis }) {
  const aiLevels = analysis.aiAnalysis?.key_levels_and_liquidity;
  if (aiLevels) {
    const rows = [
      ['高位拒绝区', aiLevels.high_rejection_zone, 'text-bear'],
      ['关键压力区', aiLevels.key_resistance_zone, 'text-bear'],
      ['短线反抽压力', aiLevels.short_term_pressure, 'text-warn'],
      ['关键支撑区', aiLevels.key_support_zone, 'text-bull'],
      ['Buy Side Liquidity', aiLevels.buy_side_liquidity, 'text-warn'],
      ['Sell Side Liquidity', aiLevels.sell_side_liquidity, 'text-[#60a5fa]'],
      ['Stop Hunt 区域', aiLevels.stop_hunt_area, 'text-purple-300'],
      ['最可能扫荡位置', aiLevels.most_likely_sweep, 'text-gold'],
    ];
    return (
      <section className="bg-surface-card border border-surface-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gold mb-3">关键价位与流动性</h3>
        <div className="space-y-2 text-sm">
          {rows.map(([label, value, color]) => (
            <TextLevelRow key={label} label={label} value={value} color={color} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-surface-card border border-surface-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gold mb-3">关键价位与流动性</h3>
      <div className="rounded-md border border-warn/25 bg-warn/5 p-3">
        <div className="text-sm font-bold text-warn mb-2">等待 Gemini 分析</div>
        <p className="text-xs text-text-secondary leading-relaxed">
          压力、支撑、流动性、FVG、扫盘和交易关键区属于分析层；Gemini 未返回前不展示本地规则结果。
        </p>
      </div>
    </section>
  );
}

function TextLevelRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-start gap-3 py-1.5 border-b border-surface-border last:border-0">
      <span className="text-text-muted text-xs shrink-0">{label}</span>
      <span className={`text-xs text-right leading-relaxed ${color}`}>{value || '不知道'}</span>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const color =
    scenario.probability === 'primary' ? '#22c55e' :
      scenario.probability === 'secondary' ? '#f59e0b' :
        scenario.probability === 'breakout' ? '#d4a853' : '#a855f7';
  return (
    <div className="rounded-md border border-surface-border bg-[#0d131d] p-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-sm font-bold text-text-primary">{scenario.label}</div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            scenario.canTrade ? 'bg-bull/15 text-bull' : 'bg-warn/15 text-warn'
          }`}>
            {scenario.canTrade ? '可等触发' : '条件观察'}
          </span>
          <div className="text-xs font-mono font-bold" style={{ color }}>{scenario.probabilityValue}%</div>
        </div>
      </div>
      <div className="space-y-1 text-xs text-text-secondary leading-relaxed">
        <div><span className="text-text-muted">方向：</span>{scenario.direction}</div>
        <div><span className="text-text-muted">RR：</span>{scenario.rr}</div>
        <div><span className="text-text-muted">触发：</span>{scenario.trigger}</div>
        <div><span className="text-text-muted">目标：</span>{scenario.target}</div>
        <div><span className="text-text-muted">应对：</span>{scenario.response}</div>
        <div><span className="text-text-muted">失效：</span>{scenario.invalidation}</div>
      </div>
    </div>
  );
}

function TradePlanCard({ plan }: { plan: TradePlan }) {
  const active = plan.status === 'ready';
  const directionColor = plan.direction === 'Long' ? 'text-bull' : plan.direction === 'Short' ? 'text-bear' : 'text-warn';
  return (
    <div className={`rounded-md border p-3 ${active ? 'border-gold/30 bg-[#0d131d]' : 'border-warn/25 bg-warn/5'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-bold text-text-primary">{plan.name}</div>
        <div className={`text-xs font-bold ${directionColor}`}>{plan.direction}</div>
      </div>
      <div className="text-[11px] text-text-muted mb-2">绑定路径：{plan.pathLabel}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <KV label="Entry" value={plan.entry} />
        <KV label="SL" value={plan.sl} />
        <KV label="TP1" value={plan.tp1} />
        <KV label="TP2" value={plan.tp2} />
        <KV label="TP3" value={plan.tp3} />
        <KV label="RR" value={plan.rr} />
        <KV label="胜率估计" value={plan.winRate} />
        <KV label="状态" value={active ? '可等待触发' : '等待确认'} />
      </div>
      <div className="mt-2 text-xs text-text-muted leading-relaxed">
        触发：{plan.trigger}
      </div>
      <div className="mt-1 text-xs text-text-muted leading-relaxed">
        失效：{plan.invalidation}
      </div>
    </div>
  );
}

function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-text-muted text-xs">{label}</span>
      <p className="text-text-secondary leading-relaxed">{value}</p>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-surface-border pb-1">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text-primary text-right">{value}</span>
    </div>
  );
}


function RiskBlock() {
  return (
    <section className="bg-surface-card border border-bear/25 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-bear mb-3">风险规则</h3>
      <ul className="space-y-1">
        {RISK_RULES.map((r) => (
          <li key={r} className="text-xs text-text-secondary flex items-start gap-1.5">
            <span className="text-bear mt-0.5">•</span>
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}
