import { asNumber, asRecord, asString, getArray, getNumber, getRecord, getString, isRecord } from './safe'

export type PeriodKey = 'all_time' | 'year'
export type UnknownReport = unknown
export type DailyActivityPoint = { date: string; count: number }
export type HourlyActivityPoint = { hour: number; count: number }
export type PersonCountItem = { value: string; count: number }
export type PersonWordItem = { word: string; count: number }
export type PersonEmojiItem = { emoji: string; count: number }
export type PersonLongestMessage = {
  lengthChars: number
  snippet: string
  direction: 'out' | 'in' | ''
  dateTs: number
}
export type PersonPeriodAnalytics = {
  peerFromId: string
  displayName: string
  totalMessages: number
  sentMessages: number
  receivedMessages: number
  sentRatio: number
  receivedRatio: number
  mutualityAbsDiff: number
  mutualityImbalanceRatio: number
  firstTs: number
  lastTs: number
  firstDate: string
  lastDate: string
  timeSpanDays: number
  activeDays: number
  messagesPerActiveDay: number
  nightMessages: number
  dayMessages: number
  nightRatio: number
  dayRatio: number
  monthActivity: PersonCountItem[]
  peakMonth: PersonCountItem | null
  hourlyActivity: HourlyActivityPoint[]
  peakHour: HourlyActivityPoint | null
  mediaCounts: Record<string, number>
  mediaTotal: number
  topWords: PersonWordItem[]
  topEmojis: PersonEmojiItem[]
  totalWords: number
  uniqueWords: number
  totalEmojis: number
  messagesWithEmojiCount: number
  topLongestMessages: PersonLongestMessage[]
  daysStartedByYou: number
  daysStartedByThem: number
  initiatedDays: number
  youInitiatedRatio: number
  yourMedianReplySeconds: number
  theirMedianReplySeconds: number
  yourReplySamples: number
  theirReplySamples: number
  medianReplyTimeToOthersSeconds: number
  replySamples: number
}
export type PersonAnalytics = {
  peerFromId: string
  displayName: string
  periods: Partial<Record<PeriodKey, PersonPeriodAnalytics>>
}

export const CONVERSATION_INSIGHT_KEYS = [
  'main_person',
  'stable_dialog',
  'comeback',
  'closer_dialog',
  'faded_dialog',
  'night_companion',
  'day_anchor',
  'alive_dialog',
  'longest_live_session',
  'reply_rhythm',
  'mutual_dialog',
  'contact_initiator',
  'silence_restarter',
  'media_bond'
] as const

export type ConversationInsightKind = (typeof CONVERSATION_INSIGHT_KEYS)[number]
export type ConversationInsightConfidence = 'exact' | 'behavioral' | 'heuristic'

export type ConversationInsightWinner = {
  peerFromId: string
  displayName: string
  totalMessages: number
}

export type ConversationInsightCandidate = ConversationInsightWinner & {
  score: number
  evidence: Record<string, unknown>
}

export type ConversationInsight = {
  kind: ConversationInsightKind
  title: string
  confidence: ConversationInsightConfidence
  winner: ConversationInsightWinner | null
  score: number
  evidence: Record<string, unknown>
  candidates: ConversationInsightCandidate[]
  noWinnerReason: string | null
}

export type ConversationInsights = Record<ConversationInsightKind, ConversationInsight>
export type SharePrivacyOptions = {
  hideNames: boolean
  hideMessageText: boolean
  hideExactDates: boolean
}

const DEFAULT_CONFIDENCE: ConversationInsightConfidence = 'behavioral'

export function asReport(data: unknown): Record<string, unknown> | null {
  return asRecord(data)
}

export function getMeta(report: unknown): Record<string, unknown> {
  return asRecord(isRecord(report) ? report.meta : null) ?? {}
}

export function getYearLabel(report: unknown): string {
  const meta = getMeta(report)
  const y = meta.msk_year_used
  return typeof y === 'number' && Number.isFinite(y) ? String(y) : 'YEAR'
}

export function getPeriod(report: unknown, period: PeriodKey): Record<string, unknown> {
  const periods = isRecord(report) ? report.periods : null
  if (!isRecord(periods)) return {}
  const p = periods[period]
  return asRecord(p) ?? {}
}

function isConversationInsightKind(value: string): value is ConversationInsightKind {
  return (CONVERSATION_INSIGHT_KEYS as readonly string[]).includes(value)
}

function normalizeConfidence(value: unknown): ConversationInsightConfidence {
  return value === 'exact' || value === 'behavioral' || value === 'heuristic' ? value : DEFAULT_CONFIDENCE
}

function defaultInsight(kind: ConversationInsightKind): ConversationInsight {
  return {
    kind,
    title: kind,
    confidence: DEFAULT_CONFIDENCE,
    winner: null,
    score: 0,
    evidence: {},
    candidates: [],
    noWinnerReason: 'missing_insight'
  }
}

function normalizeInsightWinner(value: unknown): ConversationInsightWinner | null {
  const obj = asRecord(value)
  if (!obj) return null
  const peerFromId = getString(obj, 'peer_from_id', '') || getString(obj, 'peerFromId', '')
  const displayName = getString(obj, 'display_name', '') || getString(obj, 'displayName', '') || peerFromId
  if (!peerFromId && !displayName) return null
  return {
    peerFromId,
    displayName,
    totalMessages: getNumber(obj, 'total_messages', getNumber(obj, 'totalMessages', 0))
  }
}

function normalizeInsightCandidate(value: unknown): ConversationInsightCandidate | null {
  const obj = asRecord(value)
  if (!obj) return null
  const winner = normalizeInsightWinner(obj)
  if (!winner) return null
  return {
    ...winner,
    score: getNumber(obj, 'score', 0),
    evidence: getRecord(obj, 'evidence') ?? {}
  }
}

function normalizeConversationInsight(kind: ConversationInsightKind, value: unknown): ConversationInsight {
  const obj = asRecord(value)
  if (!obj) return defaultInsight(kind)
  const rawKind = getString(obj, 'kind', kind)
  const normalizedKind = isConversationInsightKind(rawKind) ? rawKind : kind
  const candidates = getArray(obj, 'candidates')
    .map(normalizeInsightCandidate)
    .filter((item): item is ConversationInsightCandidate => item !== null)

  return {
    kind: normalizedKind,
    title: getString(obj, 'title', kind),
    confidence: normalizeConfidence(obj.confidence),
    winner: normalizeInsightWinner(obj.winner),
    score: getNumber(obj, 'score', 0),
    evidence: getRecord(obj, 'evidence') ?? {},
    candidates,
    noWinnerReason: obj.no_winner_reason === null ? null : getString(obj, 'no_winner_reason', getString(obj, 'noWinnerReason', 'missing_reason'))
  }
}

export function getConversationInsights(report: unknown, period: PeriodKey): ConversationInsights {
  const p = getPeriod(report, period)
  const raw = getRecord(p, 'conversation_insights')
  const out = {} as ConversationInsights
  for (const kind of CONVERSATION_INSIGHT_KEYS) {
    out[kind] = normalizeConversationInsight(kind, raw?.[kind])
  }
  return out
}

export function getConversationInsight(report: unknown, period: PeriodKey, kind: ConversationInsightKind): ConversationInsight {
  return getConversationInsights(report, period)[kind]
}

export function getDeckConversationInsights(report: unknown, period: PeriodKey): ConversationInsight[] {
  const insights = getConversationInsights(report, period)
  const preferred: ConversationInsightKind[] = [
    'main_person',
    'comeback',
    'closer_dialog',
    'stable_dialog',
    'night_companion',
    'media_bond',
    'alive_dialog',
    'longest_live_session',
    'mutual_dialog',
    'silence_restarter',
    'contact_initiator',
    'faded_dialog'
  ]

  const selected: ConversationInsight[] = []
  const appearances = new Map<string, number>()
  const sessionKinds = new Set<ConversationInsightKind>()

  for (const kind of preferred) {
    const insight = insights[kind]
    const winner = insight.winner
    if (!winner || winner.totalMessages <= 0) continue

    if ((kind === 'alive_dialog' || kind === 'longest_live_session') && sessionKinds.size > 0) continue

    const peerKey = winner.peerFromId || winner.displayName
    const previousAppearances = appearances.get(peerKey) ?? 0
    if (previousAppearances >= 2) continue

    selected.push(insight)
    appearances.set(peerKey, previousAppearances + 1)
    if (kind === 'alive_dialog' || kind === 'longest_live_session') sessionKinds.add(kind)
    if (selected.length >= 4) break
  }

  return selected
}

export function sanitizeReportForSharing(report: unknown, options: SharePrivacyOptions): unknown {
  const nameMap = new Map<string, string>()
  const peerMap = new Map<string, string>()

  const anonymousName = (value: string): string => {
    const key = value.trim() || 'unknown'
    const existing = nameMap.get(key)
    if (existing) return existing
    const label = `Собеседник ${nameMap.size + 1}`
    nameMap.set(key, label)
    return label
  }

  const anonymousPeer = (value: string): string => {
    const key = value.trim() || 'unknown'
    const existing = peerMap.get(key)
    if (existing) return existing
    const label = `anonymous-peer-${peerMap.size + 1}`
    peerMap.set(key, label)
    return label
  }

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((item) => walk(item))
    if (!isRecord(value)) return value

    const out: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(value)) {
      const normalizedKey = childKey.toLowerCase()

      if (
        options.hideNames &&
        typeof childValue === 'string' &&
        (normalizedKey === 'display_name' || normalizedKey === 'displayname' || normalizedKey === 'chat_name' || normalizedKey === 'from_name')
      ) {
        out[childKey] = anonymousName(childValue)
        continue
      }

      if (
        options.hideNames &&
        typeof childValue === 'string' &&
        (normalizedKey === 'peer_from_id' || normalizedKey === 'peerfromid' || normalizedKey === 'self_from_id')
      ) {
        out[childKey] = anonymousPeer(childValue)
        continue
      }

      if (
        options.hideMessageText &&
        (normalizedKey.includes('snippet') || normalizedKey === 'text' || normalizedKey === 'message_text')
      ) {
        out[childKey] = typeof childValue === 'string' && childValue ? 'Текст скрыт для публикации' : childValue
        continue
      }

      if (
        options.hideExactDates &&
        (normalizedKey.includes('datetime') || normalizedKey.endsWith('_date') || normalizedKey === 'date')
      ) {
        out[childKey] = null
        continue
      }

      out[childKey] = walk(childValue)
    }
    return out
  }

  return walk(report)
}

export function getTotalMessages(p: Record<string, unknown>): number {
  // Worker uses total_messages.
  return getNumber(p, 'total_messages', 0)
}

export function getSentMessages(p: Record<string, unknown>): number {
  return getNumber(p, 'sent_messages', 0)
}

export function getReceivedMessages(p: Record<string, unknown>): number {
  return getNumber(p, 'received_messages', 0)
}

export function getMostActiveMonth(p: Record<string, unknown>): { value: string; count: number } | null {
  const m = getRecord(p, 'most_active_month')
  if (!m) return null
  return { value: getString(m, 'value', ''), count: getNumber(m, 'count', 0) }
}

export function getMostActiveHour(p: Record<string, unknown>): { value: string; count: number } | null {
  const m = getRecord(p, 'most_active_hour')
  if (!m) return null
  return { value: getString(m, 'value', ''), count: getNumber(m, 'count', 0) }
}

export function getMostActiveDay(p: Record<string, unknown>): { value: string; count: number } | null {
  const m = getRecord(p, 'most_active_day')
  if (!m) return null
  return { value: getString(m, 'value', ''), count: getNumber(m, 'count', 0) }
}

export function getActiveDaysCount(p: Record<string, unknown>): number {
  return getNumber(p, 'active_days_count', 0)
}

/**
 * Return daily activity for a period. The worker emits this as an array of objects
 * like { date: 'YYYY-MM-DD', count: N }. When not present or malformed
 * returns an empty array. If the array contains numbers instead of objects
 * it will treat each index as that day's count.
 */
export function getDailyActivity(p: Record<string, unknown>): DailyActivityPoint[] {
  const arr = getArray(p, 'daily_activity')
  const out: DailyActivityPoint[] = []

  for (let i = 0; i < arr.length; i += 1) {
    const item = arr[i]

    if (typeof item === 'number') {
      out.push({ date: String(i), count: asNumber(item, 0) })
      continue
    }

    const rec = asRecord(item)
    if (!rec) continue

    const date = getString(rec, 'date', '')
    const count = getNumber(rec, 'count', 0)
    out.push({ date, count })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Return hourly activity for a period. The worker emits this as either an array of
 * objects like { hour: 0, count: N } or a plain array of counts indexed by hour.
 * Always returns a normalized 24-hour array.
 */
export function getHourlyActivity(p: Record<string, unknown>): HourlyActivityPoint[] {
  const arr = getArray(p, 'hourly_activity')
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))

  for (let i = 0; i < arr.length; i += 1) {
    const item = arr[i]

    if (typeof item === 'number') {
      if (i >= 0 && i < 24) byHour[i] = { hour: i, count: asNumber(item, 0) }
      continue
    }

    const rec = asRecord(item)
    if (!rec) continue

    const hour = getNumber(rec, 'hour', i)
    const count = getNumber(rec, 'count', 0)

    if (hour >= 0 && hour < 24) byHour[hour] = { hour, count }
  }

  return byHour
}

export function getNightRatio(p: Record<string, unknown>): { count: number; ratio: number } {
  return {
    count: getNumber(p, 'night_messages_count', 0),
    ratio: getNumber(p, 'night_messages_ratio', 0)
  }
}

export function getTop10(p: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const arr = getArray(p, key)
  return arr.map((x) => asRecord(x) ?? {}).filter((x) => Object.keys(x).length > 0)
}

export function pickFirst(arr: Record<string, unknown>[]): Record<string, unknown> | null {
  return arr.length > 0 ? arr[0] : null
}

export function getPersonName(item: Record<string, unknown> | null): string {
  if (!item) return '—'
  const dn = getString(item, 'display_name', '')
  if (dn) return dn
  const pid = getString(item, 'peer_from_id', '')
  if (pid) return pid
  return '—'
}

export function getPersonId(item: Record<string, unknown> | null): string {
  if (!item) return ''
  return getString(item, 'peer_from_id', '')
}

function getDateFromTs(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  try {
    return new Date(ts * 1000).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function getPersonCountItems(obj: Record<string, unknown>, key: string, valueKey: string): PersonCountItem[] {
  const out: PersonCountItem[] = []
  for (const item of getArray(obj, key)) {
    const rec = asRecord(item)
    if (!rec) continue
    const value = getString(rec, valueKey, '')
    const count = getNumber(rec, 'count', 0)
    if (!value || count <= 0) continue
    out.push({ value, count })
  }
  return out
}

function getHourlyItems(obj: Record<string, unknown>): HourlyActivityPoint[] {
  const arr = getArray(obj, 'hourly_activity')
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))

  for (let i = 0; i < arr.length; i += 1) {
    const rec = asRecord(arr[i])
    if (!rec) continue
    const hour = getNumber(rec, 'hour', i)
    const count = getNumber(rec, 'count', 0)
    if (hour >= 0 && hour < 24) byHour[hour] = { hour, count }
  }

  return byHour
}

function getPeakHour(obj: Record<string, unknown>, hourly: HourlyActivityPoint[]): HourlyActivityPoint | null {
  const peak = getRecord(obj, 'peak_hour')
  if (peak) {
    return { hour: getNumber(peak, 'hour', 0), count: getNumber(peak, 'count', 0) }
  }

  const best = hourly.reduce<HourlyActivityPoint | null>((acc, item) => {
    if (!acc || item.count > acc.count) return item
    return acc
  }, null)

  return best && best.count > 0 ? best : null
}

function getPersonMediaCounts(obj: Record<string, unknown>): Record<string, number> {
  const media = getRecord(obj, 'media_counts')
  const keys = ['photo', 'video', 'voice', 'sticker', 'gif', 'file', 'other']
  return Object.fromEntries(keys.map((key) => [key, getNumber(media ?? {}, key, 0)]))
}

function normalizePersonPeriod(
  obj: Record<string, unknown> | null,
  fallbackPeerFromId: string,
  fallbackDisplayName: string
): PersonPeriodAnalytics | null {
  if (!obj) return null

  const peerFromId = getString(obj, 'peer_from_id', fallbackPeerFromId) || fallbackPeerFromId
  const displayName = getString(obj, 'display_name', fallbackDisplayName) || fallbackDisplayName || peerFromId
  const totalMessages = getNumber(obj, 'total_messages', 0)
  const sentMessages = getNumber(obj, 'sent_messages', 0)
  const receivedMessages = getNumber(obj, 'received_messages', 0)
  if (totalMessages <= 0 && sentMessages <= 0 && receivedMessages <= 0) return null

  const firstTs = getNumber(obj, 'first_ts', 0)
  const lastTs = getNumber(obj, 'last_ts', 0)
  const monthActivity = getPersonCountItems(obj, 'month_activity', 'value')
  const peakMonthObj = getRecord(obj, 'peak_month')
  const peakMonth = peakMonthObj
    ? { value: getString(peakMonthObj, 'value', ''), count: getNumber(peakMonthObj, 'count', 0) }
    : monthActivity.reduce<PersonCountItem | null>((acc, item) => (!acc || item.count > acc.count ? item : acc), null)
  const hourlyActivity = getHourlyItems(obj)
  const mediaCounts = getPersonMediaCounts(obj)
  const mediaTotal = getNumber(obj, 'media_total', Object.values(mediaCounts).reduce((sum, value) => sum + value, 0))

  const topWords = getArray(obj, 'top_words')
    .map((item) => {
      const rec = asRecord(item)
      if (!rec) return null
      const word = getString(rec, 'word', '')
      const count = getNumber(rec, 'count', 0)
      return word && count > 0 ? { word, count } : null
    })
    .filter((item): item is PersonWordItem => Boolean(item))

  const topEmojis = getArray(obj, 'top_emojis')
    .map((item) => {
      const rec = asRecord(item)
      if (!rec) return null
      const emoji = getString(rec, 'emoji', '')
      const count = getNumber(rec, 'count', 0)
      return emoji && count > 0 ? { emoji, count } : null
    })
    .filter((item): item is PersonEmojiItem => Boolean(item))

  const topLongestMessages = getArray(obj, 'top_longest_messages')
    .map((item) => {
      const rec = asRecord(item)
      if (!rec) return null
      const direction = getString(rec, 'direction', '')
      return {
        lengthChars: getNumber(rec, 'length_chars', 0),
        snippet: getString(rec, 'snippet', ''),
        direction: direction === 'out' || direction === 'in' ? direction : '',
        dateTs: getNumber(rec, 'date_ts', 0)
      }
    })
    .filter((item): item is PersonLongestMessage => item !== null && (item.lengthChars > 0 || item.snippet.length > 0))

  return {
    peerFromId,
    displayName,
    totalMessages,
    sentMessages,
    receivedMessages,
    sentRatio: getNumber(obj, 'sent_ratio', totalMessages > 0 ? sentMessages / totalMessages : 0),
    receivedRatio: getNumber(obj, 'received_ratio', totalMessages > 0 ? receivedMessages / totalMessages : 0),
    mutualityAbsDiff: getNumber(obj, 'mutuality_abs_diff', Math.abs(sentMessages - receivedMessages)),
    mutualityImbalanceRatio: getNumber(obj, 'mutuality_imbalance_ratio', totalMessages > 0 ? Math.abs(sentMessages - receivedMessages) / totalMessages : 0),
    firstTs,
    lastTs,
    firstDate: getString(obj, 'first_date', '') || getDateFromTs(firstTs),
    lastDate: getString(obj, 'last_date', '') || getDateFromTs(lastTs),
    timeSpanDays: getNumber(obj, 'time_span_days', 0),
    activeDays: getNumber(obj, 'active_days', 0),
    messagesPerActiveDay: getNumber(obj, 'messages_per_active_day', 0),
    nightMessages: getNumber(obj, 'night_messages', 0),
    dayMessages: getNumber(obj, 'day_messages', 0),
    nightRatio: getNumber(obj, 'night_ratio', totalMessages > 0 ? getNumber(obj, 'night_messages', 0) / totalMessages : 0),
    dayRatio: getNumber(obj, 'day_ratio', totalMessages > 0 ? getNumber(obj, 'day_messages', 0) / totalMessages : 0),
    monthActivity,
    peakMonth: peakMonth && peakMonth.value ? peakMonth : null,
    hourlyActivity,
    peakHour: getPeakHour(obj, hourlyActivity),
    mediaCounts,
    mediaTotal,
    topWords,
    topEmojis,
    totalWords: getNumber(obj, 'total_words', 0),
    uniqueWords: getNumber(obj, 'unique_words', 0),
    totalEmojis: getNumber(obj, 'total_emojis', 0),
    messagesWithEmojiCount: getNumber(obj, 'messages_with_emoji_count', 0),
    topLongestMessages,
    daysStartedByYou: getNumber(obj, 'days_started_by_you', 0),
    daysStartedByThem: getNumber(obj, 'days_started_by_them', 0),
    initiatedDays: getNumber(obj, 'initiated_days', 0),
    youInitiatedRatio: getNumber(obj, 'you_initiated_ratio', 0),
    yourMedianReplySeconds: getNumber(obj, 'your_median_reply_seconds', getNumber(obj, 'median_reply_time_to_others_seconds', 0)),
    theirMedianReplySeconds: getNumber(obj, 'their_median_reply_seconds', 0),
    yourReplySamples: getNumber(obj, 'your_reply_samples', getNumber(obj, 'reply_samples', 0)),
    theirReplySamples: getNumber(obj, 'their_reply_samples', 0),
    medianReplyTimeToOthersSeconds: getNumber(obj, 'median_reply_time_to_others_seconds', 0),
    replySamples: getNumber(obj, 'reply_samples', 0)
  }
}

export function getPeopleAnalytics(report: unknown): PersonAnalytics[] {
  if (!isRecord(report)) return []

  const detailed = Array.isArray(report.people_analytics) ? report.people_analytics : []
  const fallback = Array.isArray(report.top_people) ? report.top_people : []
  const source = detailed.length > 0 ? detailed : fallback

  const out: PersonAnalytics[] = []
  for (const item of source) {
    const rec = asRecord(item)
    if (!rec) continue

    const peerFromId = getString(rec, 'peer_from_id', '')
    const displayName = getString(rec, 'display_name', '') || peerFromId
    const periodsRaw = getRecord(rec, 'periods')
    const allTime = normalizePersonPeriod(getRecord(periodsRaw ?? {}, 'all_time'), peerFromId, displayName)
    const year = normalizePersonPeriod(getRecord(periodsRaw ?? {}, 'year'), peerFromId, displayName)

    if (!allTime && !year) continue
    out.push({
      peerFromId,
      displayName,
      periods: {
        all_time: allTime ?? undefined,
        year: year ?? undefined
      }
    })
  }

  out.sort((a, b) => {
    const aTotal = a.periods.all_time?.totalMessages ?? a.periods.year?.totalMessages ?? 0
    const bTotal = b.periods.all_time?.totalMessages ?? b.periods.year?.totalMessages ?? 0
    return bTotal - aTotal
  })
  return out
}

export function getReplyChampion(
  p: Record<string, unknown>,
  key: 'who_you_reply_fastest' | 'who_you_ignore_most'
): {
  name: string
  seconds: number
  samples: number
  totalMessages: number
  minimumMessagesRequired: number
  deltaVsGlobalSeconds: number
  deltaVsQualifiedMedianSeconds: number
} | null {
  const obj = getRecord(p, key)
  if (!obj) return null
  const name = getString(obj, 'display_name', '') || getString(obj, 'peer_from_id', '')
  const seconds = getNumber(obj, 'median_reply_seconds', 0)
  if (!name) return null
  return {
    name,
    seconds,
    samples: getNumber(obj, 'reply_samples', 0),
    totalMessages: getNumber(obj, 'total_messages', 0),
    minimumMessagesRequired: getNumber(obj, 'minimum_messages_required', 0),
    deltaVsGlobalSeconds: getNumber(obj, 'delta_vs_global_seconds', 0),
    deltaVsQualifiedMedianSeconds: getNumber(obj, 'delta_vs_qualified_median_seconds', 0)
  }
}

export function getDayNightPerson(
  p: Record<string, unknown>,
  key: 'day_person' | 'night_person'
): {
  name: string
  messages: number
  totalMessages: number
  dayRatio: number
  nightRatio: number
  dayPeakHour: Record<string, unknown> | null
  nightPeakHour: Record<string, unknown> | null
  dayPeakDate: Record<string, unknown> | null
  nightPeakDate: Record<string, unknown> | null
  dayWeekdayMessages: number
  dayWeekendMessages: number
  postMidnightMessages: number
  dayBondScore: number
  nightBondScore: number
} | null {
  const obj = getRecord(p, key)
  if (!obj) return null
  const name = getString(obj, 'display_name', '') || getString(obj, 'peer_from_id', '')
  const messages = getNumber(obj, 'messages', 0)
  if (!name) return null
  return {
    name,
    messages,
    totalMessages: getNumber(obj, 'total_messages', 0),
    dayRatio: getNumber(obj, 'day_ratio', 0),
    nightRatio: getNumber(obj, 'night_ratio', 0),
    dayPeakHour: getRecord(obj, 'day_peak_hour'),
    nightPeakHour: getRecord(obj, 'night_peak_hour'),
    dayPeakDate: getRecord(obj, 'day_peak_date'),
    nightPeakDate: getRecord(obj, 'night_peak_date'),
    dayWeekdayMessages: getNumber(obj, 'day_weekday_messages', 0),
    dayWeekendMessages: getNumber(obj, 'day_weekend_messages', 0),
    postMidnightMessages: getNumber(obj, 'post_midnight_messages', 0),
    dayBondScore: getNumber(obj, 'day_bond_score', 0),
    nightBondScore: getNumber(obj, 'night_bond_score', 0)
  }
}

export function getLongestMessage(p: Record<string, unknown>): {
  length: number
  snippet: string
  name: string
} | null {
  const obj = getRecord(p, 'longest_message_sent')
  if (!obj) return null
  const length = getNumber(obj, 'length_chars', 0)
  const snippet = getString(obj, 'snippet', '')
  const name = getString(obj, 'display_name', '') || getString(obj, 'peer_from_id', '')
  if (!snippet && length <= 0) return null
  return { length, snippet, name: name || '—' }
}

export function getTopLongestMessages(p: Record<string, unknown>): Array<{
  length: number
  snippet: string
  name: string
}> {
  const arr = getArray(p, 'top_longest_messages_sent')
  const out: Array<{ length: number; snippet: string; name: string }> = []

  for (const item of arr) {
    const obj = asRecord(item)
    if (!obj) continue
    const length = getNumber(obj, 'length_chars', 0)
    const snippet = getString(obj, 'snippet', '')
    const name = getString(obj, 'display_name', '') || getString(obj, 'peer_from_id', '') || '—'
    if (!snippet && length <= 0) continue
    out.push({
      length,
      snippet,
      name
    })
  }

  if (out.length > 0) return out.slice(0, 5)

  const fallback = getLongestMessage(p)
  return fallback ? [fallback] : []
}

export function getLongestStreak(p: Record<string, unknown>): {
  days: number
  start: string
  end: string
  runnerUpDays: number
} | null {
  const obj = getRecord(p, 'longest_streak_days')
  if (!obj) return null
  const days = getNumber(obj, 'length_days', 0)
  const start = getString(obj, 'start_date', '')
  const end = getString(obj, 'end_date', '')
  if (days <= 0) return null
  const runner = getRecord(obj, 'runner_up')
  return { days, start, end, runnerUpDays: getNumber(runner ?? {}, 'length_days', 0) }
}

export function getLongestPersonStreak(
  report: unknown,
  period: PeriodKey
): { lengthDays: number; start: string; end: string; peerFromId: string; displayName: string } | null {
  const p = getPeriod(report, period)
  const s = getRecord(p, 'longest_person_streak')
  if (!s) return null

  const lengthDays = getNumber(s, 'length_days', 0)
  if (!Number.isFinite(lengthDays) || lengthDays <= 0) return null

  const peerFromId = getString(s, 'peer_from_id')
  const displayName = getString(s, 'display_name') || peerFromId || 'Unknown'
  const start = getString(s, 'start_date')
  const end = getString(s, 'end_date')

  return { lengthDays, start, end, peerFromId, displayName }
}

export function getLongestSilence(p: Record<string, unknown>): {
  gapSeconds: number
  chatName: string
  fromDatetime: string
  toDatetime: string
  calendarDays: number
  medianGapSeconds: number
  gapVsMedianRatio: number
  chatMessageCount: number
  minimumMessagesRequired: number
} | null {
  const obj = getRecord(p, 'longest_silence_gap')
  if (!obj) return null
  const gapSeconds = getNumber(obj, 'gap_seconds', 0)
  const chatName = getString(obj, 'chat_name', '')
  if (gapSeconds <= 0) return null
  return {
    gapSeconds,
    chatName: chatName || '—',
    fromDatetime: getString(obj, 'from_datetime', ''),
    toDatetime: getString(obj, 'to_datetime', ''),
    calendarDays: getNumber(obj, 'calendar_days', 0),
    medianGapSeconds: getNumber(obj, 'median_gap_seconds', 0),
    gapVsMedianRatio: getNumber(obj, 'gap_vs_median_ratio', 0),
    chatMessageCount: getNumber(obj, 'chat_message_count', 0),
    minimumMessagesRequired: getNumber(obj, 'minimum_messages_required', 3000)
  }
}

export function getMediaCounts(p: Record<string, unknown>): Record<string, number> {
  const obj = getRecord(p, 'media_counts')
  const get = (k: string) => getNumber(obj ?? {}, k, 0)
  return {
    photo: get('photo'),
    video: get('video'),
    voice: get('voice'),
    sticker: get('sticker'),
    gif: get('gif'),
    file: get('file'),
    other: get('other')
  }
}

export function getEmojiTop(p: Record<string, unknown>): { emoji: string; count: number }[] {
  const arr = getArray(p, 'top_emojis')
  const out: { emoji: string; count: number }[] = []
  for (const it of arr) {
    const obj = asRecord(it)
    if (!obj) continue
    const emoji = asString(obj.emoji, '')
    const count = asNumber(obj.count, 0)
    if (!emoji) continue
    out.push({ emoji, count })
  }
  return out
}

export function getWordCloud(p: Record<string, unknown>): { word: string; weight: number }[] {
  const cloud: Record<string, unknown> | null = getRecord(p, 'word_cloud')
  const out: { word: string; weight: number }[] = []

  if (cloud) {
    for (const [k, v] of Object.entries(cloud)) {
      const w = asNumber(v, 0)
      if (!k || w <= 0) continue
      out.push({ word: k, weight: w })
    }
  }

  // Fallback: top_words: array of {word,count}
  if (out.length === 0) {
    const arr = getArray(p, 'top_words')
    for (const it of arr) {
      const obj = asRecord(it)
      if (!obj) continue
      const word = getString(obj, 'word', '')
      const weight = getNumber(obj, 'count', 0)
      if (!word || weight <= 0) continue
      out.push({ word, weight })
    }
  }

  out.sort((a, b) => b.weight - a.weight)
  return out
}

export function getAchievements(report: unknown): Record<string, unknown>[] {
  if (!isRecord(report)) return []
  const arr = Array.isArray(report.achievements) ? report.achievements : []
  return arr.map((x) => asRecord(x) ?? {}).filter((x) => Object.keys(x).length > 0)
}
