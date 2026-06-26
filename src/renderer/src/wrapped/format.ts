export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function formatInt(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  try {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v)
  } catch {
    return String(Math.round(v))
  }
}

export function formatPercent01(ratio01: number): string {
  const r = Number.isFinite(ratio01) ? ratio01 : 0
  const p = Math.round(r * 1000) / 10
  return `${p.toFixed(p >= 10 ? 1 : 1)}%`
}

export function formatMonth(value: string): string {
  // value is usually YYYY-MM
  if (!value) return '—'
  const m = /^([0-9]{4})-([0-9]{2})$/.exec(value)
  if (!m) return value
  const year = Number(m[1])
  const month = Number(m[2])
  const names = [
    'январь',
    'февраль',
    'март',
    'апрель',
    'май',
    'июнь',
    'июль',
    'август',
    'сентябрь',
    'октябрь',
    'ноябрь',
    'декабрь'
  ]
  const name = names[month - 1]
  if (!name) return value
  return `${name} ${year}`
}

export function formatHour(value: string | number): string {
  const s = typeof value === 'number' ? String(value) : value
  const n = Number(s)
  if (!Number.isFinite(n)) return '—'
  const hh = clamp(Math.floor(n), 0, 23)
  return `${hh.toString().padStart(2, '0')}:00`
}

export function formatDateYYYYMMDD(value: string): string {
  // Keep it minimal but pretty.
  if (!value) return '—'
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value)
  if (!m) return value
  return `${m[3]}.${m[2]}.${m[1]}`
}

export function formatSecondsHuman(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  if (s < 60) return `${s}с`
  const mins = Math.floor(s / 60)
  const sec = s % 60
  if (mins < 60) return `${mins}м ${sec}с`
  const hrs = Math.floor(mins / 60)
  const min = mins % 60
  if (hrs < 24) return `${hrs}ч ${min}м`
  const days = Math.floor(hrs / 24)
  const h = hrs % 24
  return `${days}д ${h}ч`
}

export function ellipsize(text: string, max = 120): string {
  const t = text ?? ''
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

export type InsightConfidenceLike = 'exact' | 'behavioral' | 'heuristic' | string

export function formatInsightConfidence(value: InsightConfidenceLike): string {
  switch (value) {
    case 'exact':
      return 'точно посчитано'
    case 'behavioral':
      return 'поведенческий вывод'
    case 'heuristic':
      return 'легкая эвристика'
    default:
      return 'поведенческий вывод'
  }
}

export function formatPeriodHuman(period: 'year' | 'all_time'): string {
  return period === 'all_time' ? 'за все время' : 'за год'
}

export function formatInsightNoWinnerReason(reason: string | null): string {
  switch (reason) {
    case null:
      return ''
    case 'not_enough_large_dialogs':
      return 'Недостаточно крупных диалогов для честного вывода.'
    case 'not_enough_stable_dialogs':
      return 'Нет диалога, который прошел пороги стабильности.'
    case 'no_sustained_comeback_after_quality_gates':
      return 'Нет камбэка с достаточной активностью до и после паузы.'
    case 'no_meaningful_growth_after_quality_gates':
      return 'Нет роста, который проходит фильтр маленькой базы.'
    case 'no_meaningful_fade_after_quality_gates':
      return 'Нет заметного затухания после реальной активности.'
    case 'not_enough_reply_samples':
      return 'Недостаточно ответов для надежного ритма.'
    case 'not_enough_media_events':
      return 'Недостаточно медиа-сообщений.'
    case 'missing_insight':
      return 'Этот отчет был создан старой версией TGWR.'
    default:
      return 'Недостаточно данных для честного вывода.'
  }
}

export function formatInsightEvidenceLabel(key: string): string {
  switch (key) {
    case 'total_messages':
      return 'Сообщений'
    case 'active_days':
      return 'Активных дней'
    case 'active_months':
      return 'Активных месяцев'
    case 'balance_ratio':
      return 'Баланс'
    case 'stability_ratio':
      return 'Стабильность'
    case 'gap_days':
      return 'Пауза'
    case 'before_messages':
      return 'До паузы'
    case 'after_messages':
      return 'После паузы'
    case 'after_active_days':
      return 'Активных дней после'
    case 'from_datetime':
      return 'С какого момента'
    case 'to_datetime':
      return 'Возврат'
    case 'early_messages':
      return 'Раньше'
    case 'late_messages':
      return 'Позже'
    case 'change_messages':
      return 'Изменение'
    case 'change_ratio':
      return 'Мультипликатор'
    case 'messages':
      return 'Сообщений'
    case 'ratio':
      return 'Доля'
    case 'message_count':
      return 'Сообщений в сессии'
    case 'duration_seconds':
      return 'Длительность'
    case 'density_per_hour':
      return 'Плотность'
    case 'start_datetime':
      return 'Старт'
    case 'end_datetime':
      return 'Финиш'
    case 'median_reply_seconds':
      return 'Медианный ответ'
    case 'reply_samples':
      return 'Замеров'
    case 'rhythm':
      return 'Ритм'
    case 'sent_messages':
      return 'Отправлено'
    case 'received_messages':
      return 'Получено'
    case 'imbalance_ratio':
      return 'Дисбаланс'
    case 'days_started_by_them':
      return 'Начато собеседником'
    case 'days_started_by_you':
      return 'Начато тобой'
    case 'initiated_days':
      return 'Дней с первым сообщением'
    case 'them_ratio':
      return 'Доля собеседника'
    case 'restarts_by_them':
      return 'Возвратов собеседником'
    case 'restarts_by_you':
      return 'Возвратов тобой'
    case 'media_total':
      return 'Медиа'
    case 'top_media_type':
      return 'Главный тип'
    case 'top_media_count':
      return 'Главного типа'
    case 'media_ratio':
      return 'Доля медиа'
    default:
      return key
        .replaceAll('_', ' ')
        .replace(/^\w/, (char) => char.toUpperCase())
  }
}

export function formatEvidenceValue(key: string, value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (key === 'density_per_hour' && Number.isFinite(n)) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n)}/ч`
  }
  if (key === 'change_ratio' && Number.isFinite(n)) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n)}x`
  }
  if ((key === 'ratio' || key.endsWith('_ratio')) && Number.isFinite(n)) return formatPercent01(n)
  if (key.endsWith('_seconds') && Number.isFinite(n)) return formatSecondsHuman(n)
  if (key.endsWith('_days') && Number.isFinite(n)) return `${formatInt(n)} дн.`
  if (key === 'top_media_type' && typeof value === 'string') {
    const labels: Record<string, string> = {
      photo: 'фото',
      video: 'видео',
      voice: 'голосовые',
      sticker: 'стикеры',
      gif: 'GIF',
      file: 'файлы',
      other: 'другое'
    }
    return labels[value] ?? value
  }
  if (key === 'rhythm' && typeof value === 'string') {
    const labels: Record<string, string> = {
      fast: 'быстрый',
      measured: 'размеренный',
      slow: 'медленный',
      rare: 'редкий'
    }
    return labels[value] ?? value
  }
  if (typeof value === 'number' && Number.isFinite(value)) return formatInt(value)
  if (typeof value === 'string' && value.length > 0) return value
  return '—'
}
