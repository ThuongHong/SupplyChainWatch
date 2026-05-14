import React from 'react'

interface IconProps {
  size?: number
  sw?: number
  style?: React.CSSProperties
  className?: string
}

const I: React.FC<IconProps & { children: React.ReactNode }> = ({ children, size = 18, sw = 1.75, style, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round"
    strokeLinejoin="round" style={{ flexShrink: 0, ...style }} {...p}>
    {children}
  </svg>
)

export const Icons = {
  Dashboard: (p: IconProps) => <I {...p}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></I>,
  TrendingUp: (p: IconProps) => <I {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></I>,
  Ship: (p: IconProps) => <I {...p}><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10V4"/></I>,
  Anchor: (p: IconProps) => <I {...p}><path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/></I>,
  Lightbulb: (p: IconProps) => <I {...p}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></I>,
  Search: (p: IconProps) => <I {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></I>,
  Bell: (p: IconProps) => <I {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></I>,
  ChevronRight: (p: IconProps) => <I {...p}><path d="m9 18 6-6-6-6"/></I>,
  ChevronDown: (p: IconProps) => <I {...p}><path d="m6 9 6 6 6-6"/></I>,
  ArrowUpRight: (p: IconProps) => <I {...p}><path d="M7 7h10v10"/><path d="M7 17 17 7"/></I>,
  ArrowDownRight: (p: IconProps) => <I {...p}><path d="M7 7l10 10"/><path d="M17 7v10H7"/></I>,
  AlertTriangle: (p: IconProps) => <I {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></I>,
  GitBranch: (p: IconProps) => <I {...p}><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></I>,
  Target: (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></I>,
  Globe: (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></I>,
  Activity: (p: IconProps) => <I {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></I>,
  Layers: (p: IconProps) => <I {...p}><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84Z"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/></I>,
  Sun: (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></I>,
  Moon: (p: IconProps) => <I {...p}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></I>,
  Filter: (p: IconProps) => <I {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></I>,
  X: (p: IconProps) => <I {...p}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></I>,
  Info: (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></I>,
}
