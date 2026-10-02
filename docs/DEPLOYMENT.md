# Подключение и публикация

Дневник — отдельный репозиторий `metal125897/dating-journal`. Не использовать Firebase, workflow, данные или secrets вишлиста.

Клиент: GitHub Pages, статическая сборка `build/`, относительный Vite base. Сервер: Netlify Free Functions (`journal`, `ai`, `ai-background`, `ai-status`). БД: отдельный Neon Free проект `curly-tree-26583770`, Frankfurt. Модель: GigaChat-2-Max, API физлица, Freemium. Vercel исключён по запросу владельца.

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

Production: AI POST ставит задачу и возвращает 202. Background worker ограничен 120 секундами (сам анализ 110), генерация до 60 секунд, OAuth до 8, резерв БД 12. Клиент опрашивает ai-status до 140 секунд. AI-lease 150 секунд, job-lease 130 секунд, интервал модели 3 секунды. [Background Functions](https://docs.netlify.com/build/functions/background-functions/) доступны в Free и поддерживают до 15 минут; наш бюджет существенно меньше. Миграция 002 добавляет только техническую таблицу заданий, не меняет записи дневника. npm run migrate применяет все SQL в порядке имени.

Фактические результаты — `TEST_REPORT.md`. Публичную ссылку и статус «проверено» записывать только после успешного открытия.

## Проверка секретов Netlify

Секретны только `DATABASE_URL` и `GIGACHAT_AUTH_KEY`. При первоначальном импорте публичные `FRONTEND_ORIGIN`, `GIGACHAT_MODEL`, `GIGACHAT_SCOPE` также получили неизменяемый secret flag. Журнал сборки подтвердил ложные срабатывания ровно для этих трёх ключей. `SECRETS_SCAN_OMIT_KEYS` в netlify.toml исключает только их; сканирование настоящих ключей и остальных файлов остаётся включённым. Не расширять список на credentials и не выключать сканер. [Правила Netlify](https://docs.netlify.com/manage/security/secret-scanning/).


На стенде 2 октября зафиксирован обрыв обычного и потокового запроса на 30 000 мс. Потоковый эксперимент удалён. Для production используется отдельная фоновая функция; успешный результат подтверждать её статусом и чтением из БД, а не HTTP 202.
