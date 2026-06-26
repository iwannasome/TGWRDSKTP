import { motion } from 'framer-motion'
import React from 'react'

type Props = {
  kicker?: string
  title: React.ReactNode
  subtitle?: string
  footerHint?: string
  children: React.ReactNode
}

export default function SlideFrame({ kicker, title, subtitle, footerHint, children }: Props): JSX.Element {
  return (
    <div
      className={[
        'tgwr-story-surface relative h-full w-full overflow-hidden rounded-[30px] border',
        'border-[rgba(var(--tgwr-border-rgb),0.18)]'
      ].join(' ')}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[7px] bg-[linear-gradient(90deg,rgba(var(--tgwr-accent1-rgb),0.92),rgba(var(--tgwr-accent2-rgb),0.78))]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_circle_at_78%_8%,rgba(var(--tgwr-accent1-rgb),0.10),transparent_48%)]" />

      <div className="relative flex h-full w-full flex-col px-[78px] py-[58px]">
        <div className="min-h-[116px]">
          {kicker ? (
            <div className="inline-flex rounded-full border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.92)]">
              {kicker}
            </div>
          ) : null}

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-5 max-w-[1320px] text-[60px] font-semibold leading-[0.98] text-slate-50"
          >
            {title}
          </motion.h2>

          {subtitle ? (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="mt-4 max-w-[940px] text-[18px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.92)]"
            >
              {subtitle}
            </motion.p>
          ) : null}
        </div>

        <div className="mt-8 min-h-0 flex-1">{children}</div>

        {footerHint ? (
          <div className="mt-6 text-[13px] font-medium text-[rgba(var(--tgwr-muted-rgb),0.72)]">{footerHint}</div>
        ) : null}
      </div>
    </div>
  )
}
