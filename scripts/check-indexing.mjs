import assert from 'node:assert/strict';
import {Agent,fetch} from 'undici';
const frontend=process.env.INDEXING_FRONTEND_URL;
const api=process.env.INDEXING_API_URL;
assert.ok(frontend&&api,'Set INDEXING_FRONTEND_URL and INDEXING_API_URL');
const agent=new Agent({connections:2,pipelining:0,connect:{timeout:10000}});
const request=(url,options={})=>fetch(url,{...options,dispatcher:agent,signal:AbortSignal.timeout(20000)});
function headers(response){const policy=response.headers.get('X-Robots-Tag')||'';assert.ok(policy.includes('noindex')&&policy.includes('nofollow'),'Missing server noindex/nofollow');assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');}
try{
 for(const suffix of ['', 'index.html', '?view=ai']){const r=await request(new URL(suffix,frontend));assert.equal(r.status,200);const html=await r.text();assert.match(html,/<meta\s+name="robots"\s+content="[^"]*noindex[^"]*nofollow[^"]*"/i);assert.match(html,/<meta\s+name="referrer"\s+content="no-referrer"/i);}
 console.log('Pages HTML: noindex/nofollow and no-referrer, including query routes: passed');
 const root=await request(api);assert.equal(root.status,200);headers(root);await root.body.cancel();
 // HEAD verifies the real function wrapper without reading or changing the diary.
 const journal=await request(new URL('/.netlify/functions/journal',api),{method:'HEAD'});assert.equal(journal.status,405);headers(journal);assert.equal(journal.headers.get('Cache-Control'),'no-store');
 const invalid=await request(new URL('/.netlify/functions/ai-status?requestId=invalid',api));assert.equal(invalid.status,400);headers(invalid);assert.equal(invalid.headers.get('Cache-Control'),'no-store');await invalid.body.cancel();
 const denied=await request(new URL('/.netlify/functions/journal',api),{headers:{Origin:'https://untrusted.test'}});assert.equal(denied.status,403);headers(denied);await denied.body.cancel();
 console.log('Netlify root, function and error responses: noindex/referrer headers: passed');
}finally{await agent.close();}
