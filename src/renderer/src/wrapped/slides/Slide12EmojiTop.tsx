import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatInt, formatPercent01 } from '../format'
import { getEmojiTop, getPeriod, getSentMessages } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getNumber } from '../safe'

function moodForEmoji(emoji: string): string {
  if ('😂🤣😄😁😆🙂😊'.includes(emoji)) return 'смех'
  if ('❤️💜💙💕💖😍😘'.includes(emoji)) return 'тепло'
  if ('🔥⚡️✨💯'.includes(emoji)) return 'энергия'
  if ('😭😢💔😔'.includes(emoji)) return 'драма'
  return 'микс'
}

export default function Slide12EmojiTop({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const emojis = getEmojiTop(p).slice(0, 12)
  const sent = getSentMessages(p)
  const totalEmojis = getNumber(p, 'total_emojis_sent', 0)
  const withEmoji = getNumber(p, 'messages_with_emoji_count', 0)
  const streak = getNumber(p, 'emoji_streak_max_messages', 0)
  const rareFrequent = emojis[emojis.length - 1]
  const mood = emojis[0] ? moodForEmoji(emojis[0].emoji) : '—'

  return (
    <SlideFrame kicker="IW$" title={<span className="tgwr-gradient-text font-semibold">Эмодзи</span>} subtitle="Вместо тысячи слов" >
      <div className="flex h-full flex-col justify-center">
        <div className="rounded-[44px] border border-white/10 bg-white/5 p-10">
          {emojis.length === 0 ? (
            <div className="text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">
              Пока пусто — эмодзи не найдены.
            </div>
          ) : (
            /* Сетка 4 колонки — это 3 ряда для 12 элементов. Идеально для вертикального кадра. */
            <div className="grid grid-cols-4 gap-6">
              {emojis.map((e, idx) => (
                <div
                  key={`${e.emoji}-${idx}`}
                  data-tip={`${e.emoji} · ${formatInt(e.count)} раз · ${moodForEmoji(e.emoji)}`}
                  style={{ animationDelay: exporting ? undefined : `${Math.min(0.25, idx * 0.03)}s` }}
                  className="tgwr-info-card tgwr-hover-card rounded-3xl border border-white/10 bg-white/5 px-6 py-6"
                >
                  <div className="tgwr-pop-icon text-[44px]">
                    {e.emoji}
                  </div>
                  <div className="mt-2 text-[13px] font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                    Сколько:
                  </div>
                  <div className="mt-2 text-[18px] font-bold text-slate-50">
                    <AnimatedNumber value={e.count} exporting={exporting} duration={0.56} delay={0.08 + idx * 0.025} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-7 grid grid-cols-5 gap-4">
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">эмодзи на 100</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">
                <AnimatedNumber value={Math.round((totalEmojis * 100) / Math.max(1, sent))} exporting={exporting} duration={0.62} delay={0.34} />
              </div>
              <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.78)]">на 100 сообщений</div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">настроение</div>
              <div className="mt-2 text-[18px] font-bold text-slate-50">{mood}</div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">последний в топе</div>
              <div className="mt-2 text-[22px] leading-none">{rareFrequent?.emoji ?? '—'}</div>
              <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.78)]">
                <AnimatedNumber value={rareFrequent?.count ?? 0} exporting={exporting} duration={0.56} delay={0.38} />
              </div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">серия с эмодзи</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">
                <AnimatedNumber value={streak} exporting={exporting} duration={0.62} delay={0.42} />
              </div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">сообщений с эмодзи</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">
                <AnimatedNumber value={withEmoji / Math.max(1, sent)} exporting={exporting} duration={0.62} delay={0.46} format={formatPercent01} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SlideFrame>
  )
}
