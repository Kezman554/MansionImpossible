// Inline stroke icons; colour comes from currentColor.
import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  className?: string
}

function Icon({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export const BinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
)

export const MoreIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
  </Icon>
)

export const WarningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18h.01" />
  </Icon>
)

export const TickIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12l5 5 9-10" />
  </Icon>
)

export const BackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)
