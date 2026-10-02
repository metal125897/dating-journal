# Подключение и публикация

Дневник — отдельный репозиторий `metal125897/dating-journal`. Не использовать Firebase, workflow, данные или secrets вишлиста.

Клиент: GitHub Pages, статическая сборка `build/`, относительный Vite base. Сервер: Netlify Free Functions (`journal`, `ai`). БД: отдельный Neon Free проект `curly-tree-26583770`, Frankfurt. Модель: GigaChat-2-Max, API физлица, Freemium. Vercel исключён по запросу владельца.

[Netlify Free](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) имеет бесплатный лимит без автоматического пополнения. [Тариф GigaChat](https://developers.sber.ru/docs/ru/gigachat/tariffs/individual-tariffs) и остаток проверяются в Sber Studio; покупки токенов не включать. Достижение квоты останавливает AI, записи остаются доступны.

## Локально

1. `npm ci --cache .npm-cache` из каталога дневника.
2. Заполнить `.env.local` по `.env.example`; секреты в чат не передавать.
3. `npm run migrate` применяет SQL к новой БД.
4. В двух терминалах: `npm run dev:api` (127.0.0.1:3101) и `npm run dev` (127.0.0.1:3100).
5. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## В облаке

1. Публиковать только каталог дневника как корень отдельного репозитория. `.env.local`, caches и node_modules исключены.
2. Импортировать этот репозиторий в Netlify, использовать `netlify.toml`: build `npm run build:api`, publish `api-public`, Functions `functions/`. План только Free.
3. В server environment внести `DATABASE_URL`, `GIGACHAT_AUTH_KEY`, `GIGACHAT_MODEL=GigaChat-2-Max`, `GIGACHAT_SCOPE=GIGACHAT_API_PERS`, `FRONTEND_ORIGIN=https://metal125897.github.io`. Значения ключей не становятся VITE-переменными.
4. В GitHub Actions variable `VITE_API_BASE` указать HTTPS-домен API Netlify; это публичный адрес, не секрет. В Pages выбрать GitHub Actions; workflow собирает и публикует `build/`.
5. Проверить `/dating-journal/`, относительные ресурсы, CORS, чтение и запись после перезагрузки, реальный AI и цитаты на временном вымышленном наборе. Удалить только тестовый набор.
6. Домашний и мобильный интернет РФ без VPN проверяются отдельно. Локальная проверка не доказывает доступ опубликованного URL из обеих сетей.

## TLS и время запроса

`certs/russian-trusted-root.pem` получен с официального адреса, указанного в [документации Sber](https://developers.sber.ru/docs/ru/gigachat/certificates). SHA-256: `D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31`. Только серверный undici Agent добавляет CA к стандартным корням; `rejectUnauthorized=true`. Сертификат включён в пакет Functions; отключать TLS запрещено.

OAuth ограничен 8 секундами, один вызов модели — до 35 секунд; повтор только при невалидном структурированном ответе, максимум один в общем бюджете 55 секунд с резервом 12 секунд на БД. Блокировка AI в БД имеет lease 150 секунд и интервал 3 секунды. [Синхронные Functions](https://docs.netlify.com/build/functions/configuration/) имеют лимит 60 секунд.

Фактические результаты — `TEST_REPORT.md`. Публичную ссылку и статус «проверено» записывать только после успешного открытия.

## Проверка секретов Netlify

Секретны только `DATABASE_URL` и `GIGACHAT_AUTH_KEY`. При первоначальном импорте публичные `FRONTEND_ORIGIN`, `GIGACHAT_MODEL`, `GIGACHAT_SCOPE` также получили неизменяемый secret flag. Журнал сборки подтвердил ложные срабатывания ровно для этих трёх ключей. `SECRETS_SCAN_OMIT_KEYS` в netlify.toml исключает только их; сканирование настоящих ключей и остальных файлов остаётся включённым. Не расширять список на credentials и не выключать сканер. [Правила Netlify](https://docs.netlify.com/manage/security/secret-scanning/).


На опубликованной функции 2 октября зафиксирован жёсткий обрыв buffered-запроса на 30 000 мс несмотря на документированный sync-limit 60 секунд. AI возвращает потоковый JSON: немедленный пробел и heartbeat, затем только итог проверенного запроса. По документации streaming имеет 60-секундный лимит. Статус операции передаётся в httpStatus итогового JSON, клиент проверяет также code; HTTP 200 начала потока не означает успешный анализ.
