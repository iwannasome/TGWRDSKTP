# Выпуск TGWR 0.2+

## Главное правило

Нативный worker нельзя собирать кросс-платформенно. Каждый установщик должен получить PyInstaller-бинарник, созданный на той же ОС и архитектуре.

Поддерживаемая matrix:

| Artifact | Runner | Worker path |
|---|---|---|
| Windows x64 NSIS | `windows-2025` | `worker-bin/win32-x64/tgwr-worker.exe` |
| macOS Intel DMG | `macos-15-intel` | `worker-bin/darwin-x64/tgwr-worker` |
| macOS ARM64 DMG | `macos-15` | `worker-bin/darwin-arm64/tgwr-worker` |
| Linux x64 | `ubuntu-24.04` | `worker-bin/linux-x64/tgwr-worker` |

## Локальный release gate

```bash
python -m pip install -r worker/requirements-build.txt
npm ci
npm run verify
```

`verify` должен закончиться следующими подтверждениями:

- TypeScript typecheck;
- отрицательный security-smoke для IPC, экспортируемых файлов, симлинков и Docker/noVNC;
- worker fixture tests;
- synthetic metric contract;
- desktop/mobile/empty/extreme screenshots при наличии Chrome;
- Share Preview, навигация, People и insight export;
- PyInstaller worker pong;
- electron-builder package;
- packaged Electron → bundled worker pong, принудительный перезапуск и повторный pong.

## GitHub Actions

- `.github/workflows/ci.yml` работает на push и pull request;
- `.github/workflows/release.yml` запускается вручную или тегом `v*`;
- теговый релиз разрешён только когда тег указывает на текущую вершину `master`;
- до нативной matrix релиз повторяет полный security, fixtures и browser gate всех слайдов;
- CI запускает packaged app и перезапускает встроенный worker на Windows x64, macOS Intel/ARM64 и Linux x64;
- ручной release workflow сохраняет установщики и SHA-256 как GitHub Actions artifacts на 14 дней;
- запуск по тегу `v*` дополнительно создаёт **черновик** GitHub Release со всеми установщиками и общей `SHA256SUMS.txt`. Публикация черновика остаётся ручным решением владельца.

Пример:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Перед тегом `npm run release:version-check` автоматически проверяет совпадение версии в `package.json`, `package-lock.json`, worker, интерфейсе и README, а также соответствие самого тега.

## Подпись приложений

Текущий workflow способен собрать проверенные, но неподписанные artifacts. Для публичного распространения необходимо добавить сертификаты в GitHub Secrets и только затем включить подпись/notarization в release job.

Секреты и сертификаты нельзя коммитить в репозиторий, передавать через issue/PR или печатать в логах. После подключения подписи требуется отдельная проверка установленного NSIS и DMG на чистых машинах.

Границы локальной защиты и остаточные риски зафиксированы в [SECURITY.md](SECURITY.md). Перед публикацией проверь, что они всё ещё соответствуют фактической поставке.

## Ручная приёмка

Перед публикацией:

1. убедиться, что Dependabot alerts/security updates, secret scanning, push protection и private vulnerability reporting включены в настройках GitHub;
2. установить artifact на чистую систему без Python и Node.js;
3. импортировать небольшой тестовый Telegram Export;
4. переключить год и `ALL`;
5. проверить пересборку отчёта без повторного импорта;
6. открыть Share Preview и экспортировать безопасный PNG/PDF;
7. проверить наличие `LICENSE.txt` и `THIRD_PARTY_NOTICES.txt` в ресурсах приложения;
8. выполнить «Стереть все данные», дождаться возврата на стартовый экран и проверить отсутствие БД, отчёта и кэша;
9. убедиться, что после перезапуска старый отчёт больше не предлагается.

## Защита цепочки поставки

- npm устанавливается только через lock-файл командой `npm ci`, а release gate отклоняет известные уязвимости высокой и критической серьёзности;
- runtime и build-зависимости Python закреплены точными версиями, включая платформенные зависимости PyInstaller;
- Docker-образ Node закреплён digest многоархитектурного manifest, а Dependabot следит за его обновлением;
- GitHub Actions закреплены commit SHA, их обновления отслеживает Dependabot;
- CodeQL отдельно анализирует TypeScript/JavaScript и Python с расширенным набором security-запросов;
- лицензия потокового парсера и встроенного YAJL включается в каждый нативный пакет.
