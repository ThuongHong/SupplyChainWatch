import React from 'react'
import { Badge } from './Badge'
import { Icons } from './icons'

export type InsightCategory = 'trend' | 'anomaly' | 'correlation' | 'forecast'

const catConfig = {
  trend: { color: 'var(--chart-1)', bg: 'var(--accent-muted)', Icon: Icons.TrendingUp, label: 'Trend' },
  anomaly: { color: 'var(--danger)', bg: 'var(--danger-muted)', Icon: Icons.AlertTriangle, label: 'Anomaly' },
  correlation: { color: 'var(--chart-3)', bg: 'rgba(167,139,250,0.14)', Icon: Icons.GitBranch, label: 'Correlation' },
  forecast: { color: 'var(--chart-4)', bg: 'var(--warning-muted)', Icon: Icons.Target, label: 'Forecast' },
}

interface InsightRowProps {
  text: string
  category: InsightCategory
  time: string
  aiGenerated?: boolean
}

export const InsightRow: React.FC<InsightRowProps> = ({ text, category, time, aiGenerated = false }) => {
  const cfg = catConfig[category]
  const Icon = cfg.Icon
  const badgeVariant = category === 'anomaly' ? 'danger' : category === 'forecast' ? 'warning' : category === 'correlation' ? 'info' : 'accent'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cfg.bg, color: cfg.color, flexShrink: 0, marginTop: 1 }}>
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: '1.5' }}>{text}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Badge variant={badgeVariant as 'danger' | 'warning' | 'info' | 'accent'}>{cfg.label}</Badge>
          {aiGenerated && <Badge variant="info">AI-generated</Badge>}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{time}</span>
        </div>
      </div>
    </div>
  )
}
