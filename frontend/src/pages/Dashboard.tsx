import React, { useEffect, useMemo, useState } from 'react'
import { Card } from '../components/Card'
import { Sparkline } from '../components/Sparkline'
import { AreaChart } from '../components/AreaChart'
import { MiniMap } from '../components/MiniMap'
import { InsightRow, type InsightCategory } from '../components/InsightRow'
import { Icons } from '../components/icons'
import { Badge } from '../components/Badge'
import { MOCK, fmtNum, fmtPct } from '../data/mock'
import { apiClient, type InsightResponse } from '../api/client'

interface KPICardProps {
  label: string
  value: string
  change: number
  sub?: string
  spark: number[]
  color: string
  negative?: boolean
  icon: React.ReactNode
}

type FeedInsight = {
  text: string
  category: InsightCategory
  time: string
  aiGenerated?: boolean
}

const KPICard: React.FC<KPICardProps> = ({ label, value, change, sub, spark, color, negative, icon }) => {
  const isUp = change >= 0
  const isGood = negative ? !isUp : isUp
  const changeColor = isGood ? 'var(--success)' : 'var(--danger)'
  const ChangeIcon = isUp ? Icons.ArrowUpRight : Icons.ArrowDownRight
  return (
    <Card style={{ padding: '16px', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
            {icon}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
        </div>
        <Sparkline data={spark} color={color} width={64} height={28} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span className="mono-num" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 500, color: changeColor }}>
          <ChangeIcon size={12} style={{ color: changeColor } as React.CSSProperties} />
          {fmtPct(Math.abs(change))}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>vs yesterday</span>
      </div>
    </Card>
  )
}

const SectionHeader: React.FC<{ title: string; sub?: string; action?: React.ReactNode }> = ({ title, sub, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
    {action}
  </div>
)

const ChartLegend: React.FC = () => (
  <div style={{ display: 'flex', gap: 16 }}>
    {[
      { color: 'var(--chart-1)', label: 'BDI' },
      { color: 'var(--chart-2)', label: 'FBX' },
    ].map(({ color, label }) => (
      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 20, height: 2, background: color, display: 'inline-block', borderRadius: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      </div>
    ))}
  </div>
)

const MapLegend: React.FC = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    {[
      { color: 'var(--cong-low)', label: 'Low' },
      { color: 'var(--cong-med)', label: 'Med' },
      { color: 'var(--cong-high)', label: 'High' },
    ].map(({ color, label }) => (
      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      </div>
    ))}
  </div>
)

const relativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(diffMs / 60000))
  if (mins < 60) return `${mins || 1}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const normalizeCategory = (category?: string | null): InsightCategory => {
  if (category === 'anomaly' || category === 'correlation' || category === 'forecast') return category
  return 'trend'
}

export const Dashboard: React.FC = () => {
  const [apiInsights, setApiInsights] = useState<InsightResponse[]>([])

  useEffect(() => {
    let cancelled = false
    apiClient.latestInsights(5)
      .then(rows => {
        if (!cancelled) setApiInsights(rows)
      })
      .catch(() => {
        if (!cancelled) setApiInsights([])
      })
    return () => { cancelled = true }
  }, [])

  const liveInsights = useMemo(() => apiInsights.map(insight => ({
    text: insight.narrative_llm || insight.narrative,
    category: normalizeCategory(insight.category),
    time: relativeTime(insight.narrative_generated_at || insight.generated_at),
    aiGenerated: Boolean(insight.narrative_llm),
  })), [apiInsights])

  const insights: FeedInsight[] = liveInsights.length > 0 ? liveInsights : MOCK.insights

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 12 }}>
        <KPICard
          label="Baltic Dry Index"
          value={fmtNum(1847)}
          change={2.3}
          spark={MOCK.bdiSpark}
          color="var(--chart-1)"
          icon={<Icons.TrendingUp size={16} />}
        />
        <KPICard
          label="Freightos Baltic (FBX)"
          value={fmtNum(2156)}
          sub="USD/FEU"
          change={-1.1}
          spark={MOCK.fbxSpark}
          color="var(--chart-2)"
          icon={<Icons.Activity size={16} />}
        />
        <KPICard
          label="Active Vessels"
          value={fmtNum(12847)}
          change={1.2}
          spark={MOCK.vesselSpark}
          color="var(--chart-3)"
          icon={<Icons.Ship size={16} />}
        />
        <KPICard
          label="High-Severity Anomalies"
          value="7"
          change={3}
          spark={MOCK.anomalySpark}
          color="var(--danger)"
          negative
          icon={<Icons.AlertTriangle size={16} />}
        />
      </div>

      {/* Middle row: Chart + Map */}
      <div style={{ display: 'flex', gap: 12, flex: '0 0 auto' }}>
        {/* Chart */}
        <Card style={{ flex: 3, padding: '16px', minWidth: 0 }}>
          <SectionHeader
            title="Freight Index Trends"
            sub="30-day rolling · BDI normalized against FBX"
            action={<ChartLegend />}
          />
          <AreaChart
            datasets={[
              { data: MOCK.bdi30, color: 'var(--chart-1)', prefix: '' },
              { data: MOCK.fbx30, color: 'var(--chart-2)', prefix: '$', suffix: '' },
            ]}
            labels={MOCK.dates30}
            height={200}
          />
        </Card>

        {/* Mini Map */}
        <Card style={{ flex: 2, padding: '16px', minWidth: 0 }}>
          <SectionHeader
            title="Port Congestion"
            sub="Real-time congestion overlay"
            action={<MapLegend />}
          />
          <MiniMap height={176} />
        </Card>
      </div>

      {/* Bottom row: Insights + Port List */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Insights */}
        <Card style={{ flex: 3, padding: '16px', minWidth: 0 }}>
          <SectionHeader
            title="AI Insights Feed"
            sub="Latest signals detected by the intelligence engine"
            action={
              <Badge variant="accent" style={{ cursor: 'pointer' }}>View all</Badge>
            }
          />
          <div>
            {insights.map((insight, i) => (
              <InsightRow
                key={i}
                text={insight.text}
                category={insight.category}
                time={insight.time}
                aiGenerated={insight.aiGenerated ?? false}
              />
            ))}
          </div>
        </Card>

        {/* Quick Stats */}
        <Card style={{ flex: 2, padding: '16px', minWidth: 0 }}>
          <SectionHeader title="Market Snapshot" sub="Key metrics at a glance" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: 'BDI 7D Change', value: '+4.8%', positive: true },
              { label: 'FBX 7D Change', value: '−2.3%', positive: false },
              { label: 'Avg Transit (Suez)', value: '14.2 days', positive: null },
              { label: 'Vessels at Anchor', value: '1,847', positive: null },
              { label: 'Port Congestion High', value: '3 ports', positive: false },
              { label: 'Active Anomalies', value: '7 detected', positive: false },
              { label: 'Model Confidence', value: '82%', positive: true },
              { label: 'Last Data Sync', value: '2m ago', positive: null },
            ].map(({ label, value, positive }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                <span className="mono-num" style={{
                  fontSize: 12, fontWeight: 500,
                  color: positive === true ? 'var(--success)' : positive === false ? 'var(--danger)' : 'var(--text-primary)',
                }}>{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
