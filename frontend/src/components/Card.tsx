import React, { useState } from 'react'

interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  hover?: boolean
  onClick?: () => void
}

export const Card: React.FC<CardProps> = ({ children, style, hover, onClick }) => {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: 'var(--bg-card)', borderRadius: 8,
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        transform: hovered ? 'translateY(-1px)' : 'none',
        ...style,
      }}>{children}</div>
  )
}
