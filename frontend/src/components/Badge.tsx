import React from 'react'

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'var(--bg-hover)', color: 'var(--text-secondary)' },
  accent: { background: 'var(--accent-muted)', color: 'var(--accent-text)' },
  success: { background: 'var(--success-muted)', color: 'var(--success)' },
  warning: { background: 'var(--warning-muted)', color: 'var(--warning)' },
  danger: { background: 'var(--danger-muted)', color: 'var(--danger)' },
  info: { background: 'var(--info-muted)', color: 'var(--info)' },
}

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  style?: React.CSSProperties
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500,
    letterSpacing: '0.01em', lineHeight: '18px', whiteSpace: 'nowrap',
    ...variantStyles[variant], ...style,
  }}>{children}</span>
)
