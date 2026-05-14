import React from 'react'

interface StatusDotProps {
  status?: 'success' | 'warning' | 'danger'
  pulse?: boolean
  size?: number
  style?: React.CSSProperties
}

export const StatusDot: React.FC<StatusDotProps> = ({ status = 'success', pulse, size = 7, style }) => {
  const color = status === 'success' ? 'var(--success)' : status === 'warning' ? 'var(--warning)' : 'var(--danger)'
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, ...style }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }} />
      {pulse && <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: color, opacity: 0.4, animation: 'gswPulse 2s ease-in-out infinite' }} />}
    </span>
  )
}
