import { formatEvidenceValue, formatInsightEvidenceLabel } from './format'
import type { ConversationInsight, ConversationInsightKind } from './report'

export type InsightEvidenceEntry = {
  key: string
  label: string
  value: string
}

const INSIGHT_DESCRIPTIONS: Record<ConversationInsightKind, string> = {
  main_person: 'Композитный сигнал: объем, активные дни, стабильность и баланс. Это не просто самый шумный чат.',
  stable_dialog: 'Диалог, который держался ровно: много месяцев, активных дней и без случайной победы маленького чата.',
  comeback: 'Реальное возвращение после длинной тишины: учитывается активность до паузы и устойчивость после нее.',
  closer_dialog: 'Связь, которая стала заметно плотнее во второй части периода, без победы на микроскопической базе.',
  faded_dialog: 'Диалог, который объективно стал тише после нормальной ранней активности.',
  night_companion: 'Чат, где ночная доля заметно выше твоего обычного ритма и при этом достаточно сообщений.',
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

export function getInsightPeerRole(insight: ConversationInsight, peerFromId: string): string | null {
  if (!peerFromId) return null
  if (insight.winner?.peerFromId === peerFromId) return 'победитель'
  const candidateIndex = insight.candidates.findIndex((candidate) => candidate.peerFromId === peerFromId)
  if (candidateIndex >= 0) return `кандидат #${candidateIndex + 1}`
  return null
}
