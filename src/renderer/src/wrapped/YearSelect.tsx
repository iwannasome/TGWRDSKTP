import { AnimatePresence, motion } from 'framer-motion'
import React, { useEffect, useId, useMemo, useRef, useState } from 'react'

export type YearOption = {
  year: number
  messages: number
}

export type YearCacheState = 'ready' | 'preparing' | 'idle'

type Props = {
  options: YearOption[]
  value?: number
  onChange: (year: number) => void
  cacheState?: Record<number, YearCacheState>
  loadingYear?: number
  disabled?: boolean
  variant?: 'rail' | 'setup'
}

function formatMessages(messages: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(Math.max(0, messages))} сообщений`
}

function cacheLabel(state: YearCacheState, loading: boolean): string {
  if (loading) return 'открываем'
  if (state === 'ready') return 'готово'
  if (state === 'preparing') return 'готовим'
  return 'по запросу'
}

export default function YearSelect({
  options,
  value,
  onChange,
  cacheState = {},
  loadingYear,
  disabled = false,
  variant = 'rail'
}: Props): JSX.Element {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.year === value))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const selected = options[selectedIndex]
  const compact = variant === 'rail'

  const triggerStatus = useMemo(() => {
    if (!selected) return ''
    return cacheLabel(cacheState[selected.year] ?? 'idle', loadingYear === selected.year)
  }, [cacheState, loadingYear, selected])

  const closeAndRestoreFocus = () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAndRestoreFocus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return
    setActiveIndex(selectedIndex)
    const frame = requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, selectedIndex])

  const moveFocus = (direction: 1 | -1) => {
    if (options.length === 0) return
    const next = (activeIndex + direction + options.length) % options.length
    setActiveIndex(next)
    optionRefs.current[next]?.focus()
  }

  const choose = (year: number) => {
    closeAndRestoreFocus()
    if (year !== value) onChange(year)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Выбрать год Wrapped"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setOpen(true)
        }}
        className={[
          'group flex w-full items-center justify-between gap-2 border text-left text-slate-100 outline-none transition',
          'border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.72)] hover:border-[rgba(var(--tgwr-accent1-rgb),0.34)] hover:bg-[rgba(var(--tgwr-surface-rgb),0.94)]',
          'focus-visible:border-[rgba(var(--tgwr-accent1-rgb),0.58)] focus-visible:ring-2 focus-visible:ring-[rgba(var(--tgwr-accent1-rgb),0.18)] disabled:cursor-not-allowed disabled:opacity-55',
          compact ? 'rounded-xl px-3 py-2' : 'mt-2 rounded-2xl px-4 py-3'
        ].join(' ')}
      >
        <span className="min-w-0">
          <span className={compact ? 'block text-[12px] font-bold' : 'block text-[15px] font-bold'}>{selected?.year ?? '—'}</span>
          {!compact && selected ? (
            <span className="mt-0.5 block truncate text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.75)]">{formatMessages(selected.messages)}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {compact ? (
            <span className="hidden text-[9px] font-semibold uppercase tracking-[0.08em] text-[rgba(var(--tgwr-muted-rgb),0.66)] xl:block">{triggerStatus}</span>
          ) : null}
          <svg className={`h-4 w-4 text-[rgba(var(--tgwr-muted-rgb),0.8)] transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={listboxId}
            role="listbox"
            aria-label="Годы Wrapped"
            initial={{ opacity: 0, y: compact ? 0 : -6, x: compact ? -6 : 0, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: compact ? 0 : -4, x: compact ? -4 : 0, scale: 0.985 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={[
              'absolute z-[240] overflow-hidden rounded-[22px] border border-[rgba(var(--tgwr-border-rgb),0.24)]',
              'bg-[rgba(var(--tgwr-card-rgb),0.98)] p-2 shadow-[0_26px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl',
              compact
                ? 'bottom-[calc(100%+12px)] left-1/2 w-[292px] -translate-x-1/2 md:bottom-auto md:left-[calc(100%+12px)] md:top-0 md:translate-x-0'
                : 'left-0 right-0 top-[calc(100%+10px)]'
            ].join(' ')}
          >
            <div className="px-3 pb-2 pt-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">Год Wrapped</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.62)]">Готовые годы открываются без повторного расчёта</div>
            </div>
            <div className="max-h-[320px] space-y-1 overflow-y-auto overscroll-contain">
              {options.map((option, index) => {
                const selectedOption = option.year === value
                const state = cacheState[option.year] ?? 'idle'
                const loading = loadingYear === option.year
                const preparing = state === 'preparing' || loading
                return (
                  <button
                    key={option.year}
                    ref={(node) => { optionRefs.current[index] = node }}
                    type="button"
                    role="option"
                    aria-selected={selectedOption}
                    onClick={() => choose(option.year)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault()
                        moveFocus(1)
                      } else if (event.key === 'ArrowUp') {
                        event.preventDefault()
                        moveFocus(-1)
                      } else if (event.key === 'Home') {
                        event.preventDefault()
                        setActiveIndex(0)
                        optionRefs.current[0]?.focus()
                      } else if (event.key === 'End') {
                        event.preventDefault()
                        const last = options.length - 1
                        setActiveIndex(last)
                        optionRefs.current[last]?.focus()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        closeAndRestoreFocus()
                      }
                    }}
                    className={[
                      'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left outline-none transition',
                      selectedOption
                        ? 'border-[rgba(var(--tgwr-accent1-rgb),0.34)] bg-[rgba(var(--tgwr-accent1-rgb),0.13)]'
                        : 'border-transparent hover:border-white/10 hover:bg-white/[0.055]',
                      'focus-visible:border-[rgba(var(--tgwr-accent1-rgb),0.48)] focus-visible:bg-white/[0.07]'
                    ].join(' ')}
                  >
                    <span className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold',
                      selectedOption ? 'border-[rgba(var(--tgwr-accent1-rgb),0.32)] bg-[rgba(var(--tgwr-accent1-rgb),0.16)] text-sky-100' : 'border-white/10 bg-white/[0.04] text-slate-400'
                    ].join(' ')}>
                      {selectedOption ? '✓' : String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold text-slate-100">{option.year}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[rgba(var(--tgwr-muted-rgb),0.68)]">{formatMessages(option.messages)}</span>
                    </span>
                    <span className={[
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em]',
                      state === 'ready' && !loading
                        ? 'border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-100/80'
                        : preparing
                          ? 'border-sky-300/15 bg-sky-300/[0.08] text-sky-100/80'
                          : 'border-white/10 bg-white/[0.035] text-slate-400'
                    ].join(' ')}>
                      <span className={[
                        'h-1.5 w-1.5 rounded-full',
                        state === 'ready' && !loading ? 'bg-emerald-300' : preparing ? 'animate-pulse bg-sky-300' : 'bg-slate-500'
                      ].join(' ')} />
                      {cacheLabel(state, loading)}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
