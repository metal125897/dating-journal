import assert from 'node:assert/strict';
import {db,acquireAI,releaseAI} from '../src/lib/repository';
import {prepareJob} from '../src/lib/ai-jobs';
const job=crypto.randomUUID(),attempt=crypto.randomUUID();let owner:string|undefined;
try{
 const lock=await db()`SELECT lease_until<now() AND (last_started_at IS NULL OR last_started_at<now()-interval '3 seconds') AS free FROM journal_ai_lock WHERE id=true`;
 if(!lock[0]?.free)throw new Error('A real AI request is active; rerun when idle');
 await prepareJob(job,'synthetic-priority-check','signals');
 await assert.rejects(acquireAI(attempt,'synthetic-tag-check','tags'),/другой запрос/);
 await db()`UPDATE journal_ai_jobs SET status='done' WHERE id=${job}::uuid`;
 owner=await acquireAI(attempt,'synthetic-tag-check','tags');
 console.log('Queued analysis blocks tags; completed analysis releases priority: passed');
}finally{
 if(owner)await releaseAI(attempt,undefined,owner);
 await db()`DELETE FROM journal_ai_jobs WHERE id=${job}::uuid`;
 await db()`DELETE FROM journal_operations WHERE id=${attempt}::uuid`;
}
