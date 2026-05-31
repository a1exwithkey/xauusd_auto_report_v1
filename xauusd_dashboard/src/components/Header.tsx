import { useState, useEffect } from 'react';
import { MarketAnalysis, DataStatus } from '../types';

interface Props {
  analysis: MarketAnalysis | null;
  status: DataStatus;
  lastRefresh: number;
  nextRefresh: number;
  dataSource: string;
}

const STATE_LABELS: Record<string, string> = {
  trending_up: '趋势上涨',
  trending_down: '趋势下跌',
  ranging: '震荡',
  structure_shift: '结构转换中',
  sweeping_liquidity: '扫流动性格',
  pullback: '回踩/反抽中',
  waiting: '等待确认',
};

const STATE_COLORS: Record<string, string> = {
  trending_up: 'bg-bull',
  trending_down: 'bg-bear',
  ranging: 'bg-warn',
  structure_shift: 'bg-purple-500',
  sweeping_liquidity: 'bg-orange-500',
  pullback: 'bg-cyan-500',
  waiting: 'bg-gray-500',
};

const BIAS_LABELS: Record<string, string> = {
  bullish: '偏多',
  bearish: '偏空',
  neutral: '中性',
};

export function Header({ analysis, status, lastRefresh, nextRefresh, dataSource }: Props) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const tick = () => {
      const remain = Math.max(0, nextRefresh - Date.now());
      const m = Math.floor(remain / 60000);
      const s = Math.floor((remain % 60000) / 1000);
      setCountdown(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRefresh]);

  const p = analysis?.currentPrice ?? null;
  const change = analysis?.changePercent ?? 0;
  const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

  const statusDot = {
    fresh: 'bg-bull',
    refreshing: 'bg-warn animate-pulse',
    stale: 'bg-warn',
    error: 'bg-bear',
  }[status];

  return (
    <header className="bg-surface-card border-b border-surface-border px-4 py-3">
      <div className="mx-auto max-w-[1600px] flex flex-wrap items-center gap-x-6 gap-y-2 pr-24">
        {/* Title */}
        <div className="flex items-center gap-3">
          <span className="text-gold font-bold text-lg tracking-tight">XAUUSD</span>
          <span className="text-text-secondary text-xs hidden sm:inline">Market Structure Dashboard</span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-mono font-bold text-text-primary">{p !== null ? p.toFixed(2) : '--'}</span>
          <span className={`text-sm font-mono ${change >= 0 ? 'text-bull' : 'text-bear'}`}>{p !== null ? changeStr : '--'}</span>
        </div>

        {/* State badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded text-xs font-semibold text-white ${analysis ? STATE_COLORS[analysis.state] : 'bg-bear'}`}>
            {analysis ? STATE_LABELS[analysis.state] || analysis.state : '无行情'}
          </span>
          <span className="px-2 py-0.5 rounded text-xs bg-surface-border text-text-secondary">
            {analysis ? `${BIAS_LABELS[analysis.bias]} · ${analysis.confidence === 'high' ? '高置信' : analysis.confidence === 'medium' ? '中置信' : '低置信'}` : '等待数据'}
          </span>
          {analysis?.tradeable ? (
            <span className="px-2 py-0.5 rounded text-xs bg-bull/20 text-bull border border-bull/30">可交易</span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs bg-warn/20 text-warn border border-warn/30">等待/谨慎</span>
          )}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {/* Status */}
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className={`w-2 h-2 rounded-full ${statusDot}`} />
            <span>{status === 'fresh' ? '实时' : status === 'refreshing' ? '刷新中' : status === 'stale' ? '缓存' : '异常'}</span>
          </div>

          {/* Countdown */}
          <span className="text-xs text-text-muted font-mono">
            下次刷新 {countdown}
          </span>
          <span className="text-xs text-text-muted hidden sm:inline">
            上次 {new Date(lastRefresh).toLocaleTimeString('zh-CN', { hour12: false })}
          </span>

          {/* Data source */}
          <span className="text-xs text-text-muted max-w-[220px] truncate">{dataSource}</span>
        </div>
      </div>
    </header>
  );
}
