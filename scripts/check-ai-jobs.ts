import assert from 'node:assert/strict';
import {prepareJob,claimJob,finishJob,jobResponse} from '../src/lib/ai-jobs';
import {db} from '../src/lib/repository';
const id=crypto.randomUUID();
try {
 assert.equal(await prepareJob(id,'synthetic-job-test'),'queued');
 assert.equal((await jobResponse(id)).status,202);
 await assert.rejects(prepareJob(id,'different-input'),/другим содержимым/);
 assert.equal(await claimJob(id,'synthetic-job-test'),true);
 assert.equal(await claimJob(id,'synthetic-job-test'),false);
 assert.equal(await prepareJob(id,'synthetic-job-test'),'running');
 await finishJob(id,Response.json({code:'threshold',message:'Нужно пять записей'},{status:403}));
 assert.equal((await jobResponse(id)).status,403);
 assert.equal(await prepareJob(id,'synthetic-job-test'),'queued');
 assert.equal(await claimJob(id,'synthetic-job-test'),true);
 await finishJob(id,Response.json({state:{}}));
 assert.equal(await prepareJob(id,'synthetic-job-test'),'done');
 assert.equal((await jobResponse(id)).status,200);
 console.log('Neon AI jobs: queue, duplicate ownership, fingerprint, failure, explicit retry and completed result passed');
}finally{await db()`DELETE FROM journal_ai_jobs WHERE id=${id}::uuid`;console.log('Only synthetic job removed');}
