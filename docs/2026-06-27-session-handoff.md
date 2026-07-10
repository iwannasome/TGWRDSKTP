# Session Handoff: TGWR by IWS stabilization and conversation metrics

Дата: 2026-06-27

Рабочая ветка: `fix/full-project-stabilization`

Рабочая директория: `/home/dan/TGWRDSKTP-stabilize`

Исходный проект: `/home/dan/TGWRDSKTP`

## Коротко

За сессию проект был приведен в более чистое, проверяемое состояние и расширен первой волной "людских" метрик для Telegram Wrapped без ML. Основной фокус: локальный анализ переписок, понятные доказательства для каждой метрики, экспортируемые insight-карточки с IWS-брендингом, проверка UI, smoke-тесты и упаковка под Linux-форматы.

В конце отдельно была исправлена логика качества метрик в чатах:

- взаимность теперь считается только для диалогов от `5000` сообщений;
- "Камбэк года" больше не должен выигрывать на слабом или слишком коротком возвращении;
- кейс с паузой `59 дн.` больше не проходит как "камбэк";
- скоринг камбэка теперь учитывает реальный разгон общения после паузы, а не только объем сообщений после нее.

## Что было спроектировано

Созданы документы:

- `docs/specs/2026-06-27-conversation-insights-rework-design.md`
- `docs/plans/2026-06-27-conversation-insights-rework.md`

В них зафиксирована продуктовая рамка:

- продукт остается `TGWR`, авторский бренд виден как `TGWR by IWS`;
- обработка только локальная;
- без ML, без облака, без телеметрии;
- основные выводы не должны строиться на слабой психологии или "угадывании смысла";
- каждая новая метрика должна иметь доказательства и confidence;
- `year` остается основным Wrapped-периодом;
- `all_time` поддерживается полноценно, а не как запасной режим;
- маленькие чаты не должны побеждать в крупных инсайтах.

## Новые метрики переписки

В отчет добавлены 14 conversation insights для каждого периода:

- `main_person` - главный человек периода;
- `stable_dialog` - самый стабильный диалог;
- `comeback` - камбэк периода;
- `closer_dialog` - диалог, который стал ближе;
- `faded_dialog` - диалог, который затих;
- `night_companion` - ночной собеседник;
- `day_anchor` - дневной якорь;
- `alive_dialog` - самый живой диалог;
- `longest_live_session` - самая длинная живая сессия;
- `reply_rhythm` - ритм ответов;
- `mutual_dialog` - самый взаимный диалог;
- `contact_initiator` - кто чаще начинал контакт;
- `silence_restarter` - кто возвращал разговор после тишины;
- `media_bond` - медиа-связь.

Формат каждого инсайта:

```json
{
  "kind": "comeback",
  "title": "Камбэк года",
  "confidence": "behavioral",
  "winner": {
    "peer_from_id": "user...",
    "display_name": "..."
  },
  "score": 0,
  "evidence": {},
  "candidates": [],
  "no_winner_reason": null
}
```

Поддерживаемые confidence:

- `exact`;
- `behavioral`;
- `heuristic`.

## Worker и расчет данных

Основной файл: `worker/tgwr_worker.py`

Добавлено:

- построение period-aware профилей личных диалогов;
- фильтрация служебных сообщений, Saved Messages и banned peers;
- активные дни и месяцы по каждому диалогу;
- sent/received баланс;
- медианные reply-сигналы;
- медиасчетчики по типам;
- дневные инициаторы;
- возвраты после тишины;
- сессии живого общения;
- evidence для каждого инсайта;
- no-winner состояния, если данных недостаточно.

Важная текущая логика порогов:

- для `year`:
  - `min_person_total`: `180`;
  - `min_major_total`: `400`;
  - `min_stable_total`: `420`;
  - `comeback_gap_days`: `60`;
  - `comeback_before_messages`: `300`;
  - `comeback_after_messages`: `500`;
  - `comeback_after_active_days`: `10`;
  - `trend_delta_messages`: `240`;
  - `media_events`: `120`;
  - `session_messages`: `60`;
  - `mutual_min_total`: `5000`.
- для `all_time`:
  - `min_person_total`: `260`;
  - `min_major_total`: `500`;
  - `min_stable_total`: `520`;
  - `comeback_gap_days`: `90`;
  - `comeback_before_messages`: `300`;
  - `comeback_after_messages`: `550`;
  - `comeback_after_active_days`: `12`;
  - `trend_delta_messages`: `300`;
  - `media_events`: `140`;
  - `session_messages`: `70`;
  - `mutual_min_total`: `5000`.

## Исправление "Камбэк года"

Проблема: старый алгоритм мог выбрать диалог как камбэк при паузе около `59` дней и большом числе сообщений после нее. На скрине победил чат с доказательствами:

- пауза: `59 дн.`;
- до паузы: `1408`;
- после паузы: `2640`;
- активных дней после: `24`.

Почему это было сомнительно:

- порог паузы за год был слишком низким: `45` дней;
- пороги до/после были слишком низкими: `80` и `100`;
- скоринг любил абсолютный объем после паузы;
- метрика недостаточно отличала "просто много сообщений после паузы" от "отношение реально ожило сильнее, чем раньше".

Что изменено:

- годовой минимальный gap поднят до `60` дней;
- all-time минимальный gap поднят до `90` дней;
- повышены before/after пороги;
- добавлены доказательства:
  - `reactivation_delta`;
  - `reactivation_ratio`;
- скоринг теперь учитывает:
  - объем после паузы;
  - прирост после паузы;
  - множитель роста после паузы;
  - активные дни после паузы;
  - длину паузы;
  - минимальную нормальность активности до паузы.

Синтетический тест теперь проверяет кейс `Полина <3333`:

- пауза: `95` дней;
- до паузы: `320`;
- после паузы: `1800`;
- активных дней после: `20`;
- рост после паузы: `5.625x`.

Ожидаемый результат: `Полина <3333` выигрывает как более сильная реактивация, а 59-дневный всплеск не выигрывает.

## Исправление взаимности

Проблема: взаимность раньше считалась от `2000` сообщений. Для обычного пользователя это могло показывать слишком маленький диалог как "самый взаимный", хотя статистически такой вывод слабее.

Что изменено:

- глобальный порог взаимности поднят до `5000` сообщений;
- `top_10_people_by_mutuality` фильтрует все чаты ниже `5000`;
- `mutual_dialog` тоже требует минимум `5000`;
- evidence теперь содержит `minimum_messages_required: 5000`;
- слайд взаимности теперь по умолчанию показывает минимум `5000`, а не `2000`.

## Renderer и UI

Основные файлы:

- `src/renderer/src/wrapped/report.ts`
- `src/renderer/src/wrapped/format.ts`
- `src/renderer/src/wrapped/PeopleView.tsx`
- `src/renderer/src/wrapped/DetailsView.tsx`
- `src/renderer/src/wrapped/SlidesView.tsx`
- `src/renderer/src/wrapped/slides/InsightStorySlide.tsx`
- `src/renderer/src/wrapped/InsightExportCard.tsx`
- `src/renderer/src/wrapped/export.ts`
- `src/renderer/src/wrapped/SlideFrame.tsx`
- `src/renderer/src/styles.css`

Сделано:

- добавлена defensive-нормализация новых `conversation_insights`;
- старые отчеты без новых полей должны продолжать открываться;
- Explore/People показывает все 14 инсайтов;
- у каждого инсайта есть победитель, confidence, evidence и кандидаты;
- в deck показываются избранные сильные инсайты, а не все 14 подряд;
- добавлена отдельная story-card для инсайтов;
- добавлен экспорт insight-карточки в PNG;
- добавлен чекбокс "Скрыть имя в PNG";
- экспортная карточка содержит `TGWR by IWS` и watermark `IWS`;
- текст evidence форматируется на русском;
- добавлены labels для `reactivation_delta` и `reactivation_ratio`.

## Брендинг IWS

Сделано:

- видимый бренд приложения обновлен до `TGWR by IWS`;
- exported insight card содержит `IWS`;
- финальные/служебные элементы используют `TGWR by IWS`;
- сохранен спокойный премиальный тон без перегиба в мемность.

## Синтетические тесты

Файл: `scripts/synthetic-smoke.mjs`

Тестовый экспорт расширен:

- большие личные чаты для volume и взаимности;
- стабильный диалог;
- ложный маленький камбэк;
- 59-дневный всплеск, который не должен побеждать;
- `Полина <3333` как сильная реактивация;
- диалог, который стал ближе;
- диалог, который затих;
- медиа-тяжелый диалог;
- all-time-only диалог;
- группа, которая должна быть пропущена;
- extreme/empty отчеты для UI-устойчивости.

Проверяется:

- сумма total/sent/received;
- daily/hourly invariant;
- top people sorting;
- shape всех 14 conversation insights;
- confidence values;
- no-winner states;
- comeback quality gates;
- mutuality 5000 gate;
- people analytics;
- word cloud;
- achievements;
- renderer navigation stress;
- people view;
- insight export card;
- desktop/mobile/empty/extreme screenshots.

## Сборка и упаковка

В `package.json` добавлены/уточнены команды:

```bash
npm run dev
npm run build
npm run typecheck
npm run test:synthetic
npm run verify
npm run pack
npm run dist:win
npm run dist:win:portable
npm run dist:mac
npm run dist:linux
npm run dist:current
```

Linux packaging проверен через:

```bash
npm run dist:linux
```

Собранные Linux-артефакты:

- `release/TGWR-by-IWS-0.1.0-x86_64.AppImage`
- `release/TGWR-by-IWS-0.1.0-amd64.deb`
- `release/TGWR-by-IWS-0.1.0-x86_64.rpm`

Также `npm run verify` собирает `release/linux-unpacked`.

На текущей машине для rpm-сборки потребовалась системная зависимость `libxcrypt-compat`.

## Проверки, которые проходили

Основная финальная проверка:

```bash
CHROME_BIN="$PWD/.cache/chrome/chrome/linux-150.0.7871.24/chrome-linux64/chrome" PYTHONWARNINGS=error::DeprecationWarning npm run verify
```

Она прошла и включала:

- `npm run typecheck`;
- `npm run test:synthetic`;
- `npm run pack`.

Отдельно проходили:

```bash
CHROME_BIN="$PWD/.cache/chrome/chrome/linux-150.0.7871.24/chrome-linux64/chrome" PYTHONWARNINGS=error::DeprecationWarning npm run test:synthetic
```

```bash
npm audit --omit=dev
```

```bash
npm run dist:linux
```

Визуально были просмотрены:

- people view;
- insight export card;
- базовые слайды;
- mobile screenshots;
- empty report screenshots;
- extreme data screenshots.

Последние синтетические пути:

- `/tmp/tgwr-synthetic-smoke-dan/out/report.json`
- `/tmp/tgwr-synthetic-smoke-dan/screenshots/people-view.png`
- `/tmp/tgwr-synthetic-smoke-dan/screenshots/insight-export-card.png`
- `/tmp/tgwr-synthetic-smoke-dan/screenshots/base-slide-08.png`

## Коммиты этой волны

```text
cfcc9cf fix(metrics): tighten conversation insight quality gates
966a76e test(smoke): cover insight export visuals
8df0f1c chore(release): document IWS packaging targets
adaeb59 feat(renderer): export conversation insight cards
b95377c feat(renderer): add conversation insight deck slides
4c8e03d feat(renderer): show conversation insight proof
b687373 feat(renderer): normalize conversation insights
85afb0e feat(worker): add conversation insight metrics
d9cfc84 docs: plan conversation insights rework
b9bca87 docs: specify conversation insights rework
```

Что лежит в последнем коммите `cfcc9cf`:

- `worker/tgwr_worker.py` - подняты пороги и изменен скоринг камбэка/взаимности;
- `scripts/synthetic-smoke.mjs` - добавлены regression-кейсы для 59-дневного ложного камбэка, `Полина <3333` и 5000-gate;
- `src/renderer/src/wrapped/format.ts` - добавлены подписи и форматирование для reactivation evidence;
- `src/renderer/src/wrapped/slides/Slide08TopPersonMutuality.tsx` - дефолтный минимум взаимности поднят до `5000`.

## Как продолжить работу

Запуск dev-режима:

```bash
cd /home/dan/TGWRDSKTP-stabilize
npm run dev
```

Полная локальная проверка:

```bash
cd /home/dan/TGWRDSKTP-stabilize
CHROME_BIN="$PWD/.cache/chrome/chrome/linux-150.0.7871.24/chrome-linux64/chrome" PYTHONWARNINGS=error::DeprecationWarning npm run verify
```

Сборка Linux-пакетов:

```bash
cd /home/dan/TGWRDSKTP-stabilize
npm run dist:linux
```

Перед мержем в основную рабочую копию стоит:

- еще раз прогнать `npm run verify`;
- при необходимости прогнать `npm run dist:linux`;
- на Windows/macOS отдельно проверить `dist:win` и `dist:mac`, потому что на этой машине реально проверялся Linux;
- открыть новый отчет на настоящем Telegram export и посмотреть `Камбэк года`, `Самый взаимный диалог`, `Диалог, который стал ближе`.

## Идеи для следующей волны

1. Добавить экран "Почему победил именно этот человек" для каждого инсайта с более подробной расшифровкой кандидатов.
2. Сделать "Share Lab" для карточек: формат 9:16, square, anonymized, разные темы, batch export.
3. Добавить quality debug режим для разработчика: показывать топ-5 кандидатов и причины, почему остальные не прошли gates.
4. Развить текстовые метрики без ML:
   - длина сообщений;
   - темп коротких и длинных реплик;
   - доля вопросов только как слабая эвристика;
   - частота голосовых/фото/стикеров по людям;
   - изменение стиля общения по периодам.
5. Сделать отдельный "full archive wrapped" режим, где `all_time` не просто переключатель, а отдельный большой сценарий.
6. Добавить экспорт набора карточек одним действием: главный человек, камбэк, ближе, взаимность, медиа, финальный IWS slide.
7. Добавить automated screenshot review для всех новых insight slides, чтобы любые визуальные поломки ловились до релиза.

## Текущее состояние перед закрытием

На момент создания этого handoff рабочая ветка была `fix/full-project-stabilization`.

До добавления этого документа рабочее дерево было чистым. Этот файл создан как финальная документация сессии.
