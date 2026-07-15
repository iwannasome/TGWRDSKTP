import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const smokeUser = userInfo().username.replace(/[^a-zA-Z0-9_.-]/g, '_')
const configuredWorkDir = process.env.TGWR_SMOKE_WORKDIR?.trim()
const workDir = configuredWorkDir
  ? resolve(configuredWorkDir)
  : await mkdtemp(join(tmpdir(), `tgwr-synthetic-smoke-${smokeUser}-`))
const exportDir = join(workDir, 'TelegramExportSynthetic')
const outDir = join(workDir, 'out')
const screenshotsDir = join(workDir, 'screenshots')
const dbPath = join(outDir, 'tgwr.db')
const selfId = 'user100000000'
const SLIDE_COUNT = 14

function pythonCandidates() {
  const localPython = process.platform === 'win32'
    ? join(root, '.venv', 'Scripts', 'python.exe')
    : join(root, '.venv', 'bin', 'python')
  return [process.env.PYTHON, localPython, process.platform === 'win32' ? 'python' : 'python3', 'python']
    .filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index)
}

function findWorkerPython() {
  for (const candidate of pythonCandidates()) {
    if ((candidate.includes('/') || candidate.includes('\\')) && !existsSync(candidate)) continue
    const probe = spawnSync(candidate, ['-c', 'import ijson'], { cwd: root, stdio: 'ignore' })
    if (probe.status === 0) return candidate
  }
  throw new Error('Python-модуль ijson не найден. Установи зависимости из worker/requirements-runtime.txt')
}

function isoDate(baseMs, index, stepMinutes = 37) {
  return new Date(baseMs + index * stepMinutes * 60_000).toISOString().replace('.000Z', '')
}

function makeText(i, peerName) {
  if (i === 43) {
    return [
      'Очень длинное синтетическое сообщение для проверки переносов текста, экспорта PNG и карточки самых длинных сообщений.',
      'Здесь есть несколько предложений, эмодзи 🎯🔥✨, русские и English words, а также достаточно символов, чтобы UI был вынужден аккуратно завернуть текст.',
      `Получатель: ${peerName}. Индекс сообщения: ${i}.`
    ].join(' ')
  }

  const variants = [
    'привет как дела сегодня',
    'работаем над tgwr wrapped локально',
    'смотри какой странный график получился',
    'ночью опять обсуждали дизайн и экспорт',
    'окей позже отвечу подробнее 😄',
    'photo report stats telegram privacy'
  ]
  return `${variants[i % variants.length]} #${i}`
}

function makeMessages({ peerId, peerName, startMs, count }) {
  const messages = []

  for (let i = 0; i < count; i += 1) {
    const outgoing = i % 2 === 1
    const msg = {
      id: i + 1,
      type: 'message',
      date: isoDate(startMs, i),
      date_unixtime: String(Math.floor((startMs + i * 37 * 60_000) / 1000)),
      from: outgoing ? 'Synthetic Self' : peerName,
      from_id: outgoing ? selfId : peerId,
      text: makeText(i, peerName)
    }

    if (i === 1) msg.date = '2030-01-01T00:00:00'
    if (i > 0 && outgoing) msg.reply_to_message_id = i
    if (i % 37 === 0) msg.media_type = 'photo'
    if (i % 53 === 0) msg.sticker_emoji = '🔥'
    if (i % 97 === 0) msg.edited = isoDate(startMs, i, 38)

    messages.push(msg)
  }

  return messages
}

function makeSegmentedMessages({ peerId, peerName, segments }) {
  const messages = []
  let nextId = 1

  for (const segment of segments) {
    const {
      startMs,
      count,
      stepMinutes = 37,
      textPrefix = 'conversation insight fixture',
      mediaType = null,
      mediaEvery = 0,
      stickerEvery = 0,
      outgoingOffset = 0
    } = segment

    for (let i = 0; i < count; i += 1) {
      const id = nextId
      const tsMs = startMs + i * stepMinutes * 60_000
      const outgoing = (id + outgoingOffset) % 2 === 0
      const msg = {
        id,
        type: 'message',
        date: new Date(tsMs).toISOString().replace('.000Z', ''),
        date_unixtime: String(Math.floor(tsMs / 1000)),
        from: outgoing ? 'Synthetic Self' : peerName,
        from_id: outgoing ? selfId : peerId,
        text: `${textPrefix} ${peerName} #${id}`
      }

      if (id > 1 && outgoing) msg.reply_to_message_id = id - 1
      if (mediaType && (!mediaEvery || id % mediaEvery === 0)) msg.media_type = mediaType
      if (stickerEvery && id % stickerEvery === 0) msg.sticker_emoji = '✨'

      messages.push(msg)
      nextId += 1
    }
  }

  return messages
}

async function generateExport() {
  if (configuredWorkDir) await rm(workDir, { recursive: true, force: true })
  await mkdir(exportDir, { recursive: true })
  await mkdir(outDir, { recursive: true })
  await mkdir(screenshotsDir, { recursive: true })

  const chats = [
    {
      id: 200001,
      type: 'personal_chat',
      name: 'Александра Очень Длинное Имя Для Проверки Переносов Интерфейса',
      messages: makeMessages({
        peerId: 'user200001',
        peerName: 'Александра Очень Длинное Имя Для Проверки Переносов Интерфейса',
        startMs: Date.UTC(2025, 0, 1, 9, 0, 0),
        count: 5200
      })
    },
    {
      id: 200002,
      type: 'personal_chat',
      name: 'Maximilian LongName With Mixed Русский English Tokens',
      messages: makeSegmentedMessages({
        peerId: 'user200002',
        peerName: 'Maximilian LongName With Mixed Русский English Tokens',
        segments: Array.from({ length: 100 }, (_, day) => ({
          startMs: Date.UTC(2025, 0, day + 1, 0, 0, 0),
          count: 51,
          stepMinutes: 7,
          textPrefix: 'устойчивый большой ночной диалог'
        }))
      })
    },
    {
      id: 200003,
      type: 'personal_chat',
      name: 'Короткий чат',
      messages: makeMessages({
        peerId: 'user200003',
        peerName: 'Короткий чат',
        startMs: Date.UTC(2024, 10, 10, 7, 15, 0),
        count: 180
      })
    },
    {
      id: 300001,
      type: 'personal_chat',
      name: 'Стабильный диалог',
      messages: makeSegmentedMessages({
        peerId: 'user300001',
        peerName: 'Стабильный диалог',
        segments: Array.from({ length: 12 }, (_, month) => ({
          startMs: Date.UTC(2025, month, 5, 10, 0, 0),
          count: 50,
          stepMinutes: 180,
          textPrefix: 'ровный стабильный контакт'
        }))
      })
    },
    {
      id: 300002,
      type: 'personal_chat',
      name: 'Слишком короткая пауза для камбэка',
      messages: makeSegmentedMessages({
        peerId: 'user300002',
        peerName: 'Слишком короткая пауза для камбэка',
        segments: [
          {
            startMs: Date.UTC(2025, 0, 1, 9, 0, 0),
            count: 1408,
            stepMinutes: 5,
            textPrefix: 'активность до паузы на пятьдесят девять дней'
          },
          {
            startMs: Date.UTC(2025, 2, 6, 6, 15, 0),
            count: 2640,
            stepMinutes: 13,
            textPrefix: 'много сообщений после короткой для камбэка паузы'
          }
        ]
      })
    },
    {
      id: 300003,
      type: 'personal_chat',
      name: 'Ложный маленький камбэк',
      messages: makeSegmentedMessages({
        peerId: 'user300003',
        peerName: 'Ложный маленький камбэк',
        segments: [
          {
            startMs: Date.UTC(2022, 0, 10, 12, 0, 0),
            count: 2,
            stepMinutes: 60,
            textPrefix: 'слишком мало до паузы'
          },
          {
            startMs: Date.UTC(2024, 10, 10, 12, 0, 0),
            count: 4,
            stepMinutes: 60,
            textPrefix: 'слишком мало после паузы'
          }
        ]
      })
    },
    {
      id: 300004,
      type: 'personal_chat',
      name: 'Диалог который стал ближе',
      messages: makeSegmentedMessages({
        peerId: 'user300004',
        peerName: 'Диалог который стал ближе',
        segments: [
          {
            startMs: Date.UTC(2025, 2, 1, 9, 0, 0),
            count: 300,
            stepMinutes: 240,
            textPrefix: 'тихое начало года'
          },
          {
            startMs: Date.UTC(2025, 10, 1, 9, 0, 0),
            count: 900,
            stepMinutes: 35,
            textPrefix: 'вторая половина стала заметно активнее'
          }
        ]
      })
    },
    {
      id: 300005,
      type: 'personal_chat',
      name: 'Диалог который затих',
      messages: makeSegmentedMessages({
        peerId: 'user300005',
        peerName: 'Диалог который затих',
        segments: [
          {
            startMs: Date.UTC(2025, 1, 1, 9, 0, 0),
            count: 900,
            stepMinutes: 35,
            textPrefix: 'очень активное начало года'
          },
          {
            startMs: Date.UTC(2025, 11, 1, 9, 0, 0),
            count: 300,
            stepMinutes: 120,
            textPrefix: 'к концу года стало тише'
          }
        ]
      })
    },
    {
      id: 300006,
      type: 'personal_chat',
      name: 'Медиа связь',
      messages: makeSegmentedMessages({
        peerId: 'user300006',
        peerName: 'Медиа связь',
        segments: [
          {
            startMs: Date.UTC(2025, 4, 1, 14, 0, 0),
            count: 420,
            stepMinutes: 45,
            textPrefix: 'много медиа в переписке',
            mediaType: 'photo',
            mediaEvery: 1,
            stickerEvery: 5
          }
        ]
      })
    },
    {
      id: 300007,
      type: 'personal_chat',
      name: 'Старый all time диалог',
      messages: makeSegmentedMessages({
        peerId: 'user300007',
        peerName: 'Старый all time диалог',
        segments: [
          {
            startMs: Date.UTC(2021, 5, 1, 12, 0, 0),
            count: 700,
            stepMinutes: 80,
            textPrefix: 'история до выбранного года'
          }
        ]
      })
    },
    {
      id: 300008,
      type: 'personal_chat',
      name: 'Полина <3333',
      messages: makeSegmentedMessages({
        peerId: 'user300008',
        peerName: 'Полина <3333',
        segments: [
          {
            startMs: Date.UTC(2025, 1, 1, 0, 0, 0),
            count: 320,
            stepMinutes: 20,
            textPrefix: 'нормальное общение до длинной паузы'
          },
          {
            startMs: Date.UTC(2025, 4, 11, 10, 20, 0),
            count: 2280,
            stepMinutes: 15,
            textPrefix: 'сильный процент роста на меньшем общем объеме'
          }
        ]
      })
    },
    {
      id: 300009,
      type: 'personal_chat',
      name: 'Ровные месяцы с большой дырой',
      messages: makeSegmentedMessages({
        peerId: 'user300009',
        peerName: 'Ровные месяцы с большой дырой',
        segments: [0, 1, 2, 9, 10, 11].map((month) => ({
          startMs: Date.UTC(2025, month, 5, 0, 0, 0),
          count: 100,
          stepMinutes: 3,
          textPrefix: 'активный месяц вокруг длинного провала'
        }))
      })
    },
    {
      id: 300010,
      type: 'personal_chat',
      name: 'Красивый рост на маленькой базе',
      messages: makeSegmentedMessages({
        peerId: 'user300010',
        peerName: 'Красивый рост на маленькой базе',
        segments: [
          {
            startMs: Date.UTC(2025, 2, 1, 9, 0, 0),
            count: 100,
            stepMinutes: 240,
            textPrefix: 'маленькая ранняя база'
          },
          {
            startMs: Date.UTC(2025, 10, 1, 9, 0, 0),
            count: 400,
            stepMinutes: 35,
            textPrefix: 'красивый процент без достаточного объема'
          }
        ]
      })
    },
    {
      id: 300011,
      type: 'personal_chat',
      name: 'Крупный устойчивый камбэк',
      messages: makeSegmentedMessages({
        peerId: 'user300011',
        peerName: 'Крупный устойчивый камбэк',
        segments: [
          {
            startMs: Date.UTC(2025, 0, 10, 9, 0, 0),
            count: 800,
            stepMinutes: 20,
            textPrefix: 'большой активный диалог до паузы'
          },
          {
            startMs: Date.UTC(2025, 4, 1, 9, 0, 0),
            count: 3200,
            stepMinutes: 10,
            textPrefix: 'крупное устойчивое возвращение после паузы'
          }
        ]
      })
    },
    {
      id: 999001,
      type: 'private_group',
      name: 'Группа должна быть пропущена',
      messages: makeMessages({
        peerId: 'user999001',
        peerName: 'Группа должна быть пропущена',
        startMs: Date.UTC(2025, 5, 1, 12, 0, 0),
        count: 10
      })
    }
  ]

  const result = {
    about: 'Synthetic TGWR fixture. No real Telegram data.',
    personal_information: {
      user_id: 100000000,
      first_name: 'Synthetic',
      last_name: 'Self'
    },
    chats: { list: chats }
  }

  await writeFile(join(exportDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
}

function startWorker() {
  const proc = spawn(findWorkerPython(), ['worker/tgwr_worker.py'], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  const waiters = []
  let buffer = ''

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    while (true) {
      const nl = buffer.indexOf('\n')
      if (nl === -1) break
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const event = JSON.parse(line)
      for (const waiter of [...waiters]) {
        if (waiter.predicate(event)) {
          clearTimeout(waiter.timer)
          waiters.splice(waiters.indexOf(waiter), 1)
          waiter.resolve(event)
        }
      }
    }
  })

  proc.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  const send = (cmd) => {
    proc.stdin.write(`${JSON.stringify(cmd)}\n`)
  }

  const waitFor = (predicate, label, timeoutMs = 60_000) =>
    new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(waiter)
        if (idx >= 0) waiters.splice(idx, 1)
        reject(new Error(`Timed out waiting for ${label}`))
      }, timeoutMs)
      const waiter = { predicate, resolve: resolvePromise, timer }
      waiters.push(waiter)
    })

  const stop = () => {
    try {
      proc.stdin.end()
      proc.kill()
    } catch {
      // best effort
    }
  }

  return { proc, send, waitFor, stop }
}

async function runWorkerSmoke() {
  const worker = startWorker()
  try {
    worker.send({ cmd: 'ping' })
    await worker.waitFor((event) => event.type === 'pong', 'pong', 10_000)

    worker.send({ cmd: 'import_export', mode: 'desktop', export_dir: exportDir, db_path: dbPath })
    const imported = await worker.waitFor(
      (event) => event.type === 'import_done' || event.type === 'import_error',
      'import result'
    )
    if (imported.type !== 'import_done') throw new Error(`Import failed: ${imported.message}`)

    worker.send({ cmd: 'build_report', db_path: dbPath })
    const built = await worker.waitFor(
      (event) => event.type === 'report_done' || event.type === 'report_error',
      'report result'
    )
    if (built.type !== 'report_done') throw new Error(`Report failed: ${built.message}`)

    worker.send({ cmd: 'preload_reports', db_path: dbPath, years: [2024] })
    const preloaded = await worker.waitFor(
      (event) => (event.type === 'report_cached' && event.msk_year_used === 2024) || event.type === 'report_preload_error',
      '2024 preload result'
    )
    if (preloaded.type !== 'report_cached') throw new Error(`Report preload failed: ${preloaded.message}`)

    worker.send({ cmd: 'build_report', db_path: dbPath, year: 2024 })
    const switchedToCachedYear = await worker.waitFor(
      (event) => (event.type === 'report_done' && event.msk_year_used === 2024) || event.type === 'report_error',
      'cached year switch'
    )
    if (switchedToCachedYear.type !== 'report_done' || switchedToCachedYear.source !== 'cache') {
      throw new Error(`Cached year did not open from disk cache: ${JSON.stringify(switchedToCachedYear)}`)
    }

    worker.send({ cmd: 'build_report', db_path: dbPath, year: 2025 })
    const switchedBack = await worker.waitFor(
      (event) => (event.type === 'report_done' && event.msk_year_used === 2025) || event.type === 'report_error',
      'cached current year switch'
    )
    if (switchedBack.type !== 'report_done' || switchedBack.source !== 'cache') {
      throw new Error(`Current year did not reopen from disk cache: ${JSON.stringify(switchedBack)}`)
    }

    return switchedBack.report_path
  } finally {
    worker.stop()
  }
}

const INSIGHT_KEYS = [
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
]

const ALLOWED_CONFIDENCE = new Set(['exact', 'behavioral', 'heuristic'])

function assertReport(report) {
  const allTime = report?.periods?.all_time
  const year = report?.periods?.year

  const sumCounts = (items, key = 'count') =>
    Array.isArray(items)
      ? items.reduce((acc, item) => acc + Number(item?.[key] ?? 0), 0)
      : 0

  const sumRecord = (record) =>
    record && typeof record === 'object'
      ? Object.values(record).reduce((acc, value) => acc + Number(value ?? 0), 0)
      : 0

  const closeTo = (a, b, epsilon = 0.000001) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) <= epsilon

  const pick = (record, snakeKey, camelKey = snakeKey) => record?.[snakeKey] ?? record?.[camelKey]

  const assertPeriodInvariants = (label, period, expected) => {
    const total = Number(period?.total_messages ?? -1)
    const sent = Number(period?.sent_messages ?? -1)
    const received = Number(period?.received_messages ?? -1)
    const daily = period?.daily_activity
    const hourly = period?.hourly_activity
    const topMessages = period?.top_10_people_by_messages ?? []

    return [
      [`${label}.exact_total`, total === expected.total],
      [`${label}.sent_plus_received`, sent + received === total],
      [`${label}.daily_sum`, sumCounts(daily) === total],
      [`${label}.hourly_24`, Array.isArray(hourly) && hourly.length === 24],
      [`${label}.hourly_sum`, sumCounts(hourly) === total],
      [`${label}.active_days_bound`, Number(period?.active_days_count ?? 0) <= (Array.isArray(daily) ? daily.length : 0)],
      [`${label}.active_chats_count`, Number(period?.active_chats_count ?? -1) === expected.activeChats],
      [`${label}.top_people_totals`, topMessages.every((person) => Number(person?.sent_messages ?? 0) + Number(person?.received_messages ?? 0) === Number(person?.total_messages ?? -1))],
      [`${label}.top_people_sorted`, topMessages.every((person, idx, arr) => idx === 0 || Number(arr[idx - 1]?.total_messages ?? 0) >= Number(person?.total_messages ?? 0))],
      [`${label}.media_counts_non_negative`, Object.values(period?.media_counts ?? {}).every((count) => Number(count) >= 0)],
      [`${label}.media_sum_reasonable`, sumRecord(period?.media_counts ?? {}) <= total]
    ]
  }

  const assertPersonAnalyticsInvariants = (people) => {
    if (!Array.isArray(people)) return [['people_analytics_shape', false]]
    const checks = []
    for (const [personIndex, person] of people.entries()) {
      const periods = person?.periods ?? {}
      for (const periodKey of ['all_time', 'year']) {
        const period = periods?.[periodKey]
        if (!period) continue
        const total = Number(pick(period, 'total_messages', 'totalMessages') ?? 0)
        const sent = Number(pick(period, 'sent_messages', 'sentMessages') ?? 0)
        const received = Number(pick(period, 'received_messages', 'receivedMessages') ?? 0)
        const sentRatio = Number(pick(period, 'sent_ratio', 'sentRatio') ?? 0)
        const receivedRatio = Number(pick(period, 'received_ratio', 'receivedRatio') ?? 0)
        const hourlyActivity = pick(period, 'hourly_activity', 'hourlyActivity')
        const mediaCounts = pick(period, 'media_counts', 'mediaCounts') ?? {}
        const mediaTotal = Number(pick(period, 'media_total', 'mediaTotal') ?? 0)
        const daysStartedByYou = Number(pick(period, 'days_started_by_you', 'daysStartedByYou') ?? 0)
        const daysStartedByThem = Number(pick(period, 'days_started_by_them', 'daysStartedByThem') ?? 0)
        const initiatedDays = Number(pick(period, 'initiated_days', 'initiatedDays') ?? 0)
        const yourReplySamples = Number(pick(period, 'your_reply_samples', 'yourReplySamples') ?? 0)
        const theirReplySamples = Number(pick(period, 'their_reply_samples', 'theirReplySamples') ?? 0)

        checks.push([`people_${personIndex}.${periodKey}.sent_received_total`, sent + received === total])
        checks.push([`people_${personIndex}.${periodKey}.ratio_sum`, total === 0 || closeTo(sentRatio + receivedRatio, 1)])
        checks.push([`people_${personIndex}.${periodKey}.hourly_24`, Array.isArray(hourlyActivity) && hourlyActivity.length === 24])
        checks.push([`people_${personIndex}.${periodKey}.hourly_sum`, sumCounts(hourlyActivity) === total])
        checks.push([`people_${personIndex}.${periodKey}.media_total`, sumRecord(mediaCounts) === mediaTotal])
        checks.push([`people_${personIndex}.${periodKey}.initiated_days`, daysStartedByYou + daysStartedByThem === initiatedDays])
        checks.push([`people_${personIndex}.${periodKey}.reply_samples`, yourReplySamples >= 0 && theirReplySamples >= 0])
      }
    }
    return checks
  }

  const assertInsightContract = (label, period) => {
    const insights = period?.conversation_insights
    const checks = [[`${label}.conversation_insights_shape`, insights && typeof insights === 'object' && !Array.isArray(insights)]]
    if (!insights || typeof insights !== 'object' || Array.isArray(insights)) return checks

    for (const key of INSIGHT_KEYS) {
      const insight = insights[key]
      const hasInsight = insight && typeof insight === 'object' && !Array.isArray(insight)
      checks.push([`${label}.insight.${key}.shape`, hasInsight])
      if (!hasInsight) continue

      const winner = insight.winner
      const winnerOk =
        winner === null ||
        (winner &&
          typeof winner === 'object' &&
          !Array.isArray(winner) &&
          typeof winner.peer_from_id === 'string' &&
          typeof winner.display_name === 'string')

      checks.push([`${label}.insight.${key}.kind`, insight.kind === key])
      checks.push([`${label}.insight.${key}.confidence`, ALLOWED_CONFIDENCE.has(insight.confidence)])
      checks.push([`${label}.insight.${key}.evidence`, insight.evidence && typeof insight.evidence === 'object' && !Array.isArray(insight.evidence)])
      checks.push([`${label}.insight.${key}.candidates`, Array.isArray(insight.candidates)])
      checks.push([`${label}.insight.${key}.winner`, Boolean(winnerOk)])
      checks.push([`${label}.insight.${key}.no_winner_reason`, Object.prototype.hasOwnProperty.call(insight, 'no_winner_reason')])
      checks.push([`${label}.insight.${key}.winner_or_reason`, winner !== null || typeof insight.no_winner_reason === 'string'])
    }

    return checks
  }

  const getInsightWinnerPeer = (period, key) => {
    const winner = period?.conversation_insights?.[key]?.winner
    return winner && typeof winner === 'object' ? winner.peer_from_id : null
  }

  const assertLongestSilenceQuality = (label, period) => {
    const silence = period?.longest_silence_gap
    return [
      [`${label}.longest_silence_requires_3000_messages`, Number(silence?.minimum_messages_required ?? 0) === 3000],
      [`${label}.longest_silence_winner_is_qualified`, Number(silence?.chat_message_count ?? 0) >= 3000],
      [`${label}.longest_silence_tiny_chat_blocked`, silence?.peer_from_id !== 'user300003']
    ]
  }

  const assertLiveSessionQuality = (label, period, minimumTotal) => {
    const insights = period?.conversation_insights ?? {}
    const checks = []
    for (const key of ['alive_dialog', 'longest_live_session']) {
      const insight = insights[key]
      const evidence = insight?.evidence ?? {}
      checks.push([`${label}.${key}.bounded_duration`, Number(evidence.maximum_session_seconds ?? 0) === 12 * 60 * 60 && Number(evidence.duration_seconds ?? Number.POSITIVE_INFINITY) <= 12 * 60 * 60])
      checks.push([`${label}.${key}.bounded_message_gap`, Number(evidence.session_gap_limit_seconds ?? 0) === 30 * 60 && Number(evidence.observed_max_gap_seconds ?? Number.POSITIVE_INFINITY) <= 30 * 60])
      checks.push([`${label}.${key}.minimum_density`, Number(evidence.density_per_hour ?? 0) >= 4])
      checks.push([`${label}.${key}.two_sided`, Number(evidence.sent_messages ?? 0) > 0 && Number(evidence.received_messages ?? 0) > 0])
      checks.push([`${label}.${key}.large_dialog`, Number(insight?.winner?.total_messages ?? 0) >= minimumTotal && Number(evidence.minimum_messages_required ?? 0) === minimumTotal])
      checks.push([`${label}.${key}.large_dialog_candidates`, (insight?.candidates ?? []).every((candidate) => Number(candidate?.total_messages ?? 0) >= minimumTotal)])
    }
    return checks
  }

  const assertBehavioralInsightQuality = (label, period, thresholds) => {
    const insights = period?.conversation_insights ?? {}
    const stable = insights.stable_dialog
    const closer = insights.closer_dialog
    const faded = insights.faded_dialog
    const reply = insights.reply_rhythm
    const initiative = insights.contact_initiator
    const restarter = insights.silence_restarter
    const nightCompanion = insights.night_companion
    const dayAnchor = insights.day_anchor
    const mediaBond = insights.media_bond
    const mediaCandidates = mediaBond?.candidates ?? []

    const timeProfileChecks = (key, insight) => {
      const candidates = insight?.candidates ?? []
      const hasCandidates = candidates.length > 0
      return [
        [`${label}.${key}.minimum_volume`, !hasCandidates || (Number(insight?.winner?.total_messages ?? 0) >= 3000 && Number(insight?.evidence?.minimum_messages_required ?? 0) === 3000)],
        [`${label}.${key}.candidates_qualified`, candidates.every((candidate) => Number(candidate?.total_messages ?? 0) >= 3000)],
        [`${label}.${key}.leave_one_out_baseline`, !hasCandidates || (Number(insight?.evidence?.baseline_messages ?? 0) >= 1500 && insight?.evidence?.baseline_excludes_candidate === true)]
      ]
    }

    return [
      [`${label}.stable_dialog_fixture`, stable?.winner?.peer_from_id === 'user300001'],
      [`${label}.stable_dialog_calendar_coverage`, Number(stable?.evidence?.coverage_ratio ?? 0) >= thresholds.stableCoverage && Number(stable?.evidence?.observed_months ?? 0) >= 12],
      [`${label}.stable_dialog_formula_evidence`, Number(stable?.evidence?.monthly_deviation_ratio ?? -1) >= 0 && Math.abs((Number(stable?.evidence?.stability_ratio ?? 0) + Number(stable?.evidence?.monthly_deviation_ratio ?? 0)) - 1) < 0.0002],
      [`${label}.stable_dialog_threshold_evidence`, Number(stable?.evidence?.minimum_messages_required ?? 0) === thresholds.stableMessages && Number(stable?.evidence?.minimum_stability_ratio ?? 0) === thresholds.stableScore],
      [`${label}.stable_dialog_gap_fixture_blocked`, !(stable?.candidates ?? []).some((candidate) => candidate?.peer_from_id === 'user300009')],
      ...timeProfileChecks('night_companion', nightCompanion),
      ...timeProfileChecks('day_anchor', dayAnchor),
      [`${label}.night_companion_small_night_chat_blocked`, !(nightCompanion?.candidates ?? []).some((candidate) => candidate?.peer_from_id === 'user300009')],
      [`${label}.closer_dialog_minimum_volume`, Number(closer?.winner?.total_messages ?? 0) >= thresholds.trendMessages && Number(closer?.evidence?.minimum_messages_required ?? 0) === thresholds.trendMessages],
      [`${label}.faded_dialog_minimum_volume`, Number(faded?.winner?.total_messages ?? 0) >= thresholds.trendMessages && Number(faded?.evidence?.minimum_messages_required ?? 0) === thresholds.trendMessages],
      [`${label}.trend_windows_are_matched`, Number(closer?.evidence?.matched_window_days ?? 0) > 0 && Number(closer?.evidence?.trend_span_days ?? 0) >= thresholds.trendSpanDays && Number(closer?.evidence?.minimum_trend_span_days ?? 0) === thresholds.trendSpanDays],
      [`${label}.tiny_growth_fixture_blocked`, !(closer?.candidates ?? []).some((candidate) => candidate?.peer_from_id === 'user300010')],
      [`${label}.reply_rhythm_samples`, Number(reply?.evidence?.reply_samples ?? 0) >= thresholds.replySamples && Number(reply?.evidence?.minimum_reply_samples ?? 0) === thresholds.replySamples],
      [`${label}.contact_initiator_gap`, Number(initiative?.evidence?.contact_gap_seconds ?? 0) === 12 * 60 * 60],
      [`${label}.contact_initiator_samples`, Number(initiative?.evidence?.contact_events ?? 0) >= thresholds.contactEvents && Number(initiative?.evidence?.minimum_contact_events ?? 0) === thresholds.contactEvents],
      [`${label}.contact_initiator_dominance`, Number(initiative?.evidence?.dominance_ratio ?? 0) >= 0.6],
      [`${label}.contact_initiator_large_dialog`, Number(initiative?.winner?.total_messages ?? 0) >= thresholds.majorMessages && (initiative?.candidates ?? []).every((candidate) => Number(candidate?.total_messages ?? 0) >= thresholds.majorMessages)],
      [`${label}.silence_restarter_gap`, Number(restarter?.evidence?.silence_gap_seconds ?? 0) === 7 * 24 * 60 * 60],
      [`${label}.silence_restarter_samples`, Number(restarter?.evidence?.restart_events ?? 0) >= thresholds.restartEvents && Number(restarter?.evidence?.minimum_restart_events ?? 0) === thresholds.restartEvents],
      [`${label}.silence_restarter_dominance`, Number(restarter?.evidence?.dominance_ratio ?? 0) >= 0.6],
      [`${label}.silence_restarter_large_dialog`, Number(restarter?.winner?.total_messages ?? 0) >= thresholds.majorMessages && (restarter?.candidates ?? []).every((candidate) => Number(candidate?.total_messages ?? 0) >= thresholds.majorMessages)],
      [`${label}.media_bond_large_dialog`, mediaCandidates.length === 0 || (Number(mediaBond?.winner?.total_messages ?? 0) >= thresholds.majorMessages && Number(mediaBond?.evidence?.minimum_messages_required ?? 0) === thresholds.majorMessages)],
      [`${label}.media_bond_above_other_dialogs`, mediaCandidates.length === 0 || (Number(mediaBond?.evidence?.media_lift_vs_archive ?? 0) >= 0.03 && Number(mediaBond?.evidence?.baseline_messages ?? 0) >= 1000 && mediaBond?.evidence?.baseline_excludes_candidate === true)]
    ]
  }

  const assertComebackQuality = (label, period) => {
    const comeback = period?.conversation_insights?.comeback
    const candidates = comeback?.candidates ?? []
    return [
      [`${label}.comeback_large_dialog_wins`, comeback?.winner?.peer_from_id === 'user300011'],
      [`${label}.comeback_minimum_volume`, Number(comeback?.winner?.total_messages ?? 0) >= 2500 && Number(comeback?.evidence?.minimum_messages_required ?? 0) === 2500],
      [`${label}.comeback_smaller_high_ratio_is_eligible`, candidates.some((candidate) => candidate?.peer_from_id === 'user300008')],
      [`${label}.comeback_large_dialog_outranks_ratio`, candidates.findIndex((candidate) => candidate?.peer_from_id === 'user300011') < candidates.findIndex((candidate) => candidate?.peer_from_id === 'user300008')],
      [`${label}.comeback_activity_evidence`, Number(comeback?.evidence?.total_active_days ?? 0) >= 20]
    ]
  }

  const required = [
    ...assertPeriodInvariants('all_time', allTime, { total: 26354, activeChats: 14 }),
    ...assertPeriodInvariants('year', year, { total: 25468, activeChats: 11 }),
    ...assertPersonAnalyticsInvariants(report?.people_analytics),
    ...assertInsightContract('all_time', allTime),
    ...assertInsightContract('year', year),
    ...assertLongestSilenceQuality('all_time', allTime),
    ...assertLongestSilenceQuality('year', year),
    ...assertLiveSessionQuality('all_time', allTime, 500),
    ...assertLiveSessionQuality('year', year, 400),
    ...assertBehavioralInsightQuality('all_time', allTime, { stableCoverage: 0.6, stableMessages: 520, stableScore: 0.4, trendMessages: 1200, trendSpanDays: 120, majorMessages: 500, replySamples: 30, contactEvents: 12, restartEvents: 4 }),
    ...assertBehavioralInsightQuality('year', year, { stableCoverage: 0.65, stableMessages: 420, stableScore: 0.45, trendMessages: 1000, trendSpanDays: 90, majorMessages: 400, replySamples: 20, contactEvents: 10, restartEvents: 3 }),
    ...assertComebackQuality('all_time', allTime),
    ...assertComebackQuality('year', year),
    ['all_time.comeback_59_day_spike_blocked', getInsightWinnerPeer(allTime, 'comeback') !== 'user300002'],
    ['year.comeback_59_day_spike_blocked', getInsightWinnerPeer(year, 'comeback') !== 'user300002'],
    ['year.comeback_tiny_false_positive_blocked', getInsightWinnerPeer(year, 'comeback') !== 'user300003' && getInsightWinnerPeer(allTime, 'comeback') !== 'user300003'],
    ['year.closer_dialog_fixture', getInsightWinnerPeer(year, 'closer_dialog') === 'user300004'],
    ['year.faded_dialog_fixture_eligible', (year?.conversation_insights?.faded_dialog?.candidates ?? []).some((candidate) => candidate?.peer_from_id === 'user300005')],
    ['year.media_bond_fixture', getInsightWinnerPeer(year, 'media_bond') === 'user300006'],
    ['all_time.total_messages', allTime?.total_messages > 4500],
    ['report.schema_version', report?.schema_version === 2],
    ['meta.self_from_id', report?.meta?.self_from_id === selfId],
    ['meta.msk_year_used', report?.meta?.msk_year_used === 2025],
    ['meta.report_cache_revision', report?.meta?.report_cache_revision === 3],
    ['meta.people_analytics_limit', report?.meta?.people_analytics_limit === 50],
    ['meta.inferred_reply_window_hours', report?.meta?.inferred_reply_window_hours === 48],
    ['meta.available_years', Array.isArray(report?.meta?.available_years) && report.meta.available_years.some((item) => item?.year === 2025 && item?.messages === 25468)],
    ['year.total_messages', year?.total_messages > 4000],
    ['top_10_people_by_messages', year?.top_10_people_by_messages?.length >= 2],
    ['top_10_people_by_mutuality', year?.top_10_people_by_mutuality?.length >= 2],
    ['all_time.top_10_people_by_mutuality_adaptive_gate', (allTime?.top_10_people_by_mutuality ?? []).every((person) => Number(person?.minimum_messages_required ?? 0) >= 500 && Number(person?.minimum_messages_required ?? 0) <= 5000 && Number(person?.total_messages ?? 0) >= Number(person?.minimum_messages_required ?? 0))],
    ['top_10_people_by_mutuality_adaptive_gate', (year?.top_10_people_by_mutuality ?? []).every((person) => Number(person?.minimum_messages_required ?? 0) >= 500 && Number(person?.minimum_messages_required ?? 0) <= 5000 && Number(person?.total_messages ?? 0) >= Number(person?.minimum_messages_required ?? 0))],
    ['all_time.mutual_dialog_adaptive_gate', Number(allTime?.conversation_insights?.mutual_dialog?.winner?.total_messages ?? 0) >= Number(allTime?.conversation_insights?.mutual_dialog?.evidence?.minimum_messages_required ?? 0)],
    ['year.mutual_dialog_adaptive_gate', Number(year?.conversation_insights?.mutual_dialog?.winner?.total_messages ?? 0) >= Number(year?.conversation_insights?.mutual_dialog?.evidence?.minimum_messages_required ?? 0)],
    ['top_longest_messages_sent', allTime?.top_longest_messages_sent?.length > 0],
    ['word_cloud', Object.keys(allTime?.word_cloud ?? {}).length > 0],
    ['achievements', report?.achievements?.length > 0 && !report.achievements.some((item) => item?.id === 'placeholder')],
    ['deleted_metric_removed', !Object.prototype.hasOwnProperty.call(allTime ?? {}, 'deleted_messages_count') && !Object.prototype.hasOwnProperty.call(year ?? {}, 'deleted_messages_count')],
    ['period_span', Boolean(allTime?.period_span?.first_date && allTime?.period_span?.last_date)],
    ['quietest_month', Boolean(year?.quietest_month?.value) && Number(year?.quietest_month?.count ?? -1) >= 0],
    ['direction_extremes', Boolean(year?.most_balanced_day?.date && year?.most_one_sided_day?.date)],
    ['night_insights', Boolean(year?.night_peak_hour && year?.most_night_date)],
    ['reply_thresholds', year?.who_you_reply_fastest?.minimum_messages_required === 2500 && year?.who_you_ignore_most?.minimum_messages_required === 3000],
    ['reply_sample_thresholds', Number(year?.who_you_reply_fastest?.reply_samples ?? 0) >= 20 && Number(year?.who_you_ignore_most?.reply_samples ?? 0) >= 20 && year?.who_you_reply_fastest?.minimum_reply_samples === 20 && year?.who_you_ignore_most?.minimum_reply_samples === 20],
    ['emoji_metrics', typeof year?.messages_with_emoji_count === 'number' && typeof year?.emoji_streak_max_messages === 'number'],
    ['media_insights', Boolean(year?.top_media_type?.type && year?.most_media_month?.value)],
    ['day_night_person_details', Boolean(year?.day_person?.day_peak_hour && year?.night_person?.night_peak_hour)],
    ['people_analytics', report?.people_analytics?.length >= 2],
    ['people_analytics_year', Boolean(report?.people_analytics?.[0]?.periods?.year?.month_activity?.length)],
    ['people_analytics_hours', report?.people_analytics?.[0]?.periods?.year?.hourly_activity?.length === 24],
    ['people_analytics_words', report?.people_analytics?.[0]?.periods?.year?.top_words?.length > 0],
    ['people_analytics_bounded', report?.people_analytics?.length <= 50]
  ]

  const failed = required.filter(([, ok]) => !ok).map(([name]) => name)
  if (failed.length) throw new Error(`Report validation failed: ${failed.join(', ')}`)
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeEmptyReport(baseReport) {
  const report = cloneJson(baseReport)
  report.meta = {
    ...(report.meta ?? {}),
    msk_year_used: 2025
  }
  report.achievements = []
  report.top_people = []
  report.people_analytics = []

  for (const periodKey of ['all_time', 'year']) {
    report.periods[periodKey] = {
      total_messages: 0,
      sent_messages: 0,
      received_messages: 0,
      total_chats_personal: 0,
      active_chats_count: 0,
      most_active_day: null,
      most_active_month: null,
      most_active_hour: null,
      daily_activity: [],
      hourly_activity: [],
      period_hours: 0,
      average_messages_per_hour: 0,
      night_messages_count: 0,
      night_messages_ratio: 0,
      media_counts: {},
      edited_messages_count: 0,
      deleted_messages_count: 0,
      median_reply_time_to_others_seconds: 0,
      who_you_reply_fastest: null,
      who_you_ignore_most: null,
      day_person: null,
      night_person: null,
      longest_silence_gap: null,
      longest_streak_days: null,
      longest_person_streak: null,
      top_10_people_by_messages: [],
      top_10_people_by_time_span: [],
      top_10_people_by_mutuality: [],
      active_days_count: 0,
      avg_messages_per_active_day: 0,
      messages_06_08: 0,
      top_longest_messages_sent: [],
      word_cloud: {},
      top_words: [],
      top_emojis: []
    }
  }

  return report
}

function makeExtremeReport(baseReport) {
  const report = cloneJson(baseReport)
  const longName = 'ОченьДлинноеИмяБезПробеловДляПроверкиПереполненияКарточек'.repeat(3)
  const longWord = 'сверхдлинноесловобезпробелов'.repeat(4)

  for (const periodKey of ['all_time', 'year']) {
    const period = report.periods[periodKey]
    period.total_messages = 987654321
    period.sent_messages = 543210987
    period.received_messages = 444443334
    period.top_10_people_by_messages = [
      {
        peer_from_id: 'user_extreme',
        display_name: longName,
        total_messages: 987654321,
        sent_messages: 543210987,
        received_messages: 444443334
      }
    ]
    period.top_10_people_by_mutuality = [
      {
        peer_from_id: 'user_extreme',
        display_name: longName,
        total_messages: 987654321,
        abs_diff: 123456789,
        imbalance_ratio: 0.1249
      }
    ]
    period.who_you_reply_fastest = {
      peer_from_id: 'user_extreme',
      display_name: longName,
      median_reply_seconds: 12
    }
    period.who_you_ignore_most = {
      peer_from_id: 'user_extreme',
      display_name: longName,
      median_reply_seconds: 987654
    }
    period.day_person = { peer_from_id: 'user_extreme', display_name: longName, messages: 7777777 }
    period.night_person = { peer_from_id: 'user_extreme', display_name: longName, messages: 8888888 }
    period.longest_silence_gap = { gap_seconds: 9876543, chat_name: longName }
    period.longest_person_streak = {
      length_days: 365,
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      peer_from_id: 'user_extreme',
      display_name: longName
    }
    period.top_longest_messages_sent = [
      {
        length_chars: 99999,
        snippet: `${longWord} ${longWord} ${longWord}`,
        peer_from_id: 'user_extreme',
        display_name: longName,
        msg_id: '99999',
        date_ts: 1735689600
      }
    ]
    period.word_cloud = {
      [longWord]: 500,
      telegramwrapped: 420,
      приватность: 380,
      экспорт: 320,
      дизайн: 280
    }
  }

  report.achievements = [
    {
      id: 'extreme_achievement_identifier_without_spaces',
      title: longName,
      description: `${longWord} ${longWord}`,
      earned: true,
      score: 100,
      badge_image_path: ''
    }
  ]

  return report
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    'google-chrome',
    'chromium',
    'chromium-browser'
  ].filter(Boolean)

  for (const candidate of candidates) {
    const res = spawnSync('command', ['-v', candidate], { shell: true, encoding: 'utf8' })
    const found = res.stdout.trim()
    if (found) return found
  }

  return null
}

function runChrome(chrome, args, timeoutMs = 20_000) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        proc.kill()
      } catch {
        // best effort
      }
      reject(new Error(`Chrome timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code, stdout, stderr })
    })
  })
}

function allSlideTargets() {
  return Array.from({ length: SLIDE_COUNT }, (_, idx) => idx)
}

async function getBuiltAssets() {
  const indexHtml = await readFile(join(root, 'dist/renderer/index.html'), 'utf8')
  const jsMatch = indexHtml.match(/src=["']\.?\/?assets\/([^"']+\.js)["']/)
  const cssMatch = indexHtml.match(/href=["']\.?\/?assets\/([^"']+\.css)["']/)
  if (!jsMatch || !cssMatch) throw new Error('Could not find built renderer assets. Run npm run build first.')
  return { jsFile: jsMatch[1], cssFile: cssMatch[1] }
}

function renderHarnessHtml(report, assets, slideIndex) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/assets/${assets.cssFile}" />
    <script>
      function showHarnessError(message) {
        document.body.innerHTML = '<pre style="white-space:pre-wrap;padding:24px;color:#fca5a5;background:#111827;font:16px monospace">' + String(message).replace(/[<>&]/g, (ch) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[ch])) + '</pre>';
      }
      function runNavigationStress(root) {
        const expected = '${SLIDE_COUNT - 1}';
        const deadline = Date.now() + 5000;
        for (let i = 0; i < 80; i += 1) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        }
        const tick = () => {
          const currentRoot = document.querySelector('[data-tgwr-slide-index]');
          const current = currentRoot && currentRoot.getAttribute('data-tgwr-slide-index');
          const active = document.querySelector('[data-tgwr-active-slide="' + expected + '"]');
          if (current === expected && active) {
            document.body.setAttribute('data-nav-stress', 'ok');
            return;
          }
          if (Date.now() > deadline) {
            document.body.setAttribute('data-nav-stress', 'fail:' + current);
            showHarnessError('Navigation stress failed. Expected slide index ' + expected + ', got ' + current);
            return;
          }
          setTimeout(tick, 50);
        };
        tick();
      }
      function findButtonByText(text) {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find((button) => (button.textContent || '').trim() === text) || null;
      }
      function checkDialogKeyboardTrap(dialog, preferredButtonText) {
        const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
          .filter((element) => element.getClientRects().length > 0);
        const preferred = focusable.find((element) => (element.textContent || '').trim() === preferredButtonText);
        if (!preferred || document.activeElement !== preferred || focusable.length < 2) return false;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        last.focus();
        last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        if (document.activeElement !== first) throw new Error('Tab escaped the dialog instead of wrapping to its first control');
        first.focus();
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
        if (document.activeElement !== last) throw new Error('Shift+Tab escaped the dialog instead of wrapping to its last control');
        preferred.focus();
        return true;
      }
      function prepareInsightExportCardCheck() {
        const card = document.querySelector('[data-tgwr-insight-export-card]');
        if (!card) return false;
        const wrapper = card.closest('[aria-hidden="true"]') || card.parentElement;
        if (!wrapper) return false;
        wrapper.style.left = '0px';
        wrapper.style.top = '0px';
        wrapper.style.zIndex = '9999';
        wrapper.style.pointerEvents = 'none';
        wrapper.style.background = '#05070a';
        document.body.setAttribute('data-insight-card-check', 'ok');
        return true;
      }
      function runPeopleViewCheck() {
        const deadline = Date.now() + 7000;
        let openedExisting = false;
        let startupKeyboardChecked = false;
        let clickedPeople = false;
        const tick = () => {
          const root = document.querySelector('[data-tgwr-view]');
          const view = root && root.getAttribute('data-tgwr-view');

          if (!openedExisting) {
            const openOld = findButtonByText('Открыть старый');
            const prompt = document.querySelector('[data-tgwr-existing-report-prompt="true"]');
            if (openOld && prompt && !startupKeyboardChecked) {
              try {
                startupKeyboardChecked = checkDialogKeyboardTrap(prompt, 'Открыть старый');
              } catch (error) {
                document.body.setAttribute('data-people-check', 'fail:keyboard');
                showHarnessError(error instanceof Error ? error.message : String(error));
                return;
              }
              if (!startupKeyboardChecked) {
                setTimeout(tick, 80);
                return;
              }
              document.body.setAttribute('data-startup-dialog-keyboard-check', 'ok');
            }
            if (openOld) {
              openedExisting = true;
              openOld.click();
              setTimeout(tick, 80);
              return;
            }
          }

          if (view === 'slides' && !clickedPeople) {
            const peopleButton = findButtonByText('Люди');
            if (peopleButton) {
              clickedPeople = true;
              peopleButton.click();
              setTimeout(tick, 80);
              return;
            }
          }

          if (
            view === 'people' &&
            document.body.textContent.includes('Сигналы переписки') &&
            document.body.textContent.includes('14 выводов по переписке')
          ) {
            if (new URLSearchParams(window.location.search).get('tgwr_insight_card_check') === '1') {
              if (!prepareInsightExportCardCheck()) {
                setTimeout(tick, 80);
                return;
              }
            }
            document.body.setAttribute('data-people-check', 'ok');
            return;
          }

          if (Date.now() > deadline) {
            document.body.setAttribute('data-people-check', 'fail:' + view);
            showHarnessError('People view check failed. Current view: ' + view + ', clickedPeople=' + clickedPeople);
            return;
          }

          setTimeout(tick, 80);
        };
        tick();
      }
      function runSharePreviewCheck() {
        const deadline = Date.now() + 7000;
        let openedExisting = false;
        let clickedExport = false;
        let previewSlideChecked = 0;
        let keyboardChecked = false;
        const tick = () => {
          const root = document.querySelector('[data-tgwr-view]');
          const view = root && root.getAttribute('data-tgwr-view');

          if (!openedExisting) {
            const openOld = findButtonByText('Открыть старый');
            if (openOld) {
              openedExisting = true;
              openOld.click();
              setTimeout(tick, 80);
              return;
            }
          }

          if (view === 'slides' && !clickedExport) {
            const pngButton = findButtonByText('PNG');
            if (pngButton) {
              clickedExport = true;
              pngButton.click();
              setTimeout(tick, 80);
              return;
            }
          }

          const preview = document.querySelector('[data-tgwr-share-preview="true"]');
          if (preview) {
            if (!keyboardChecked) {
              try {
                keyboardChecked = checkDialogKeyboardTrap(preview, 'Закрыть');
              } catch (error) {
                document.body.setAttribute('data-share-preview-check', 'fail:keyboard');
                showHarnessError(error instanceof Error ? error.message : String(error));
                return;
              }
              if (!keyboardChecked) {
                setTimeout(tick, 80);
                return;
              }
              document.body.setAttribute('data-dialog-keyboard-check', 'ok');
            }
            const previewText = preview.textContent || '';
            const checked = Array.from(preview.querySelectorAll('input[type="checkbox"]')).every((input) => input.checked);
            const counter = previewText.match(/([0-9]+)[/]([0-9]+) *·/);
            const currentSlide = counter ? Number(counter[1]) : 0;
            const totalSlides = counter ? Number(counter[2]) : 0;
            const containsPrivateName = previewText.includes('Александра Очень');
            const containsExactDate = /(?:^|[^0-9])(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}[.][0-9]{2}[.][0-9]{4})(?:$|[^0-9])/.test(previewText);

            if (!checked || containsPrivateName || containsExactDate) {
              document.body.setAttribute('data-share-preview-check', 'fail:privacy');
              showHarnessError('Share preview leaked private data. checked=' + checked + ', name=' + containsPrivateName + ', date=' + containsExactDate + ', slide=' + currentSlide + '/' + totalSlides);
              return;
            }

            if (currentSlide > previewSlideChecked) previewSlideChecked = currentSlide;
            if (keyboardChecked && totalSlides > 0 && currentSlide === totalSlides && previewSlideChecked === totalSlides) {
              document.body.setAttribute('data-share-preview-check', 'ok');
              return;
            }

            const next = findButtonByText('Дальше →');
            if (next && currentSlide > 0 && currentSlide < totalSlides) {
              next.click();
              setTimeout(tick, 80);
              return;
            }
          }

          if (Date.now() > deadline) {
            document.body.setAttribute('data-share-preview-check', 'fail:' + view);
            showHarnessError('Share preview check failed. Current view: ' + view + ', clickedExport=' + clickedExport);
            return;
          }
          setTimeout(tick, 80);
        };
        tick();
      }
      function runRecoverableDataCheck() {
        const deadline = Date.now() + 7000;
        let clickedRecover = false;
        let keyboardChecked = false;
        const tick = () => {
          const prompt = document.querySelector('[data-tgwr-recovery-prompt="true"]');
          const recover = findButtonByText('Восстановить Wrapped');
          const remove = findButtonByText('Удалить локальные данные');

          if (prompt && recover && remove && !recover.disabled && !remove.disabled && !keyboardChecked) {
            try {
              keyboardChecked = checkDialogKeyboardTrap(prompt, 'Восстановить Wrapped');
            } catch (error) {
              document.body.setAttribute('data-recovery-check', 'fail:keyboard');
              showHarnessError(error instanceof Error ? error.message : String(error));
              return;
            }
            if (keyboardChecked) {
              document.body.setAttribute('data-dialog-keyboard-check', 'ok');
            }
          }

          if (keyboardChecked && prompt && recover && remove && !recover.disabled && !remove.disabled && !clickedRecover) {
            clickedRecover = true;
            recover.click();
            setTimeout(tick, 80);
            return;
          }

          if (
            clickedRecover &&
            document.body.getAttribute('data-recovery-build-requested') === '1' &&
            prompt &&
            (prompt.textContent || '').includes('Восстанавливаю Wrapped из локальной базы')
          ) {
            document.body.setAttribute('data-recovery-check', 'ok');
            return;
          }

          if (Date.now() > deadline) {
            document.body.setAttribute('data-recovery-check', 'fail');
            const active = document.activeElement;
            showHarnessError('Recovery prompt check failed. Prompt=' + Boolean(prompt) + ', recover=' + Boolean(recover) + ', remove=' + Boolean(remove) + ', active=' + (active ? active.tagName + ':' + (active.textContent || '').trim().slice(0, 120) : 'none'));
            return;
          }
          setTimeout(tick, 80);
        };
        tick();
      }
      function waitForSlidesReady() {
        const deadline = Date.now() + 7000;
        if (new URLSearchParams(window.location.search).get('tgwr_recovery_check') === '1') {
          runRecoverableDataCheck();
          return;
        }
        if (new URLSearchParams(window.location.search).get('tgwr_share_preview_check') === '1') {
          runSharePreviewCheck();
          return;
        }
        if (new URLSearchParams(window.location.search).get('tgwr_people_check') === '1') {
          runPeopleViewCheck();
          return;
        }
        const tick = () => {
          const root = document.querySelector('[data-tgwr-view]');
          if (root && root.getAttribute('data-tgwr-view') === 'slides') {
            const stage = document.querySelector('[data-tgwr-slide-stage="true"]');
            const bounds = stage && stage.getBoundingClientRect();
            const aspect = bounds && bounds.height > 0 ? bounds.width / bounds.height : 0;
            document.body.setAttribute('data-slide-aspect', aspect.toFixed(3));
            if (aspect < 1.72 || aspect > 1.84) {
              document.body.setAttribute('data-layout-check', 'fail');
              showHarnessError('Slide aspect ratio is broken: ' + aspect.toFixed(3));
              return;
            }
            document.body.setAttribute('data-layout-check', 'ok');
            document.body.setAttribute('data-smoke-ready', '1');
            if (new URLSearchParams(window.location.search).get('tgwr_nav_stress') === '1') {
              runNavigationStress(root);
            }
            return;
          }
          if (Date.now() > deadline) {
            showHarnessError('Timed out waiting for slides view. Current view: ' + (root && root.getAttribute('data-tgwr-view')));
            document.body.setAttribute('data-smoke-ready', '0');
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      }
      window.addEventListener('load', waitForSlidesReady);
      window.addEventListener('error', (event) => {
        showHarnessError(event.error && event.error.stack ? event.error.stack : event.message);
      });
      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        showHarnessError(reason && reason.stack ? reason.stack : reason);
      });
      window.__TGWR_REPORT__ = ${JSON.stringify(report)};
      const tgwrRecoveryMode = new URLSearchParams(window.location.search).get('tgwr_recovery_check') === '1';
      window.tgwr = {
        rendererReady: () => {},
        onWorkerEvent: (cb) => {
          const timer = setTimeout(() => cb({ type: 'pong', version: '0.2.0' }), 20);
          return () => clearTimeout(timer);
        },
        pingWorker: () => {},
        importExport: () => {},
        buildReport: () => document.body.setAttribute('data-recovery-build-requested', '1'),
        preloadReports: () => {},
        cancelWorker: () => {},
        restartWorker: () => {},
        pickExportDir: async () => null,
        pickOutputDir: async () => null,
        writeOutputFile: async () => ({ ok: true, path: '' }),
        resetReport: async () => ({ ok: true, db_path: ${JSON.stringify(dbPath)}, report_path: ${JSON.stringify(join(outDir, 'report.json'))}, deleted: true }),
        deleteAllData: async () => ({ ok: true, db_path: ${JSON.stringify(dbPath)}, report_path: ${JSON.stringify(join(outDir, 'report.json'))}, deleted_files: 2 }),
        loadReport: async () => tgwrRecoveryMode
          ? ({
              ok: false,
              db_path: ${JSON.stringify(dbPath)},
              report_path: ${JSON.stringify(join(outDir, 'report.json'))},
              db_exists: true,
              report_exists: false,
              local_data_exists: true,
              error: 'Локальная база найдена, но сохранённый отчёт отсутствует'
            })
          : ({
              ok: true,
              db_path: ${JSON.stringify(dbPath)},
              report_path: ${JSON.stringify(join(outDir, 'report.json'))},
              cached_years: [2025],
              report_stale: false,
              report: window.__TGWR_REPORT__
            })
      };
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" crossorigin src="/assets/${assets.jsFile}"></script>
  </body>
</html>
`
}

function assertHarnessInlineScriptParses(report) {
  const html = renderHarnessHtml(report, { cssFile: 'smoke.css', jsFile: 'smoke.js' }, 0)
  const startMarker = '<script>'
  const endMarker = '</script>'
  const scriptStart = html.indexOf(startMarker)
  const scriptEnd = scriptStart === -1 ? -1 : html.indexOf(endMarker, scriptStart + startMarker.length)
  if (scriptStart === -1 || scriptEnd === -1) {
    throw new Error('Synthetic harness is missing its inline bootstrap script')
  }
  const inlineScript = html.slice(scriptStart + startMarker.length, scriptEnd)
  try {
    new Function(inlineScript)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Synthetic harness inline script does not parse: ${message}`)
  }
}

async function startHarnessServer(report) {
  const assets = await getBuiltAssets()
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')

      if (url.pathname.startsWith('/assets/')) {
        const file = url.pathname.slice('/assets/'.length)
        const assetPath = join(root, 'dist/renderer/assets', file)
        const body = await readFile(assetPath)
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8')
        res.end(body)
        return
      }

      const slideIndex = Number(url.searchParams.get('slide') ?? '0')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(renderHarnessHtml(report, assets, Number.isFinite(slideIndex) ? slideIndex : 0))
    } catch (err) {
      console.error('Synthetic harness request failed', err)
      res.statusCode = 500
      res.end('Synthetic harness request failed')
    }
  })

  await new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', resolvePromise)
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to start harness server')
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

async function runScreenshots(report, options = {}) {
  const chrome = findChrome()
  if (!chrome) {
    console.log('screenshots=skipped chrome_not_found')
    return []
  }

  const label = options.label ?? 'base'
  const targets = options.targets ?? [0, 1, 7, 8, 10, 13, 18, 20]
  const viewport = options.viewport ?? { width: 1280, height: 900 }
  const minScreenshotBytes = options.minScreenshotBytes ?? 25_000
  const screenshots = []
  const harness = await startHarnessServer(report)

  try {
    for (const slideIndex of targets) {
      const screenshotPath = join(screenshotsDir, `${label}-slide-${String(slideIndex + 1).padStart(2, '0')}.png`)
      const pageUrl = `${harness.origin}/?tgwr_slide=${slideIndex}&tgwr_screenshot=1`
      const domRes = await runChrome(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        `--window-size=${viewport.width},${viewport.height}`,
        '--virtual-time-budget=12000',
        '--dump-dom',
        pageUrl
      ], 30_000)

      if (domRes.code !== 0) {
        const reason = domRes.stderr || domRes.stdout
        throw new Error(`Chrome DOM check failed for ${label} slide ${slideIndex + 1}: ${reason}`)
      }

      if (!domRes.stdout.includes('data-tgwr-view="slides"')) {
        throw new Error(`DOM check did not reach slides view for ${label} slide ${slideIndex + 1}`)
      }
      if (!domRes.stdout.includes('data-layout-check="ok"')) {
        const aspect = domRes.stdout.match(/data-slide-aspect="([^"]+)"/)?.[1] ?? 'missing'
        throw new Error(`DOM check found broken slide aspect ratio for ${label} slide ${slideIndex + 1}: ${aspect}`)
      }

      const totalMatch = domRes.stdout.match(/data-tgwr-slide-total="(\d+)"/)
      const renderedTotal = Number(totalMatch?.[1] ?? 0)
      const renderedIndex = Math.min(slideIndex, Math.max(0, renderedTotal - 1))
      if (renderedTotal <= 0 || !domRes.stdout.includes(`${renderedIndex + 1} / ${renderedTotal}`)) {
        throw new Error(`DOM check opened wrong slide for ${label} slide ${slideIndex + 1}`)
      }

      const res = await runChrome(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        `--window-size=${viewport.width},${viewport.height}`,
        '--virtual-time-budget=12000',
        `--screenshot=${screenshotPath}`,
        pageUrl
      ], 30_000)

      if (res.code !== 0) {
        const reason = res.stderr || res.stdout
        throw new Error(`Chrome screenshot failed for slide ${slideIndex + 1}: ${reason}`)
      }

      const info = await stat(screenshotPath)
      if (info.size < minScreenshotBytes) {
        throw new Error(`Screenshot looks too small: ${screenshotPath} (${info.size} bytes, min ${minScreenshotBytes})`)
      }
      screenshots.push({ label, slide: slideIndex + 1, path: screenshotPath, bytes: info.size })
    }
  } finally {
    await new Promise((resolvePromise) => harness.server.close(resolvePromise))
  }

  return screenshots
}

async function runNavigationStress(report) {
  const chrome = findChrome()
  if (!chrome) {
    console.log('navigation_stress=skipped chrome_not_found')
    return
  }

  const harness = await startHarnessServer(report)
  try {
    const pageUrl = `${harness.origin}/?tgwr_slide=0&tgwr_screenshot=1&tgwr_nav_stress=1`
    const res = await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=12000',
      '--dump-dom',
      pageUrl
    ], 30_000)

    if (res.code !== 0) {
      const reason = res.stderr || res.stdout
      throw new Error(`Chrome navigation stress failed: ${reason}`)
    }
    if (!res.stdout.includes('data-nav-stress="ok"')) {
      throw new Error('Navigation stress did not reach the final slide')
    }
    console.log('navigation_stress=ok')
  } finally {
    await new Promise((resolvePromise) => harness.server.close(resolvePromise))
  }
}

async function runPeopleViewSmoke(report) {
  const chrome = findChrome()
  if (!chrome) {
    console.log('people_view=skipped chrome_not_found')
    return
  }

  const harness = await startHarnessServer(report)
  try {
    const pageUrl = `${harness.origin}/?tgwr_people_check=1`
    const res = await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=12000',
      '--dump-dom',
      pageUrl
    ], 30_000)

    if (res.code !== 0) {
      const reason = res.stderr || res.stdout
      throw new Error(`Chrome people view check failed: ${reason}`)
    }
    if (!res.stdout.includes('data-people-check="ok"') || !res.stdout.includes('data-tgwr-view="people"')) {
      throw new Error('People view smoke did not reach conversation insights')
    }
    if (!res.stdout.includes('Сигналы переписки') || !res.stdout.includes('14 выводов по переписке')) {
      throw new Error('People view smoke did not render the conversation insights heading')
    }

    const screenshotPath = join(screenshotsDir, 'people-view.png')
    const shot = await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-size=1360,900',
      '--virtual-time-budget=12000',
      `--screenshot=${screenshotPath}`,
      pageUrl
    ], 30_000)

    if (shot.code !== 0) {
      const reason = shot.stderr || shot.stdout
      throw new Error(`Chrome people view screenshot failed: ${reason}`)
    }

    const info = await stat(screenshotPath)
    if (info.size < 25_000) throw new Error(`People view screenshot looks too small: ${screenshotPath} (${info.size} bytes)`)

    console.log(`people_view=ok screenshot=${screenshotPath} bytes=${info.size}`)
  } finally {
    await new Promise((resolvePromise) => harness.server.close(resolvePromise))
  }
}

async function runInsightExportCardSmoke(report) {
  const chrome = findChrome()
  if (!chrome) {
    console.log('insight_export_card=skipped chrome_not_found')
    return
  }

  const harness = await startHarnessServer(report)
  try {
    const pageUrl = `${harness.origin}/?tgwr_people_check=1&tgwr_insight_card_check=1`
    const res = await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=12000',
      '--dump-dom',
      pageUrl
    ], 30_000)

    if (res.code !== 0) {
      const reason = res.stderr || res.stdout
      throw new Error(`Chrome insight export card check failed: ${reason}`)
    }
    if (!res.stdout.includes('data-insight-card-check="ok"')) {
      throw new Error('Insight export card smoke did not expose the export card')
    }
    if (!res.stdout.includes('data-tgwr-insight-export-card="true"')) {
      throw new Error('Insight export card smoke did not render the card marker')
    }

    const screenshotPath = join(screenshotsDir, 'insight-export-card.png')
    const shot = await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-size=1080,1920',
      '--virtual-time-budget=12000',
      `--screenshot=${screenshotPath}`,
      pageUrl
    ], 30_000)

    if (shot.code !== 0) {
      const reason = shot.stderr || shot.stdout
      throw new Error(`Chrome insight export card screenshot failed: ${reason}`)
    }

    const info = await stat(screenshotPath)
    if (info.size < 80_000) throw new Error(`Insight export card screenshot looks too small: ${screenshotPath} (${info.size} bytes)`)

    console.log(`insight_export_card=ok screenshot=${screenshotPath} bytes=${info.size}`)
  } finally {
    await new Promise((resolvePromise) => harness.server.close(resolvePromise))
  }
}

async function runSharePreviewSmoke(report) {
  const chrome = findChrome()
  if (!chrome) {
    console.log('share_preview=skipped chrome_not_found')
    return
  }

  const harness = await startHarnessServer(report)
  try {
    const pageUrl = `${harness.origin}/?tgwr_slide=5&tgwr_share_preview_check=1`
    const dom = await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=12000',
      '--dump-dom',
      pageUrl
    ], 30_000)

    if (dom.code !== 0 || !dom.stdout.includes('data-share-preview-check="ok"')) {
      throw new Error(`Share preview DOM check failed: ${dom.stderr || dom.stdout.slice(-3000)}`)
    }

    const screenshotPath = join(screenshotsDir, 'share-preview.png')
    const shot = await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-size=1360,900',
      '--virtual-time-budget=12000',
      `--screenshot=${screenshotPath}`,
      pageUrl
    ], 30_000)
    if (shot.code !== 0) throw new Error(`Share preview screenshot failed: ${shot.stderr || shot.stdout}`)
    const info = await stat(screenshotPath)
    if (info.size < 25_000) throw new Error(`Share preview screenshot looks too small: ${info.size} bytes`)
    console.log(`share_preview=ok screenshot=${screenshotPath} bytes=${info.size}`)
  } finally {
    await new Promise((resolvePromise) => harness.server.close(resolvePromise))
  }
}

async function runRecoverableDataSmoke(report) {
  const chrome = findChrome()
  if (!chrome) {
    console.log('recoverable_data=skipped chrome_not_found')
    return
  }

  const harness = await startHarnessServer(report)
  try {
    const pageUrl = `${harness.origin}/?tgwr_recovery_check=1`
    const dom = await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=12000',
      '--dump-dom',
      pageUrl
    ], 30_000)
    if (dom.code !== 0 || !dom.stdout.includes('data-recovery-check="ok"')) {
      throw new Error(`Recoverable data DOM check failed: ${dom.stderr || dom.stdout.slice(-3000)}`)
    }
    console.log('recoverable_data=ok restore=enabled delete=enabled')
  } finally {
    await new Promise((resolvePromise) => harness.server.close(resolvePromise))
  }
}

async function main() {
  if (!existsSync(join(root, 'dist/renderer/index.html'))) {
    throw new Error('dist/renderer/index.html not found. Run npm run build first.')
  }

  await generateExport()
  const reportPath = await runWorkerSmoke()
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  assertReport(report)
  assertHarnessInlineScriptParses(report)
  const allSlides = process.argv.includes('--all-slides') || process.env.TGWR_SMOKE_ALL_SLIDES === '1'
  const baseTargets = allSlides ? allSlideTargets() : undefined
  const expandedMobileTargets = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  const screenshots = [
    ...(await runScreenshots(report, { label: 'base', targets: baseTargets })),
    ...(await runScreenshots(report, {
      label: 'mobile',
      targets: allSlides ? expandedMobileTargets : [0, 1, 9, 13],
      viewport: { width: 390, height: 844 },
      minScreenshotBytes: 15_000
    })),
    ...(await runScreenshots(makeEmptyReport(report), { label: 'empty', targets: [0, 1, 2, 3] })),
    ...(await runScreenshots(makeExtremeReport(report), { label: 'extreme', targets: [1, 6, 9, 11, 13] }))
  ]
  await runNavigationStress(report)
  await runPeopleViewSmoke(report)
  await runInsightExportCardSmoke(report)
  await runSharePreviewSmoke(report)
  await runRecoverableDataSmoke(report)

  console.log(`synthetic_export=${exportDir}`)
  console.log(`db=${dbPath}`)
  console.log(`report=${reportPath}`)
  for (const shot of screenshots) {
    console.log(`screenshot label=${shot.label} slide=${shot.slide} bytes=${shot.bytes} path=${shot.path}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
