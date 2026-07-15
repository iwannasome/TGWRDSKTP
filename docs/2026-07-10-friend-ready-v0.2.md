# TGWR 0.2 — friend-ready hardening

Дата: 2026-07-10

Ветка: `agent/friend-ready-v1`

> Историческое уточнение от 2026-07-15: в описанной ниже версии 0.2 Credits был исключён из динамической истории. В patch-релизе 0.2.1 этот продуктовый регресс исправлен: Credits снова является обязательным последним слайдом и входит в просмотр, Share Preview, PNG и PDF.

## Цель

Превратить TGWR из сильного локального прототипа в сборку, которую можно передать другому человеку без установки Python и без необходимости объяснять внутреннее устройство проекта.

## Принятые ограничения

По решению владельца проекта сохранены:

- два захардкоженных Telegram ID, исключённых из people-аналитики;
- московское время UTC+3 как правило русскоязычной версии.

Эти решения не являются случайными legacy-остатками и не должны удаляться без отдельного продуктового решения.

## Что изменилось

### Доверие к данным

- добавлен `schema_version: 2`;
- отчёт хранит список доступных лет и выбранный год;
- последний короткий хвост архива больше не обязан становиться Wrapped по умолчанию;
- пользователь может пересчитать другой год без повторного импорта;
- удалена недостоверная метрика удалённых сообщений;
- достижения получили фактические условия и больше не содержат placeholder;
- main person нормализован относительно конкретного архива;
- mutuality использует адаптивный порог достаточного объёма;
- night/media insights сравнивают чат с базовой долей всего архива;
- ограниченная 12-часовая сессия больше не маркируется как exact.

### История

- фиксированные 22 слайда заменены динамическими 4–14;
- featured deck получает максимум четыре сильных conversation insights;
- слайды без победителя пропускаются;
- один контакт встречается максимум в двух featured insights;
- raw heuristic score скрыт от пользователя;
- achievements и credits не растягивают основную историю;
- Share Preview показывает фактический экспорт до выбора папки.

### Data lifecycle и Electron

- `report.json` можно пересобрать, сохранив БД;
- полное удаление стирает DB/WAL/SHM/report, включая legacy-размещение;
- новые данные всегда находятся в Electron `userData`;
- renderer sandbox включён;
- generic `sendWorker` удалён;
- renderer не выбирает путь к БД;
- импорт разрешён только из папки, выбранной через dialog;
- экспорт использует краткоживущий directory token.

### Дистрибуция

- PyInstaller создаёт worker текущей ОС/архитектуры;
- raw Python worker не входит в package;
- packaged main не использует системный Python;
- binary smoke проверяет JSONL pong;
- packaged app smoke проверяет полный Electron → bundled worker путь.

### Импорт и CI

- import summary содержит причины пропусков и confidence определения направления;
- разные Telegram ID с одинаковым именем больше не дедуплицируются;
- добавлены анонимизированные result.json, split JSON и HTML fixtures;
- CI проверяет Linux x64, Windows x64, macOS Intel и macOS ARM64;
- release workflow собирает установщики отдельно на каждой платформе.

## Verification

Полный локальный gate:

```bash
CHROME_BIN="$PWD/.cache/chrome/chrome/linux-150.0.7871.24/chrome-linux64/chrome" \
TGWR_SMOKE_ALL_SLIDES=1 \
PYTHONWARNINGS=error::DeprecationWarning \
npm run verify
```

Результат:

- PASS — TypeScript;
- PASS — 5 import fixture tests;
- PASS — synthetic metrics/schema contract;
- PASS — 14 desktop slides;
- PASS — mobile, empty и extreme states;
- PASS — navigation, People и insight export;
- PASS — Share Preview с псевдонимом вместо исходного имени;
- PASS — PyInstaller worker;
- PASS — electron-builder Linux unpacked package;
- PASS — packaged Electron получил pong от bundled worker.

## Что остаётся внешним

Кодовая часть release pipeline готова, но подпись Windows/macOS требует сертификатов владельца. Сертификаты и notarization credentials не могут быть созданы или безопасно угаданы агентом; до их подключения ОС будет предупреждать о неизвестном издателе.
