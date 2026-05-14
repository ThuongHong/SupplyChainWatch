import React, { useState } from 'react'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { Sparkline } from '../components/Sparkline'
import { Icons } from '../components/icons'
import { fmtNum } from '../data/mock'

// ---- Types & Data ----

type CongestionLevel = 'low' | 'medium' | 'high'
type Region = 'All' | 'Asia' | 'Europe' | 'Americas' | 'Middle East'

const REGIONS: Region[] = ['All', 'Asia', 'Europe', 'Americas', 'Middle East']

function genSpark(seed: number, length = 14): number[] {
  let v = 50 + seed * 13
  let rng = seed * 9301 + 49297
  return Array.from({ length }, () => {
    rng = (rng * 9301 + 49297) % 233280
    v = Math.max(10, Math.min(98, v + (rng / 233280 - 0.5) * 20))
    return Math.round(v)
  })
}

interface PortData {
  name: string
  country: string
  region: Region
  congestion: CongestionLevel
  anomaly: boolean
  throughput: number
  vessels: number
  waitTime: number
  spark: number[]
  breakdown: { label: string; value: number; color: string }[]
}

const PORTS_DATA: PortData[] = [
  { name: 'Shanghai', country: 'China', region: 'Asia', congestion: 'high', anomaly: true, throughput: 47300, vessels: 142, waitTime: 3.8, spark: genSpark(1), breakdown: [{ label: 'Container', value: 65, color: '#3B82F6' }, { label: 'Bulk', value: 20, color: '#F59E0B' }, { label: 'Tanker', value: 15, color: '#EF4444' }] },
  { name: 'Singapore', country: 'Singapore', region: 'Asia', congestion: 'medium', anomaly: false, throughput: 37200, vessels: 98, waitTime: 1.2, spark: genSpark(2), breakdown: [{ label: 'Container', value: 70, color: '#3B82F6' }, { label: 'Tanker', value: 22, color: '#EF4444' }, { label: 'Bulk', value: 8, color: '#F59E0B' }] },
  { name: 'Rotterdam', country: 'Netherlands', region: 'Europe', congestion: 'low', anomaly: false, throughput: 14800, vessels: 54, waitTime: 0.4, spark: genSpark(3), breakdown: [{ label: 'Container', value: 55, color: '#3B82F6' }, { label: 'Bulk', value: 30, color: '#F59E0B' }, { label: 'Tanker', value: 15, color: '#EF4444' }] },
  { name: 'Los Angeles', country: 'USA', region: 'Americas', congestion: 'high', anomaly: true, throughput: 10600, vessels: 87, waitTime: 4.2, spark: genSpark(4), breakdown: [{ label: 'Container', value: 80, color: '#3B82F6' }, { label: 'RORO', value: 12, color: '#06B6D4' }, { label: 'Bulk', value: 8, color: '#F59E0B' }] },
  { name: 'Antwerp', country: 'Belgium', region: 'Europe', congestion: 'medium', anomaly: false, throughput: 12500, vessels: 61, waitTime: 0.9, spark: genSpark(5), breakdown: [{ label: 'Container', value: 60, color: '#3B82F6' }, { label: 'Chemical', value: 25, color: '#A78BFA' }, { label: 'Bulk', value: 15, color: '#F59E0B' }] },
  { name: 'Ningbo', country: 'China', region: 'Asia', congestion: 'high', anomaly: false, throughput: 33500, vessels: 118, waitTime: 2.9, spark: genSpark(6), breakdown: [{ label: 'Container', value: 72, color: '#3B82F6' }, { label: 'Bulk', value: 18, color: '#F59E0B' }, { label: 'Tanker', value: 10, color: '#EF4444' }] },
  { name: 'Busan', country: 'South Korea', region: 'Asia', congestion: 'low', anomaly: false, throughput: 22400, vessels: 73, waitTime: 0.6, spark: genSpark(7), breakdown: [{ label: 'Container', value: 85, color: '#3B82F6' }, { label: 'Bulk', value: 10, color: '#F59E0B' }, { label: 'RORO', value: 5, color: '#06B6D4' }] },
  { name: 'Hamburg', country: 'Germany', region: 'Europe', congestion: 'medium', anomaly: false, throughput: 8900, vessels: 44, waitTime: 1.1, spark: genSpark(8), breakdown: [{ label: 'Container', value: 65, color: '#3B82F6' }, { label: 'Bulk', value: 25, color: '#F59E0B' }, { label: 'Tanker', value: 10, color: '#EF4444' }] },
  { name: 'Shenzhen', country: 'China', region: 'Asia', congestion: 'medium', anomaly: false, throughput: 28800, vessels: 89, waitTime: 1.7, spark: genSpark(9), breakdown: [{ label: 'Container', value: 90, color: '#3B82F6' }, { label: 'Bulk', value: 7, color: '#F59E0B' }, { label: 'Other', value: 3, color: '#8594AE' }] },
  { name: 'Hong Kong', country: 'China', region: 'Asia', congestion: 'low', anomaly: false, throughput: 18100, vessels: 66, waitTime: 0.5, spark: genSpark(10), breakdown: [{ label: 'Container', value: 88, color: '#3B82F6' }, { label: 'RORO', value: 8, color: '#06B6D4' }, { label: 'Bulk', value: 4, color: '#F59E0B' }] },
  { name: 'Dubai (Jebel Ali)', country: 'UAE', region: 'Middle East', congestion: 'medium', anomaly: true, throughput: 15200, vessels: 55, waitTime: 1.5, spark: genSpark(11), breakdown: [{ label: 'Container', value: 75, color: '#3B82F6' }, { label: 'Tanker', value: 18, color: '#EF4444' }, { label: 'Bulk', value: 7, color: '#F59E0B' }] },
  { name: 'Port Klang', country: 'Malaysia', region: 'Asia', congestion: 'low', anomaly: false, throughput: 13800, vessels: 48, waitTime: 0.7, spark: genSpark(12), breakdown: [{ label: 'Container', value: 78, color: '#3B82F6' }, { label: 'Bulk', value: 15, color: '#F59E0B' }, { label: 'Tanker', value: 7, color: '#EF4444' }] },
  { name: 'New York', country: 'USA', region: 'Americas', congestion: 'medium', anomaly: false, throughput: 7200, vessels: 38, waitTime: 1.3, spark: genSpark(13), breakdown: [{ label: 'Container', value: 70, color: '#3B82F6' }, { label: 'Tanker', value: 20, color: '#EF4444' }, { label: 'RORO', value: 10, color: '#06B6D4' }] },
  { name: 'Valencia', country: 'Spain', region: 'Europe', congestion: 'low', anomaly: false, throughput: 5600, vessels: 29, waitTime: 0.3, spark: genSpark(14), breakdown: [{ label: 'Container', value: 82, color: '#3B82F6' }, { label: 'Bulk', value: 12, color: '#F59E0B' }, { label: 'Other', value: 6, color: '#8594AE' }] },
  { name: 'Colombo', country: 'Sri Lanka', region: 'Asia', congestion: 'medium', anomaly: false, throughput: 7400, vessels: 41, waitTime: 1.0, spark: genSpark(15), breakdown: [{ label: 'Container', value: 92, color: '#3B82F6' }, { label: 'Bulk', value: 5, color: '#F59E0B' }, { label: 'Other', value: 3, color: '#8594AE' }] },
  { name: 'Santos', country: 'Brazil', region: 'Americas', congestion: 'high', anomaly: true, throughput: 4800, vessels: 62, waitTime: 5.1, spark: genSpark(16), breakdown: [{ label: 'Container', value: 45, color: '#3B82F6' }, { label: 'Bulk', value: 40, color: '#F59E0B' }, { label: 'Tanker', value: 15, color: '#EF4444' }] },
  { name: 'Felixstowe', country: 'UK', region: 'Europe', congestion: 'low', anomaly: false, throughput: 3900, vessels: 22, waitTime: 0.4, spark: genSpark(17), breakdown: [{ label: 'Container', value: 95, color: '#3B82F6' }, { label: 'Bulk', value: 4, color: '#F59E0B' }, { label: 'Other', value: 1, color: '#8594AE' }] },
  { name: 'Tanjung Pelepas', country: 'Malaysia', region: 'Asia', congestion: 'low', anomaly: false, throughput: 9100, vessels: 35, waitTime: 0.5, spark: genSpark(18), breakdown: [{ label: 'Container', value: 97, color: '#3B82F6' }, { label: 'Bulk', value: 2, color: '#F59E0B' }, { label: 'Other', value: 1, color: '#8594AE' }] },
  { name: 'Bandar Abbas', country: 'Iran', region: 'Middle East', congestion: 'high', anomaly: false, throughput: 2700, vessels: 45, waitTime: 6.2, spark: genSpark(19), breakdown: [{ label: 'Container', value: 40, color: '#3B82F6' }, { label: 'Tanker', value: 45, color: '#EF4444' }, { label: 'Bulk', value: 15, color: '#F59E0B' }] },
  { name: 'Piraeus', country: 'Greece', region: 'Europe', congestion: 'medium', anomaly: false, throughput: 5200, vessels: 33, waitTime: 1.2, spark: genSpark(20), breakdown: [{ label: 'Container', value: 68, color: '#3B82F6' }, { label: 'Tanker', value: 20, color: '#EF4444' }, { label: 'Bulk', value: 12, color: '#F59E0B' }] },
]

// ---- Sub-components ----

const congBadge: Record<CongestionLevel, 'danger' | 'warning' | 'success'> = {
  high: 'danger', medium: 'warning', low: 'success',
}

const PortCard: React.FC<{ port: PortData; onClick: () => void }> = ({ port, onClick }) => (
  <Card hover onClick={onClick} style={{ padding: '14px 16px', cursor: 'pointer' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{port.name}</span>
          {port.anomaly && <Icons.AlertTriangle size={12} style={{ color: 'var(--danger)' } as React.CSSProperties} />}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{port.country} · {port.region}</div>
      </div>
      <Badge variant={congBadge[port.congestion]}>{port.congestion.charAt(0).toUpperCase() + port.congestion.slice(1)}</Badge>
    </div>

    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div>
        <div className="mono-num" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{port.vessels}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>vessels</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
          <div>
            <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{port.waitTime}h</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>avg wait</div>
          </div>
          <div>
            <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtNum(port.throughput)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>TEU/yr</div>
          </div>
        </div>
      </div>
      <Sparkline
        data={port.spark}
        color={port.congestion === 'high' ? 'var(--danger)' : port.congestion === 'medium' ? 'var(--warning)' : 'var(--success)'}
        width={72} height={36}
      />
    </div>
  </Card>
)

const PortDetail: React.FC<{ port: PortData; onClose: () => void }> = ({ port, onClose }) => {
  const W = 300, H = 80
  const spark30 = [...port.spark, ...genSpark(port.vessels % 20 + 1)]
  const min = Math.min(...spark30), max = Math.max(...spark30), range = max - min || 1
  const pts = spark30.map((v, i) => ({
    x: 8 + (i / (spark30.length - 1)) * (W - 16),
    y: 8 + (1 - (v - min) / range) * (H - 16),
  }))
  const sparkPath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(7,11,20,0.7)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, width: 380,
        boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-default)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{port.name}</span>
              <Badge variant={congBadge[port.congestion]}>{port.congestion.charAt(0).toUpperCase() + port.congestion.slice(1)}</Badge>
              {port.anomaly && <Badge variant="danger">Anomaly</Badge>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{port.country} · {port.region}</div>
          </div>
          <div onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}><Icons.X size={18} /></div>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>30-Day Congestion Trend</div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: 'var(--bg-elevated)', borderRadius: 6 }}>
            <path d={sparkPath} fill="none"
              stroke={port.congestion === 'high' ? 'var(--danger)' : port.congestion === 'medium' ? 'var(--warning)' : 'var(--success)'}
              strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3"
              fill={port.congestion === 'high' ? 'var(--danger)' : port.congestion === 'medium' ? 'var(--warning)' : 'var(--success)'} />
          </svg>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Vessel Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {port.breakdown.map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
                  <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-primary)' }}>{value}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Active Vessels', value: port.vessels.toString() },
            { label: 'Avg Wait Time', value: `${port.waitTime}h` },
            { label: 'Annual Throughput', value: `${fmtNum(port.throughput)} TEU` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
              <div className="mono-num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----

export const Ports: React.FC = () => {
  const [region, setRegion] = useState<Region>('All')
  const [selectedPort, setSelectedPort] = useState<PortData | null>(null)
  const [search, setSearch] = useState('')

  const filtered = PORTS_DATA.filter(p =>
    (region === 'All' || p.region === region) &&
    (search === '' || p.name.toLowerCase().includes(search.toLowerCase()) || p.country.toLowerCase().includes(search.toLowerCase()))
  )

  const highCount = PORTS_DATA.filter(p => p.congestion === 'high').length
  const anomalyCount = PORTS_DATA.filter(p => p.anomaly).length

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { label: 'Total Ports', value: PORTS_DATA.length, color: 'var(--text-primary)' },
          { label: 'High Congestion', value: highCount, color: 'var(--danger)' },
          { label: 'Active Anomalies', value: anomalyCount, color: 'var(--warning)' },
          { label: 'Normal Operations', value: PORTS_DATA.length - highCount - anomalyCount, color: 'var(--success)' },
        ].map(({ label, value, color }) => (
          <Card key={label} style={{ flex: 1, padding: '12px 16px' }}>
            <div className="mono-num" style={{ fontSize: 22, fontWeight: 600, color }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 3, borderRadius: 8 }}>
          {REGIONS.map(r => (
            <button key={r} onClick={() => setRegion(r)} style={{
              height: 26, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: region === r ? 'var(--bg-card)' : 'transparent',
              color: region === r ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: region === r ? 'var(--shadow-sm)' : 'none',
            }}>{r}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}>
          <Icons.Search size={13} style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ports…"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 160 }}
          />
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {filtered.map(port => (
          <PortCard key={port.name} port={port} onClick={() => setSelectedPort(port)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          No ports match your filter.
        </div>
      )}

      {selectedPort && <PortDetail port={selectedPort} onClose={() => setSelectedPort(null)} />}
    </div>
  )
}
