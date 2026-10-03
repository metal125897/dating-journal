import {fetch} from 'undici';
import {db,readWorkspace} from './repository';
import {Workspace} from './domain';
import {POST as analyze} from '../server/ai';
export function pendingTags(s:Workspace){return s.consent?s.entries.filter(e=>e.tagging==='pending'&&!e.manualTags):[];}
// The persisted entry's pending flag is the queue. No diary copy or browser worker.
export async function kickTags(s?:Workspace){
 if(!process.env.GIGACHAT_AUTH_KEY||!process.env.URL)return;
 const state=s||await readWorkspace();if(!pendingTags(state).length)return;
 const owner=crypto.randomUUID();
 const claimed=await db()`UPDATE journal_tag_worker SET owner=${owner}::uuid,lease_until=now()+interval '10 minutes' WHERE id=true AND lease_until<now() RETURNING owner`;
 if(!claimed.length)return;
 try {const response=await fetch(new URL('/.netlify/functions/tags-background',process.env.URL),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner}),signal:AbortSignal.timeout(2500)});await response.body?.cancel();if(response.status!==202)throw new Error('dispatch');}
 catch {await db()`UPDATE journal_tag_worker SET owner=NULL,lease_until=now() WHERE owner=${owner}::uuid`;console.error('Tag queue dispatch deferred');}
}
export async function drainTags(owner:string){
 const lease=await db()`SELECT owner FROM journal_tag_worker WHERE owner=${owner}::uuid AND lease_until>now()`;if(!lease.length)return;
 const until=Date.now()+450000;
 try {while(Date.now()<until){
  const state=await readWorkspace();const entry=pendingTags(state)[0];if(!entry||!process.env.GIGACHAT_AUTH_KEY)break;
  const active=await db()`SELECT owner FROM journal_tag_worker WHERE owner=${owner}::uuid AND lease_until>now()`;if(!active.length)break;
  const response=await analyze(new Request('https://internal/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),kind:'tags',personId:entry.personId,entryId:entry.id})}),110000);
  if(!response.ok){const error=await response.json();if(['busy','stale','conflict'].includes(error.code)){await new Promise(r=>setTimeout(r,4000));continue;}if(error.code==='consent')break;await db()`SELECT journal_tag_error(${entry.id}::uuid,${entry.version})`;}
  await new Promise(r=>setTimeout(r,3200));
 }}finally{await db()`UPDATE journal_tag_worker SET owner=NULL,lease_until=now() WHERE owner=${owner}::uuid`;}
 await kickTags();
}
