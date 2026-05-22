import React from 'react'
import { API_BASE_URL, isApiError } from '../api/client'
import type { DataMode, Severity } from '../api/viewModels'
import { Icons } from './icons'
import { Badge } from './Badge'
import { Card } from './Card'

export const PageShell: React.FC<{
  title?: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  flush?: boolean
}> = ({ title, subtitle, action, children, flush }) => (
  <div className={flush ? 'page-shell page-shell--flush' : 'page-shell'}>
    {(title || subtitle || action) && (
      <div className="page-title-row">
        <div>
          {title && <h1>{title}</h1>}
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </div>
)

export const SectionHeader: React.FC<{
  title: string
  sub?: string
  action?: React.ReactNode
}> = ({ title, sub, action }) => (
  <div className="section-header">
    <div>
      <div className="section-header__title">{title}</div>
      {sub && <div className="section-header__sub">{sub}</div>}
    </div>
    {action}
  </div>
)

export const SkeletonBlock: React.FC<{ height?: number; lines?: number }> = ({ height = 96, lines = 3 }) => (
  <div className="skeleton-block" style={{ minHeight: height }}>
    {Array.from({ length: lines }, (_, index) => (
      <span key={index} style={{ width: `${86 - index * 14}%` }} />
    ))}
  </div>
)

export const EmptyState: React.FC<{ title: string; detail?: string; compact?: boolean }> = ({ title, detail, compact }) => (
  <div className={compact ? 'data-state data-state--compact' : 'data-state'}>
    <Icons.Info size={compact ? 15 : 18} />
    <div>
      <div className="data-state__title">{title}</div>
      {detail && <div className="data-state__detail">{detail}</div>}
    </div>
  </div>
)

export const ErrorPanel: React.FC<{ error: unknown; title?: string; compact?: boolean }> = ({
  error,
  title = 'API unavailable',
  compact,
}) => {
  const detail = isApiError(error)
    ? `${error.detail}${error.status ? ` · ${error.status}` : ''}`
    : error instanceof Error
      ? error.message
      : `Could not reach ${API_BASE_URL}`
  return (
    <div className={compact ? 'data-state data-state--error data-state--compact' : 'data-state data-state--error'}>
      <Icons.AlertTriangle size={compact ? 15 : 18} />
      <div>
        <div className="data-state__title">{title}</div>
        <div className="data-state__detail">{detail}</div>
      </div>
    </div>
  )
}

export const DataProvenance: React.FC<{
  mode: DataMode
  source?: string
  timestamp?: string | null
  stale?: boolean
}> = ({ mode, source, timestamp, stale }) => {
  const effectiveMode = stale && mode === 'live' ? 'stale' : mode
  const variant = effectiveMode === 'live' ? 'success'
    : effectiveMode === 'demo' || effectiveMode === 'stale' ? 'warning'
      : effectiveMode === 'error' ? 'danger'
        : 'default'
  const label = effectiveMode === 'live' ? 'Live API'
    : effectiveMode === 'stale' ? 'Stale API'
      : effectiveMode === 'demo' ? 'Demo fallback'
        : effectiveMode === 'empty' ? 'No rows'
          : effectiveMode === 'disabled' ? 'Source disabled'
            : effectiveMode === 'loading' ? 'Loading'
              : 'API error'
  return (
    <div className="provenance">
      <Badge variant={variant}>{label}</Badge>
      {source && <span>{source}</span>}
      {timestamp && <span className="mono-num">{timestamp}</span>}
    </div>
  )
}

export const RiskBadge: React.FC<{ severity: Severity; label?: string }> = ({ severity, label }) => {
  const variant = severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'success'
  return <Badge variant={variant}>{label ?? `${severity[0].toUpperCase()}${severity.slice(1)} risk`}</Badge>
}

export const MetricCard: React.FC<{
  label: string
  value: React.ReactNode
  sub?: string
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  icon?: React.ReactNode
  footer?: React.ReactNode
}> = ({ label, value, sub, tone = 'default', icon, footer }) => (
  <Card style={{ padding: '14px 16px' }}>
    <div className="metric-card__top">
      <span>{label}</span>
      {icon && <div className={`metric-card__icon metric-card__icon--${tone}`}>{icon}</div>}
    </div>
    <div className={`metric-card__value metric-card__value--${tone}`}>{value}</div>
    {sub && <div className="metric-card__sub">{sub}</div>}
    {footer && <div className="metric-card__footer">{footer}</div>}
  </Card>
)

export const TooltipTerm: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => (
  <span className="tooltip-term" tabIndex={0}>
    {children}
    <span className="tooltip-term__bubble">{term}</span>
  </span>
)
