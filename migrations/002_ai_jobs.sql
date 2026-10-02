CREATE TABLE IF NOT EXISTS journal_ai_jobs (
 id uuid PRIMARY KEY,
 fingerprint text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','done','error')),
 lease_until timestamptz NOT NULL,
 error_code text,
 error_message text,
 error_status integer,
 updated_at timestamptz NOT NULL DEFAULT now()
);
