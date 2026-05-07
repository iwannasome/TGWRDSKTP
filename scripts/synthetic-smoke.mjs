import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const smokeUser = userInfo().username.replace(/[^a-zA-Z0-9_.-]/g, '_')
const workDir = process.env.TGWR_SMOKE_WORKDIR || join(tmpdir(), `tgwr-synthetic-smoke-${smokeUser}`)
const exportDir = join(workDir, 'TelegramExportSynthetic')
const outDir = join(workDir, 'out')
const screenshotsDir = join(workDir, 'screenshots')
const dbPath = join(outDir, 'tgwr.db')
const selfId = 'user100000000'

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

    if (i > 0 && outgoing) msg.reply_to_message_id = i
    if (i % 37 === 0) msg.media_type = 'photo'
    if (i % 53 === 0) msg.sticker_emoji = '🔥'
    if (i % 97 === 0) msg.edited = isoDate(startMs, i, 38)

    messages.push(msg)
  }

  return messages
}

async function generateExport() {
  await rm(workDir, { recursive: true, force: true })
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
        count: 3400
      })
    },
    {
      id: 200002,
      type: 'personal_chat',
      name: 'Maximilian LongName With Mixed Русский English Tokens',
      messages: makeMessages({
        peerId: 'user200002',
        peerName: 'Maximilian LongName With Mixed Русский English Tokens',
        startMs: Date.UTC(2025, 3, 1, 23, 30, 0),
        count: 3300
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
    chats: { list: chats }
  }

  await writeFile(join(exportDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
}

function startWorker() {
  const proc = spawn('python3', ['worker/tgwr_worker.py'], {
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

    return built.report_path
  } finally {
    worker.stop()
  }
}

function assertReport(report) {
  const allTime = report?.periods?.all_time
  const year = report?.periods?.year
  const required = [
    ['all_time.total_messages', allTime?.total_messages > 4500],
    ['year.total_messages', year?.total_messages > 4000],
    ['top_10_people_by_messages', year?.top_10_people_by_messages?.length >= 2],
    ['top_10_people_by_mutuality', year?.top_10_people_by_mutuality?.length >= 2],
    ['top_longest_messages_sent', allTime?.top_longest_messages_sent?.length > 0],
    ['word_cloud', Object.keys(allTime?.word_cloud ?? {}).length > 0],
    ['achievements', report?.achievements?.length > 0],
    ['period_span', Boolean(allTime?.period_span?.first_date && allTime?.period_span?.last_date)],
    ['quietest_month', Boolean(year?.quietest_month?.value)],
    ['direction_extremes', Boolean(year?.most_balanced_day?.date && year?.most_one_sided_day?.date)],
    ['night_insights', Boolean(year?.night_peak_hour && year?.most_night_date)],
    ['reply_thresholds', year?.who_you_reply_fastest?.minimum_messages_required === 2500 && year?.who_you_ignore_most?.minimum_messages_required === 3000],
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
  return Array.from({ length: 21 }, (_, idx) => idx)
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
        const expected = '20';
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
      function runPeopleViewCheck() {
        const deadline = Date.now() + 7000;
        let openedExisting = false;
        let clickedPeople = false;
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

          if (view === 'slides' && !clickedPeople) {
            const peopleButton = findButtonByText('Люди');
            if (peopleButton) {
              clickedPeople = true;
              peopleButton.click();
              setTimeout(tick, 80);
              return;
            }
          }

          if (view === 'people' && document.body.textContent.includes('Аналитика по человеку')) {
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
      function waitForSlidesReady() {
        const deadline = Date.now() + 7000;
        if (new URLSearchParams(window.location.search).get('tgwr_people_check') === '1') {
          runPeopleViewCheck();
          return;
        }
        const tick = () => {
          const root = document.querySelector('[data-tgwr-view]');
          if (root && root.getAttribute('data-tgwr-view') === 'slides') {
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
      window.tgwr = {
        onWorkerEvent: () => () => {},
        sendWorker: () => {},
        pickExportDir: async () => null,
        pickOutputDir: async () => null,
        writeOutputFile: async () => ({ ok: true, path: '' }),
        loadReport: async () => ({
          ok: true,
          db_path: ${JSON.stringify(dbPath)},
          report_path: ${JSON.stringify(join(outDir, 'report.json'))},
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
      res.statusCode = 500
      res.end(err instanceof Error ? err.message : String(err))
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
  const targets = options.targets ?? [0, 1, 7, 10, 13, 18, 20]
  const viewport = options.viewport ?? { width: 1280, height: 900 }
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

      if (!domRes.stdout.includes(`${slideIndex + 1} / 21`)) {
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
      if (info.size < 25_000) throw new Error(`Screenshot looks too small: ${screenshotPath} (${info.size} bytes)`)
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
      throw new Error('People view smoke did not reach people analytics')
    }
    if (!res.stdout.includes('Аналитика по человеку')) {
      throw new Error('People view smoke did not render the analytics heading')
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

async function main() {
  if (!existsSync(join(root, 'dist/renderer/index.html'))) {
    throw new Error('dist/renderer/index.html not found. Run npm run build first.')
  }

  await generateExport()
  const reportPath = await runWorkerSmoke()
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  assertReport(report)
  const baseTargets = process.env.TGWR_SMOKE_ALL_SLIDES === '1' ? allSlideTargets() : undefined
  const expandedMobileTargets = [0, 1, 2, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18]
  const screenshots = [
    ...(await runScreenshots(report, { label: 'base', targets: baseTargets })),
    ...(await runScreenshots(report, {
      label: 'mobile',
      targets: process.env.TGWR_SMOKE_ALL_SLIDES === '1' ? expandedMobileTargets : [0, 1, 13, 18],
      viewport: { width: 390, height: 844 }
    })),
    ...(await runScreenshots(makeEmptyReport(report), { label: 'empty', targets: [1, 7, 13, 18] })),
    ...(await runScreenshots(makeExtremeReport(report), { label: 'extreme', targets: [1, 7, 10, 13, 18] }))
  ]
  await runNavigationStress(report)
  await runPeopleViewSmoke(report)

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
