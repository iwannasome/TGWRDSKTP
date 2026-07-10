import { motion } from 'framer-motion'
import React from 'react'
import SlideFrame from '../SlideFrame'
import type { SlideCommonProps } from '../slideTypes'

export default function Slide20End({ exporting }: SlideCommonProps): JSX.Element {
  return (
    <SlideFrame
      kicker="TGWR Export"
      title="Wrapped готов"
      subtitle="Сохрани слайды, собери PDF или открой детали — все результаты остаются локально."
      footerHint="Спасибо, что используешь локальные инструменты."
    >
      <div className="flex h-full flex-col justify-center">
        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: exporting ? 0 : 0.35, delay: exporting ? 0 : 0.06 }}
          className="tgwr-telegram-panel rounded-[30px] p-10"
        >
          <div className="grid grid-cols-3 gap-6">
            <div className="tgwr-info-card rounded-[24px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.46)] px-7 py-7">
              <div className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                PNG
              </div>
              <div className="mt-3 text-[18px] font-semibold text-slate-100">Экспорт всех слайдов</div>
              <div className="mt-3 text-[14px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.95)]">
                Подойдет для Stories, постов и быстрой отправки выбранных экранов.
              </div>
            </div>

            <div className="tgwr-info-card rounded-[24px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.46)] px-7 py-7">
              <div className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                PDF
              </div>
              <div className="mt-3 text-[18px] font-semibold text-slate-100">Один файл со всем Wrapped</div>
              <div className="mt-3 text-[14px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.95)]">
                Удобно оставить себе, переслать или открыть без приложения.
              </div>
            </div>

            <div className="tgwr-info-card rounded-[24px] border border-[rgba(var(--tgwr-accent1-rgb),0.20)] bg-[rgba(var(--tgwr-accent1-rgb),0.09)] px-7 py-7">
              <div className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Приватность
              </div>
              <div className="mt-3 text-[18px] font-semibold text-slate-100">Данные не уходят в сеть</div>
              <div className="mt-3 text-[14px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.95)]">
                Всё считается локально и хранится у тебя.
              </div>
            </div>
          </div>

          <div className="mt-8 tgwr-info-card rounded-[26px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-7">
            <div className="text-[14px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Что дальше
            </div>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-slate-100/90">
              <li>Открой “Детали”, чтобы посмотреть таблицы и топ-10.</li>
              <li>Переключи период и сравни весь архив с выбранным годом.</li>
              <li>Экспортируй PNG или PDF из панели слева.</li>
            </ul>
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}
