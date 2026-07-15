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
- CI запускает распакованный packaged app и перезапускает встроенный worker на Windows x64, macOS Intel/ARM64 и Linux x64;
- release workflow дополнительно проверяет именно пользовательские файлы: тихо устанавливает и удаляет NSIS, монтирует DMG read-only и извлекает AppImage, после чего запускает приложение и single-instance smoke из каждого artifact;
- ручной release workflow сохраняет установщики и SHA-256 как GitHub Actions artifacts на 14 дней;
- ручной запуск собирает проверочные неподписанные artifacts, но не создаёт GitHub Release;
- запуск по тегу `v*` всегда создаёт **черновик** GitHub Release со всеми установщиками и общей `SHA256SUMS.txt`;
- при полном наборе секретов конкретная платформа подписывается и проходит проверку Authenticode либо Developer ID/notarization;
- если хотя бы одна desktop-платформа выпущена без подписи, черновик автоматически отмечается как **Pre-release**, не становится `Latest` и получает заметную инструкцию для SmartScreen/Gatekeeper;
- публикация проверенного черновика остаётся ручным решением владельца.

Пример patch-релиза:

```bash
git tag v0.2.1
git push origin v0.2.1
```

Перед публикацией черновика подготовь подробный Markdown с причиной выпуска, пользовательским эффектом, проверками, составом артефактов и ограничениями подписи. Для 0.2.1 таким источником служит [`2026-07-15-v0.2.1-release-notes.md`](2026-07-15-v0.2.1-release-notes.md). После завершения matrix его можно передать в `gh release edit --notes-file`, не вставляя многострочный Markdown прямо в shell-команду.

Перед тегом `npm run release:version-check` автоматически проверяет совпадение версии в `package.json`, `package-lock.json`, worker, интерфейсе и README, а также соответствие самого тега.

## Подпись приложений

Ручной workflow и теговый pre-release способны собрать неподписанные artifacts. Их Windows/macOS-шаги не получают даже пустых signing-переменных, поэтому electron-builder не может принять каталог проекта за путь к сертификату. Подпись подключается независимо по платформам: Windows требует два Windows-секрета, macOS — пять Apple-секретов. Полностью отсутствующий набор означает осознанную unsigned-сборку; частично заполненный набор завершает workflow ошибкой. Так случайно использовать половину конфигурации подписи невозможно.

Нужны следующие repository secrets:

| Secret | Назначение |
|---|---|
| `WIN_CSC_LINK` | Base64 или защищённая ссылка на Windows `.p12/.pfx` code-signing certificate |
| `WIN_CSC_KEY_PASSWORD` | Пароль Windows-сертификата |
| `MAC_CSC_LINK` | Base64 Developer ID Application `.p12` |
| `MAC_CSC_KEY_PASSWORD` | Пароль macOS-сертификата |
| `APPLE_API_KEY_BASE64` | Base64-содержимое App Store Connect `.p8` API key |
| `APPLE_API_KEY_ID` | Key ID из App Store Connect |
| `APPLE_API_ISSUER` | Issuer ID из App Store Connect |

Подписываемая Windows-сборка перед упаковкой включает `forceCodeSigning`, а после неё проверяет каждый `.exe` через `Get-AuthenticodeSignature`. Независимо от режима подписи готовый NSIS устанавливается в изолированный каталог runner, оттуда запускается и затем удаляется штатным uninstaller. Подписываемая macOS-сборка декодирует `.p8` только во временный файл с закрытыми правами, использует Hardened Runtime и минимальные Electron entitlements, выполняет notarization через electron-builder, монтирует каждый готовый DMG и проверяет подпись и stapled ticket приложения внутри него, а затем удаляет временный ключ. Отдельный smoke запускает TGWR непосредственно с read-only образа. Linux-проверка извлекает готовый AppImage и запускает renderer и встроенный worker из его фактического содержимого.

Секреты и сертификаты нельзя коммитить в репозиторий, передавать через issue/PR или печатать в логах. После подключения подписи требуется отдельная проверка установленного NSIS и DMG на чистых машинах.

Границы локальной защиты и остаточные риски зафиксированы в [SECURITY.md](SECURITY.md). Перед публикацией проверь, что они всё ещё соответствуют фактической поставке.

## Ручная приёмка

Перед публикацией:

1. убедиться, что Dependabot alerts/security updates, secret scanning, push protection и private vulnerability reporting всё ещё включены в настройках GitHub;
2. установить artifact на чистую систему без Python и Node.js; автоматическая тихая установка/монтирование уже проверяет технический путь, но не заменяет видимые окна установщика, Gatekeeper/SmartScreen и человеческую оценку первого запуска;
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
