import type { PeriodKey } from './report'

export type ThemeId = 'neon' | 'cyber' | 'midnight'

export type SlideCommonProps = {
  report: unknown
  period: PeriodKey
  onPeriodToggle: () => void
  onThemeChange: (theme: ThemeId) => void
  theme: ThemeId
}
