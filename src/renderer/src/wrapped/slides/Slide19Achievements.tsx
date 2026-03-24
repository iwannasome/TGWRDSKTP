import { motion } from 'framer-motion'
import React, { useMemo } from 'react'
import SlideFrame from '../SlideFrame'
import { getAchievements } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getBoolean, getNumber, getString } from '../safe'

type AchievementViewModel = {
  id: string
  title: string
  description: string
  score: number
  earned: boolean
  badgeImagePath: string
}

const localBadgeModules = {
  ...import.meta.glob('../../assets/achievements/*.{png,jpg,jpeg,webp,avif,svg}', {
    eager: true,
    import: 'default'
  }),
  ...import.meta.glob('../../assets/badges/*.{png,jpg,jpeg,webp,avif,svg}', {
    eager: true,
    import: 'default'
  })
} as Record<string, string>

const localBadgeMap = (() => {
  const map = new Map<string, string>()

  const register = (key: string, value: string) => {
    const normalized = key.trim().toLowerCase()
    if (normalized && !map.has(normalized)) map.set(normalized, value)
  }

  Object.entries(localBadgeModules).forEach(([path, url]) => {
    const file = path.split('/').pop() ?? ''
    const base = file.replace(/\.[^.]+$/, '')

    register(path, url)
    register(file, url)
    register(base, url)
    register(base.replace(/[-\s]+/g, '_'), url)
    register(base.replace(/[_\s]+/g, '-'), url)
  })

  return map
})()

function normalizeAchievement(raw: Record<string, unknown>): AchievementViewModel {
  const id = getString(raw, 'id', '').trim()
  const title = getString(raw, 'title', id || 'Achievement').trim()
  const description = getString(raw, 'description', '').trim()
  const score = Math.max(0, Math.round(getNumber(raw, 'score', 0)))
  const earned = getBoolean(raw, 'earned', false)
  const badgeImagePath = getString(raw, 'badge_image_path', '').trim()

  return {
    id,
    title,
    description,
    score,
    earned,
    badgeImagePath
  }
}

function resolveBadgeSrc(item: AchievementViewModel): string | null {
  const candidates = [item.badgeImagePath, item.id]

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (!trimmed) continue

    const lower = trimmed.toLowerCase()
    const file = trimmed.split('/').pop()?.toLowerCase() ?? ''
    const base = file.replace(/\.[^.]+$/, '')
    const underscore = lower.replace(/[-\s]+/g, '_')
    const dash = lower.replace(/[_\s]+/g, '-')

    const found =
      localBadgeMap.get(lower) ??
      localBadgeMap.get(file) ??
      localBadgeMap.get(base) ??
      localBadgeMap.get(underscore) ??
      localBadgeMap.get(dash)

    if (found) return found
  }

  return null
}

function pickHeroAchievement(items: AchievementViewModel[]): AchievementViewModel | null {
  if (items.length === 0) return null
  const earned = items.filter((item) => item.earned)
  return (earned.length > 0 ? earned : items)[0] ?? null
}

function renderFallbackBadge(label: string): JSX.Element {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute inset-4 rounded-full bg-[rgba(var(--tgwr-accent1-rgb),0.12)] blur-[24px]" />
      <div className="relative flex h-full w-full items-center justify-center rounded-[28px] border border-[rgba(var(--tgwr-accent1-rgb),0.18)] bg-[rgba(var(--tgwr-card-rgb),0.72)] text-[42px] font-bold text-slate-100">
        {initials || '★'}
      </div>
    </div>
  )
}

type StatusChipProps = {
  earned: boolean
}

function StatusChip({ earned }: StatusChipProps): JSX.Element {
  return (
    <div
      className={[
        'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]',
        earned
          ? 'border-[rgba(var(--tgwr-accent1-rgb),0.32)] bg-[rgba(var(--tgwr-accent1-rgb),0.12)] text-slate-50'
          : 'border-white/10 bg-white/5 text-[rgba(var(--tgwr-muted-rgb),0.82)]'
      ].join(' ')}
    >
      {earned ? 'Unlocked' : 'Locked'}
    </div>
  )
}

type GridCardProps = {
  item: AchievementViewModel
  index: number
  exporting?: boolean
}

function GridCard({ item, index, exporting }: GridCardProps): JSX.Element {
  const badgeSrc = resolveBadgeSrc(item)

  return (
    <motion.div
      initial={exporting ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: exporting ? 0 : 0.28, delay: exporting ? 0 : Math.min(0.26, 0.1 + index * 0.03) }}
      className={[
        'relative overflow-hidden rounded-[30px] border p-5',
        item.earned
          ? 'border-[rgba(var(--tgwr-accent1-rgb),0.20)] bg-[linear-gradient(180deg,rgba(var(--tgwr-accent1-rgb),0.10),rgba(var(--tgwr-card-rgb),0.68))]'
          : 'border-white/10 bg-[rgba(var(--tgwr-card-rgb),0.46)]'
      ].join(' ')}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[rgba(var(--tgwr-accent2-rgb),0.10)] blur-[34px]" />

      <div className="relative flex h-full gap-4">
        <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-[24px] border border-white/10 bg-black/15 p-3">
          {badgeSrc ? (
            <img src={badgeSrc} alt={item.title} className="h-full w-full object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.35)]" />
          ) : (
            renderFallbackBadge(item.title)
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[22px] font-semibold leading-tight text-slate-100">{item.title}</div>
              <div className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.90)]">
                {item.description || 'Достижение за твой уникальный стиль общения.'}
              </div>
            </div>
            <StatusChip earned={item.earned} />
          </div>

          <div className="mt-auto flex items-end justify-between pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              score
            </div>
            <div className="text-[26px] font-bold leading-none text-slate-100">{item.score}</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Slide19Achievements({ report, exporting }: SlideCommonProps): JSX.Element {
  const rawAchievements = getAchievements(report)

  const { hero, unlockedCount, totalCount, completionPercent, visibleCards } = useMemo(() => {
    const normalized = rawAchievements
      .map((item) => normalizeAchievement(item))
      .filter((item) => item.id || item.title)
      .sort((a, b) => {
        if (a.earned !== b.earned) return a.earned ? -1 : 1
        if (a.score !== b.score) return b.score - a.score
        return a.title.localeCompare(b.title, 'ru')
      })

    const heroItem = pickHeroAchievement(normalized)
    const remaining = heroItem
      ? normalized.filter((item, idx) => !(idx === 0 && item.id === heroItem.id && item.title === heroItem.title))
      : normalized

    const cards = remaining.slice(0, 6)
    const unlocked = normalized.filter((item) => item.earned).length
    const total = normalized.length
    const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0

    return {
      hero: heroItem,
      unlockedCount: unlocked,
      totalCount: total,
      completionPercent: percent,
      visibleCards: cards
    }
  }, [rawAchievements])

  const heroBadgeSrc = hero ? resolveBadgeSrc(hero) : null

  return (
    <SlideFrame
      kicker="Achievements"
      title="Ачивки"
      subtitle="Твои титулы за стиль общения — в одном экране."
      footerHint={undefined}
    >
      <div className="flex h-full min-h-0 flex-col gap-6">
        {!hero ? (
          <div className="flex flex-1 items-center justify-center rounded-[44px] border border-white/10 bg-white/5 p-10 text-center text-[22px] text-[rgba(var(--tgwr-muted-rgb),0.92)]">
            Пока нет достижений для показа.
          </div>
        ) : (
          <>
            <motion.div
              initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: exporting ? 0 : 0.34, delay: exporting ? 0 : 0.04 }}
              className={[
                'relative overflow-hidden rounded-[44px] border p-8',
                hero.earned
                  ? 'border-[rgba(var(--tgwr-accent1-rgb),0.24)] bg-[linear-gradient(135deg,rgba(var(--tgwr-accent1-rgb),0.18),rgba(var(--tgwr-card-rgb),0.78)_55%,rgba(var(--tgwr-accent2-rgb),0.14))] shadow-[0_28px_80px_rgba(0,0,0,0.30)]'
                  : 'border-white/10 bg-[rgba(var(--tgwr-card-rgb),0.60)]'
              ].join(' ')}
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[rgba(var(--tgwr-accent2-rgb),0.18)] blur-[56px]" />
              <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-[rgba(var(--tgwr-accent1-rgb),0.14)] blur-[40px]" />

              <div className="relative grid h-full grid-cols-[1.2fr_0.8fr] gap-8">
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.76)]">
                        Hero achievement
                      </div>
                      <div className="mt-5 text-[56px] font-bold leading-[0.92] text-slate-100">{hero.title}</div>
                    </div>
                    <StatusChip earned={hero.earned} />
                  </div>

                  <div className="mt-5 max-w-[480px] text-[18px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.95)]">
                    {hero.description || 'Главный титул, который лучше всего описывает твой стиль общения.'}
                  </div>

                  <div className="mt-auto flex items-end justify-between pt-7">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                        score
                      </div>
                      <div className="mt-2 text-[74px] font-bold leading-none">
                        <span className="tgwr-gradient-text">{hero.score}</span>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-white/10 bg-black/15 px-5 py-4 text-right">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                        best title
                      </div>
                      <div className="mt-2 text-[18px] font-semibold text-slate-100">Твоя главная ачивка периода</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <div className="relative flex h-[300px] w-[300px] items-center justify-center rounded-[40px] border border-white/10 bg-[rgba(var(--tgwr-card-rgb),0.44)] p-8 backdrop-blur-sm">
                    <div className="pointer-events-none absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_center,rgba(var(--tgwr-accent1-rgb),0.16),transparent_65%)]" />
                    {heroBadgeSrc ? (
                      <img
                        src={heroBadgeSrc}
                        alt={hero.title}
                        className="relative h-full w-full object-contain drop-shadow-[0_18px_44px_rgba(0,0,0,0.42)]"
                      />
                    ) : (
                      <div className="relative h-full w-full">{renderFallbackBadge(hero.title)}</div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: exporting ? 0 : 0.3, delay: exporting ? 0 : 0.09 }}
              className="rounded-[34px] border border-white/10 bg-[rgba(var(--tgwr-card-rgb),0.50)] px-7 py-6"
            >
              <div className="flex items-end justify-between gap-6">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.76)]">
                    Progress
                  </div>
                  <div className="mt-2 text-[30px] font-semibold text-slate-100">
                    {unlockedCount} / {totalCount} unlocked
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    completion
                  </div>
                  <div className="mt-2 text-[30px] font-bold text-slate-100">{completionPercent}%</div>
                </div>
              </div>

              <div className="mt-5 h-4 overflow-hidden rounded-full border border-white/10 bg-black/15">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(var(--tgwr-accent1-rgb),0.95),rgba(var(--tgwr-accent2-rgb),0.95))] transition-all"
                  style={{ width: `${Math.max(6, completionPercent)}%` }}
                />
              </div>
            </motion.div>

            <div className="grid min-h-0 flex-1 grid-cols-2 gap-5">
              {visibleCards.map((item, idx) => (
                <GridCard
                  key={`${item.id}-${idx}`}
                  item={item}
                  index={idx}
                  exporting={exporting}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </SlideFrame>
  )
}
