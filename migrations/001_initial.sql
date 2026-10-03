BEGIN;
CREATE TABLE IF NOT EXISTS journal_workspace (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 revision bigint NOT NULL DEFAULT 0,
 body jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO journal_workspace(id,body) VALUES(true,'{"schemaVersion":1,"revision":0,"consent":false,"user":{"context":"","values":[],"updatedAt":""},"people":[],"reports":[],"sessions":[]}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS journal_entries (
 id uuid PRIMARY KEY,
 person_id uuid NOT NULL,
 event_date date NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 body jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS journal_entries_person_date ON journal_entries(person_id,event_date DESC,created_at DESC);
CREATE TABLE IF NOT EXISTS journal_operations (
 id uuid PRIMARY KEY,
 fingerprint text NOT NULL,
 result jsonb,
 kind text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','done','error')),
 started_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz NOT NULL DEFAULT now(),
 error_code text
);
CREATE TABLE IF NOT EXISTS journal_ai_lock(id boolean PRIMARY KEY DEFAULT true CHECK(id),owner uuid,lease_until timestamptz NOT NULL DEFAULT now(),last_started_at timestamptz);
INSERT INTO journal_ai_lock(id) VALUES(true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION journal_read() RETURNS jsonb LANGUAGE sql AS $$
 SELECT w.body || jsonb_build_object('revision',w.revision,'entries',COALESCE((SELECT jsonb_agg(e.body || jsonb_build_object('eventDate',e.event_date::text,'createdAt',to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',to_char(e.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) FROM journal_entries e),'[]'::jsonb)) FROM journal_workspace w WHERE w.id=true;
$$;
CREATE OR REPLACE FUNCTION journal_write(expected bigint, next_state jsonb, op_id uuid, op_fingerprint text, op_kind text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE current_revision bigint; previous journal_operations%ROWTYPE; item jsonb; result_state jsonb;
BEGIN
 SELECT revision INTO current_revision FROM journal_workspace WHERE id=true FOR UPDATE;
 SELECT * INTO previous FROM journal_operations WHERE id=op_id;
 IF FOUND AND previous.fingerprint<>op_fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH'; END IF;
 IF previous.status='done' THEN RETURN jsonb_build_object('duplicate',true,'state',journal_read()); END IF;
 IF current_revision<>expected THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 IF op_kind='wipe' THEN UPDATE journal_tag_worker SET owner=NULL,lease_until=now(); DELETE FROM journal_ai_jobs; DELETE FROM journal_operations; UPDATE journal_ai_lock SET owner=NULL,lease_until=now(); END IF;
 DELETE FROM journal_entries WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(next_state->'entries') x WHERE (x->>'id')::uuid=journal_entries.id);
 FOR item IN SELECT * FROM jsonb_array_elements(next_state->'entries') LOOP
  INSERT INTO journal_entries(id,person_id,event_date,created_at,updated_at,body) VALUES((item->>'id')::uuid,(item->>'personId')::uuid,(item->>'eventDate')::date,(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz,item-'eventDate'-'createdAt'-'updatedAt') ON CONFLICT(id) DO UPDATE SET person_id=EXCLUDED.person_id,event_date=EXCLUDED.event_date,updated_at=EXCLUDED.updated_at,body=EXCLUDED.body;
 END LOOP;
 UPDATE journal_workspace SET revision=revision+1,body=next_state-'entries'-'revision',updated_at=now() WHERE id=true;
 result_state=journal_read();
 INSERT INTO journal_operations(id,fingerprint,result,kind,status) VALUES(op_id,op_fingerprint,'{"applied":true}',op_kind,'done') ON CONFLICT(id) DO UPDATE SET result=EXCLUDED.result,status='done',error_code=NULL;
 RETURN jsonb_build_object('duplicate',false,'state',result_state);
END;$$;
COMMIT;
