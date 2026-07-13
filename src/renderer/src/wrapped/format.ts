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
    case 'minimum_messages_required':
      return 'Минимум сообщений'
    case 'active_days':
      return 'Активных дней'
    case 'total_active_days':
      return 'Всего активных дней'
    case 'active_months':
      return 'Активных месяцев'
    case 'observed_months':
      return 'Месяцев в окне'
    case 'coverage_ratio':
      return 'Покрытие месяцев'
    case 'minimum_coverage_ratio':
      return 'Минимальное покрытие'
    case 'minimum_active_months':
      return 'Минимум активных месяцев'
    case 'balance_ratio':
      return 'Баланс'
    case 'volume_component':
      return 'Вклад объёма'
    case 'active_days_component':
      return 'Вклад активных дней'
    case 'active_months_component':
      return 'Вклад месяцев'
    case 'stability_ratio':
      return 'Стабильность'
    case 'minimum_stability_ratio':
      return 'Минимальная стабильность'
    case 'average_monthly_messages':
      return 'В среднем за месяц'
    case 'monthly_deviation_ratio':
      return 'Среднее отклонение'
    case 'gap_days':
      return 'Пауза'
    case 'before_messages':
      return 'До паузы'
    case 'after_messages':
      return 'После паузы'
    case 'minimum_after_messages':
      return 'Минимум после паузы'
    case 'after_active_days':
      return 'Активных дней после'
    case 'reactivation_delta':
      return 'Прирост после паузы'
    case 'reactivation_ratio':
      return 'Рост после паузы'
    case 'from_datetime':
      return 'С какого момента'
    case 'to_datetime':
      return 'Возврат'
    case 'early_messages':
      return 'Раньше'
    case 'late_messages':
      return 'Позже'
    case 'early_monthly_rate':
      return 'Раньше в месяц'
    case 'late_monthly_rate':
      return 'Позже в месяц'
    case 'change_messages':
      return 'Изменение'
    case 'change_ratio':
      return 'Мультипликатор'
    case 'messages':
      return 'Сообщений'
    case 'minimum_window_messages':
      return 'Минимум в этом времени суток'
    case 'ratio':
      return 'Доля'
    case 'archive_baseline_ratio':
      return 'Обычная доля в архиве'
    case 'lift_vs_archive':
      return 'Выше обычного ритма'
    case 'message_count':
      return 'Сообщений в сессии'
    case 'duration_seconds':
      return 'Длительность'
    case 'density_per_hour':
      return 'Плотность'
    case 'observed_max_gap_seconds':
      return 'Максимальный разрыв'
    case 'session_gap_limit_seconds':
      return 'Допустимый разрыв'
    case 'maximum_session_seconds':
      return 'Лимит сессии'
    case 'start_datetime':
      return 'Старт'
    case 'end_datetime':
      return 'Финиш'
    case 'median_reply_seconds':
      return 'Медианный ответ'
    case 'reply_samples':
      return 'Замеров'
    case 'minimum_reply_samples':
      return 'Минимум замеров'
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
    case 'contact_starts_by_them':
      return 'Контактов начато собеседником'
    case 'contact_starts_by_you':
      return 'Контактов начато тобой'
    case 'contact_events':
      return 'Отдельных контактов'
    case 'minimum_contact_events':
      return 'Минимум контактов'
    case 'restart_events':
      return 'Возвратов после тишины'
    case 'minimum_restart_events':
      return 'Минимум возвратов'
    case 'dominant_side':
      return 'Чаще начинал'
    case 'dominance_ratio':
      return 'Доля ведущей стороны'
    case 'contact_gap_seconds':
      return 'Пауза между контактами'
    case 'silence_gap_seconds':
      return 'Порог тишины'
    case 'media_total':
      return 'Медиа'
    case 'top_media_type':
      return 'Главный тип'
    case 'top_media_count':
      return 'Главного типа'
    case 'media_ratio':
      return 'Доля медиа'
    case 'archive_media_ratio':
      return 'Доля медиа в архиве'
    case 'media_lift_vs_archive':
      return 'Выше средней доли'
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
  if ((key === 'change_ratio' || key === 'reactivation_ratio') && Number.isFinite(n)) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n)}x`
  }
  if ((key === 'early_monthly_rate' || key === 'late_monthly_rate') && Number.isFinite(n)) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n)}/мес.`
  }
  if (
    (key === 'ratio' || key.endsWith('_ratio') || key.endsWith('_component') || key === 'lift_vs_archive' || key === 'media_lift_vs_archive') &&
    Number.isFinite(n)
  ) return formatPercent01(n)
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
  if (key === 'dominant_side' && typeof value === 'string') {
    return value === 'them' ? 'собеседник' : value === 'you' ? 'ты' : value
  }
  if (typeof value === 'number' && Number.isFinite(value)) return formatInt(value)
  if (typeof value === 'string' && value.length > 0) return value
  return '—'
}
