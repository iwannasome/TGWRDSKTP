import { motion } from 'framer-motion'
import React from 'react'
import SlideFrame from '../SlideFrame'
import type { SlideCommonProps } from '../slideTypes'

export default function Slide20End(_props: SlideCommonProps): JSX.Element {
  return (
    <SlideFrame
      kicker="The end"
      title="Экспортируй / Поделись"
      subtitle="Report уже локально рядом с базой. Дальше — дело вкуса: скриншоты, запись экрана или просто сохранить для себя."
      footerHint="Спасибо, что используешь локальные инструменты."
    >
      <div className="flex h-full flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 }}
          className="rounded-[44px] border border-white/10 bg-white/5 p-10"
        >
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-7 py-7">
              <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Idea
              </div>
              <div className="mt-3 text-[18px] font-semibold text-slate-100">Сделай 3–5 скринов лучших слайдов</div>
              <div className="mt-3 text-[14px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.95)]">
                Это самый простой «шэринг» без интеграций.
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 px-7 py-7">
              <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Privacy
              </div>
              <div className="mt-3 text-[18px] font-semibold text-slate-100">Данные не уходят в сеть</div>
              <div className="mt-3 text-[14px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.95)]">
                Всё считается локально и хранится у тебя.
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-7">
            <div className="text-[13px] font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Next steps
            </div>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-slate-100/90">
              <li>Открой “Детали” и посмотри топ-10.</li>
              <li>Переключай период (All-time / Year) и сравнивай.</li>
              <li>Если что-то выглядит странно — проверь self_from_id / is_out.</li>
            </ul>
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}
