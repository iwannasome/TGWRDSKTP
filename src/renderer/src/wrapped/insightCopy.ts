import { formatEvidenceValue, formatInsightEvidenceLabel } from './format'
import type { ConversationInsight, ConversationInsightKind } from './report'

export type InsightEvidenceEntry = {
  key: string
  label: string
  value: string
}

const INSIGHT_DESCRIPTIONS: Record<ConversationInsightKind, string> = {
  main_person: 'Композитный сигнал: объем, активные дни, стабильность и баланс. Это не просто самый шумный чат.',
  stable_dialog: 'Ровность общения по календарным месяцам. Это не оценка отношений и не вероятность — только устойчивость ритма переписки.',
  comeback: 'Реальное возвращение после длинной тишины: учитывается активность до паузы и устойчивость после нее.',
  closer_dialog: 'Связь, которая стала заметно плотнее во второй части периода, без победы на микроскопической базе.',
  faded_dialog: 'Диалог, который объективно стал тише после нормальной ранней активности.',
  night_companion: 'Чат минимум с 3 000 сообщений, где ночная доля заметно выше твоего обычного ритма.',
  day_anchor: 'Чат, где дневная доля заметно выше общего ритма архива и хватает данных для сравнения.',
  alive_dialog: 'Диалог с самой высокой живостью: плотность сообщений внутри активных сессий.',
  longest_live_session: 'Самая длинная плотная сессия в пределах 12 часов: учитываются разрывы, объем и участие обеих сторон.',
  reply_rhythm: 'Нейтральный ритм ответов по медиане и количеству замеров, без оценочных ярлыков.',
  mutual_dialog: 'Самый сбалансированный диалог среди крупных чатов именно этого архива.',
  contact_initiator: 'Кто чаще начинал новый контакт после паузы минимум 12 часов, когда таких эпизодов достаточно.',
  silence_restarter: 'Кто чаще возвращал разговор после тишины минимум в семь дней — только по повторяющемуся паттерну.',
  media_bond: 'Где сочетаются достаточный объем медиа и повышенная доля фото, видео, голосовых, стикеров или файлов.'
}

export function getInsightDescription(kind: ConversationInsightKind): string {
  return INSIGHT_DESCRIPTIONS[kind]
}

export function getInsightEvidenceEntries(insight: ConversationInsight, limit = Number.POSITIVE_INFINITY): InsightEvidenceEntry[] {
  return Object.entries(insight.evidence)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, limit)
    .map(([key, value]) => ({
      key,
      label: formatInsightEvidenceLabel(key),
      value: formatEvidenceValue(key, value)
    }))
}

export function summarizeInsightEvidence(insight: ConversationInsight, limit = 3): string {
  const entries = getInsightEvidenceEntries(insight, limit)
  if (entries.length === 0) return 'Доказательства не приложены.'
  return entries.map((entry) => `${entry.label}: ${entry.value}`).join(' · ')
}

function evidenceNumber(insight: ConversationInsight, key: string): number {
  const value = insight.evidence[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function getInsightRationale(insight: ConversationInsight): string[] {
  if (insight.kind !== 'stable_dialog' || !insight.winner) {
    return [summarizeInsightEvidence(insight, 4)]
  }

  const activeMonths = evidenceNumber(insight, 'active_months')
  const observedMonths = evidenceNumber(insight, 'observed_months')
  const coverage = evidenceNumber(insight, 'coverage_ratio')
  const stability = evidenceNumber(insight, 'stability_ratio')
  const deviation = evidenceNumber(insight, 'monthly_deviation_ratio') || Math.max(0, 1 - stability)
  const minimumCoverage = evidenceNumber(insight, 'minimum_coverage_ratio')
  const minimumActiveMonths = evidenceNumber(insight, 'minimum_active_months')
  const minimumStability = evidenceNumber(insight, 'minimum_stability_ratio')
  const totalMessages = evidenceNumber(insight, 'total_messages')
  const minimumMessages = evidenceNumber(insight, 'minimum_messages_required')
  const coverageGate = minimumCoverage > 0 ? ` при пороге ${formatEvidenceValue('minimum_coverage_ratio', minimumCoverage)}` : ''
  const activeMonthsGate = minimumActiveMonths > 0 ? ` и минимуме ${formatEvidenceValue('minimum_active_months', minimumActiveMonths)} месяцев` : ''
  const stabilityGate = minimumStability > 0 ? ` Порог равномерности — ${formatEvidenceValue('minimum_stability_ratio', minimumStability)}.` : ''
  const volumeGate = minimumMessages > 0
    ? `${formatEvidenceValue('total_messages', totalMessages)} сообщений прошли фильтр минимальной базы в ${formatEvidenceValue('minimum_messages_required', minimumMessages)} сообщений.`
    : `${formatEvidenceValue('total_messages', totalMessages)} сообщений дали достаточную базу для сравнения.`

  return [
    `${formatEvidenceValue('active_months', activeMonths)} из ${formatEvidenceValue('observed_months', observedMonths)} календарных месяцев были активными: покрытие ${formatEvidenceValue('coverage_ratio', coverage)}${coverageGate}${activeMonthsGate}.`,
    `Равномерность ${formatEvidenceValue('stability_ratio', stability)} означает, что месячный объём в среднем отклонялся от своей средней линии на ${formatEvidenceValue('monthly_deviation_ratio', deviation)}.${stabilityGate}`,
    volumeGate,
    'Итоговый рейтинг: покрытие × 60, равномерность × 60, по 8 баллов за активный месяц и до 40 баллов за активные дни.'
  ]
}

export function getInsightPeerRole(insight: ConversationInsight, peerFromId: string): string | null {
  if (!peerFromId) return null
  if (insight.winner?.peerFromId === peerFromId) return 'победитель'
  const candidateIndex = insight.candidates.findIndex((candidate) => candidate.peerFromId === peerFromId)
  if (candidateIndex >= 0) return `кандидат #${candidateIndex + 1}`
  return null
}
