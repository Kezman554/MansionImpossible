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

export const UndoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
)

export const RedoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Icon>
)

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Icon>
)

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

/** Tool rail icons, keyed by tool id. */
const TOOL_ICON_PATHS: Record<string, string> = {
  select: 'M5 3l14 7-6 2-2 6z',
  room: 'M4 6h16v12H4z',
  door: 'M6 21V4h10v17M3 21h18M13 12h.01',
  window: 'M4 4h16v16H4zM12 4v16M4 12h16',
  freeform: 'M4 18a8 8 0 0 1 16 0M2 18h20',
  stairs: 'M4 20h4v-4h4v-4h4V8h4',
  furnish: 'M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12h18v5H3zM5 17v2M19 17v2',
  materials: 'M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7z',
  lights: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z',
  terrain: 'M2 19l6-9 4 5 3-4 7 8z',
  water: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  gardens: 'M12 21v-4M7 17h10L12 4z',
}

export const ToolIcon = ({ tool, ...props }: IconProps & { tool: string }) => (
  <Icon size={20} {...props}>
    <path d={TOOL_ICON_PATHS[tool]} />
  </Icon>
)
