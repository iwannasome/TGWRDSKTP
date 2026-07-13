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
- worker fixture tests;
- synthetic metric contract;
- desktop/mobile/empty/extreme screenshots при наличии Chrome;
- Share Preview, навигация, People и insight export;
- PyInstaller worker pong;
- electron-builder package;
- packaged Electron → bundled worker pong.

## GitHub Actions

- `.github/workflows/ci.yml` работает на push и pull request;
- `.github/workflows/release.yml` запускается вручную или тегом `v*`;
- release workflow сохраняет установщики как GitHub Actions artifacts на 14 дней.

Пример:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Перед тегом версия в `package.json`, `package-lock.json`, worker и интерфейсе должна совпадать.

## Подпись приложений

Текущий workflow способен собрать проверенные, но неподписанные artifacts. Для публичного распространения необходимо добавить сертификаты в GitHub Secrets и только затем включить подпись/notarization в release job.

Секреты и сертификаты нельзя коммитить в репозиторий, передавать через issue/PR или печатать в логах. После подключения подписи требуется отдельная проверка установленного NSIS и DMG на чистых машинах.

## Ручная приёмка

Перед публикацией:

1. установить artifact на чистую систему без Python и Node.js;
2. импортировать небольшой тестовый Telegram Export;
3. переключить год и `ALL`;
4. проверить пересборку отчёта без повторного импорта;
5. открыть Share Preview и экспортировать безопасный PNG/PDF;
6. выполнить «Стереть все данные», дождаться возврата на стартовый экран и проверить отсутствие БД, отчёта и кэша;
7. убедиться, что после перезапуска старый отчёт больше не предлагается.
