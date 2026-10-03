BEGIN;
ALTER TABLE journal_ai_jobs ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'analysis';
CREATE TABLE IF NOT EXISTS journal_tag_worker(id boolean PRIMARY KEY DEFAULT true CHECK(id),owner uuid,lease_until timestamptz NOT NULL DEFAULT now());
INSERT INTO journal_tag_worker(id) VALUES(true) ON CONFLICT DO NOTHING;
DO $$
BEGIN
 PERFORM id FROM journal_workspace WHERE id=true FOR UPDATE;
 UPDATE journal_entries SET body=jsonb_set(body,'{tagging}','"pending"') WHERE body->>'manualTags'='false' AND body->>'tagging'<>'pending' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'tags') AS tag WHERE tag IN ('контакт','напряжение','поступок','договорённость','рефлексия'));
 IF FOUND THEN UPDATE journal_workspace SET revision=revision+1,updated_at=now() WHERE id=true; END IF;
END;$$;
CREATE OR REPLACE FUNCTION journal_tag_error(entry_id uuid, entry_version integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM journal_workspace WHERE id=true FOR UPDATE;
 UPDATE journal_entries SET body=jsonb_set(body,'{tagging}','"error"') WHERE id=entry_id AND (body->>'version')::integer=entry_version AND body->>'tagging'='pending' AND body->>'manualTags'='false';
 IF FOUND THEN UPDATE journal_workspace SET revision=revision+1,updated_at=now() WHERE id=true; END IF;
END;$$;
COMMIT;
