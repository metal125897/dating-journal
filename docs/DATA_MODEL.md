# Модель данных

Схема TypeScript и серверная валидация находятся в `src/lib/domain.ts`. SQL — `migrations/001_initial.sql`. Названия/идентификаторы технических сущностей не показываются пользователю.

| Сущность | Данные |
|---|---|
| Workspace | schemaVersion, revision, consent, user.context, user.values, user.expectations, user.aiContext[], user.excludedMemorySources[], user.updatedAt |
| Person | UUID, name, birth nullable, city, job, context, likes[], dislikes[], active/archived, archivedAt nullable, createdAt, updatedAt |
| Entry | UUID, personId, text, eventDate, createdAt, updatedAt, version, tags[], manualTags, tagging pending/done/error |
| Report | UUID, personId, result, verified sources, basis, model, promptVersion, generatedAt |
| Question session | UUID, personId, A/B, userQuestion, три question с topic, stage, basis, result, generatedAt |
| Answer packet | UUID, sessionId, answers[3] с text/skipped, submittedAt; append-only |
| Amendment | UUID, sessionId, исходный вопрос, text, submittedAt, result; append-only |
| Context addition | target user/person/interaction, sourceId исходного ответа, text; пользовательские свободные поля не заменяются |
| Operation | UUID idempotency key, fingerprint, status, lease, errorCode, kind; безопасные служебные сведения |

Дата события — календарная YYYY-MM-DD, SQL DATE; не конвертируется в UTC-полночь. Created/updated — ISO timestamp/timestamptz. Возраст вычисляется по местному календарю; будущая дата рождения запрещена. Теги только из фиксированного словаря, без дубликатов.

Основание — хеш текущего персонального контекста, записей и тегов, пользовательских ценностей, отправленных ответов и дописок. Новое основание помечает старые результаты устаревшими. Удаление записи очищает затронутые AI-результаты; удаление человека удаляет все связанные данные. Удаление всей области очищает сущности, операции, локальные черновики и согласие, не делает seed.

Изменения схемы одновременно отражать в типах, серверной валидации, SQL, клиентах, экспорте, тестах и этой документации. Миграции не уничтожают существующие данные. Секреты и значения environment в сущности не входят.

Короткие ref модели существуют только внутри одного запроса. В БД и экспорте по-прежнему сохраняются проверенные sources {id,quote,label}, additions.sourceId; миграция данных для нового цитирования не требуется.

AI job: journal_ai_jobs хранит UUID, fingerprint, queued/running/done/error, lease_until, безопасные error_code/message/status и updated_at. Текст запроса, ключи и копия дневника в задаче не хранятся. Повтор с другим fingerprint отклоняется; worker может захватить queued только один раз. Явный повтор error создаёт новую попытку того же запроса. Wipe атомарно очищает также задания; старый worker не возвращает удалённые данные из снимка благодаря CAS.

Memory: id, text, sourceId (служебное происхождение), personId, updatedAt, edited. UI настроек не показывает источники. excludedMemorySources хранит ID удалённых дополнений, предотвращая их повторное импортирование. Удаление человека чистит связанные memory/exclusions; wipe всё сбрасывает. AnswerEvent — проекция Packet с вопросами/ответами/датой, не новая копия Entry; порог AI считает только Entry. 003 добавляет request_kind в AI job и singleton journal_tag_worker; pending Entry сохраняет очередь. Автоматические теги не меняют версию содержания; ручные правки меняют её. В хеше фактического основания нет технического состояния автоматической разметки.
