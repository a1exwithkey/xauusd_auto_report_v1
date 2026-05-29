import { MarketAnalysis } from '../types';

interface Props {
  analysis: MarketAnalysis;
}

const RISK_RULES = [
  '单笔风险不超过账户 1%',
  '不允许无止损入场',
  '没到关键位置不进场',
  '方向冲突时降低仓位',
  '连续亏损两笔后停止交易',
];

export function DecisionPanel({ analysis }: Props) {
  const a = analysis;

  return (
    <aside className="space-y-3 overflow-y-auto max-h-[calc(100vh-120px)]">
      {/* Decision Card */}
      <section className="bg-surface-card border border-surface-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gold mb-3">交易决策</h3>

        <div className={`text-lg font-bold mb-2 ${a.bias === 'bullish' ? 'text-bull' : a.bias === 'bearish' ? 'text-bear' : 'text-warn'}`}>
          {a.decision}
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-text-muted text-xs">分析</span>
            <p className="text-text-secondary leading-relaxed">{a.reason}</p>
          </div>
          <div>
            <span className="text-text-muted text-xs">触发条件</span>
            <p className="text-text-secondary">{a.trigger}</p>
          </div>
          <div>
            <span className="text-text-muted text-xs">失效条件</span>
            <p className="text-text-secondary">{a.invalidation}</p>
          </div>
          <div className="flex gap-3 pt-1">
            <span className={`px-2 py-0.5 rounded text-xs ${a.riskLevel === 'high' ? 'bg-bear/20 text-bear' : a.riskLevel === 'medium' ? 'bg-warn/20 text-warn' : 'bg-bull/20 text-bull'}`}>
              风险: {a.riskLevel === 'high' ? '高' : a.riskLevel === 'medium' ? '中' : '低'}
            </span>
            <span className="px-2 py-0.5 rounded text-xs bg-surface-border text-text-secondary">
              置信: {a.confidence === 'high' ? '高' : a.confidence === 'medium' ? '中' : '低'}
            </span>
          </div>
        </div>
      </section>

      {/* Market State Summary */}
      <section className="bg-surface-card border border-surface-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gold mb-3">市场状态</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <KV label="当日涨跌" value={`${a.changePercent >= 0 ? '+' : ''}${a.changePercent}%`} c={a.changePercent >= 0 ? 'text-bull' : 'text-bear'} />
          <KV label="日高" value={a.dayHigh.toFixed(2)} />
          <KV label="日低" value={a.dayLow.toFixed(2)} />
          <KV label="1H 结构" value={a.trend1H === 'bullish' ? 'HH/HL 偏多' : a.trend1H === 'bearish' ? 'LH/LL 偏空' : '中性'} />
          <KV label="BOS" value={a.bos === 'none' ? '无' : a.bos} />
          <KV label="CHoCH" value={a.choch === 'none' ? '无' : a.choch} />
          <KV label="价格区域" value={a.priceZone === 'premium' ? '溢价区' : a.priceZone === 'discount' ? '折扣区' : '中位区'} />
          <KV label="扫流动性" value={a.state === 'sweeping_liquidity' ? '是' : '否'} />
        </div>
      </section>

      {/* Key Levels */}
      <section className="bg-surface-card border border-surface-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gold mb-3">关键价位</h3>
        <div className="space-y-2 text-sm">
          <LevelRow label="阻力" price={a.resistance} color="text-bear" />
          <LevelRow label="支撑" price={a.support} color="text-bull" />

          {a.liquidity.slice(0, 3).map((l, i) => (
            <LevelRow
              key={i}
              label={l.type === 'buy_side' ? '买方流动性 (BSL)' : '卖方流动性 (SSL)'}
              price={l.price}
              color={l.type === 'buy_side' ? 'text-warn' : 'text-[#3b82f6]'}
              detail={`${l.touches}次触碰 · ${l.source}`}
            />
          ))}

          {a.fvgZones.slice(0, 3).map((f, i) => (
            <div key={i} className="flex justify-between items-center py-0.5 border-b border-surface-border last:border-0">
              <span className="text-text-muted text-xs">
                FVG {f.type === 'bullish' ? '多' : '空'}
              </span>
              <span className={`font-mono text-xs ${f.type === 'bullish' ? 'text-bull/70' : 'text-bear/70'}`}>
                {f.bottom.toFixed(2)} – {f.top.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Scenarios */}
      <section className="bg-surface-card border border-surface-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gold mb-3">场景推演</h3>
        <div className="space-y-3">
          {a.scenarios.map((s, i) => (
            <div key={i} className="border-l-2 pl-3 py-1"
              style={{ borderColor: s.probability === 'primary' ? '#22c55e' : s.probability === 'secondary' ? '#f59e0b' : '#ef4444' }}>
              <div className="text-xs font-semibold text-text-primary mb-1">{s.label}</div>
              <div className="text-xs text-text-secondary space-y-0.5">
                <div><span className="text-text-muted">触发：</span>{s.trigger}</div>
                <div><span className="text-text-muted">目标：</span>{s.target}</div>
                <div><span className="text-text-muted">应对：</span>{s.response}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Risk */}
      <section className="bg-surface-card border border-surface-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-bear mb-3">风险规则</h3>
        <ul className="space-y-1">
          {RISK_RULES.map((r, i) => (
            <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
              <span className="text-bear mt-0.5">•</span>
              {r}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

// --- Helpers ---

function KV({ label, value, c }: { label: string; value: string; c?: string }) {
  return (
    <div className="flex justify-between border-b border-surface-border pb-1">
      <span className="text-text-muted text-xs">{label}</span>
      <span className={`font-mono text-xs ${c ?? 'text-text-primary'}`}>{value}</span>
    </div>
  );
}

function LevelRow({ label, price, color, detail }: { label: string; price: number | null; color: string; detail?: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-surface-border last:border-0">
      <span className="text-text-muted text-xs">{label}</span>
      <div className="text-right">
        <div className={`font-mono text-xs font-semibold ${color}`}>{price?.toFixed(2) ?? '待确认'}</div>
        {detail && <div className="text-xs text-text-muted">{detail}</div>}
      </div>
    </div>
  );
}
