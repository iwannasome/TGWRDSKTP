# Запуск TGWRDSKTP через Docker

## 1. Клонировать репозиторий

```bash
git clone https://github.com/iwannasome/TGWRDSKTP.git
cd TGWRDSKTP
```

## 2. Собрать Docker-образ

```bash
docker build --no-cache -t tgwr-desktop .
```
## 3. Подготовить папки для данных

```bash 
mkdir -p data output
```

Папка data нужна для экспорта Telegram Desktop.
Папка output нужна для сохранения результата работы приложения.

## 4. Запустить контейнер

```bash
  docker run -d \
  --name tgwr \
  --security-opt seccomp=unconfined \
  --cap-add=SYS_ADMIN \
  -p 6080:6080 \
  -v "$PWD/data:/data" \
  -v "$PWD/output:/output" \
  -v tgwr_config:/home/node/.config \
  tgwr-desktop
```

## 5. Открыть приложение

После запуска открой в браузере:

```text
http://127.0.0.1:6080/vnc.html?autoconnect=1
```

## 6. Папки внутри приложения

Если приложение просит выбрать папку с экспортом Telegram Desktop, используй:

```text
/data
```

Если приложение просит выбрать папку для результата, используй:

```text
/output
```

Файлы, которые ты положишь в локальную папку `data`, будут доступны внутри контейнера по пути `/data`.

Результаты, сохранённые в `/output`, появятся в локальной папке `output`.

### Остановить контейнер

Если контейнер запущен в другом окне терминала:

```bash
docker stop tgwr
```
