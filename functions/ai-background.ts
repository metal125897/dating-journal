import {POST,aiRequestSchema} from '../src/server/ai';
import {readJSON,errorResponse} from '../src/lib/http';
import {claimJob,finishJob} from '../src/lib/ai-jobs';
import {digest} from '../src/lib/repository';
import {withRequestBudget} from '../src/lib/request-budget';
import {kickTags} from '../src/lib/tag-queue';
export default async (request:Request)=>withRequestBudget(240000,async()=>{
 let id:string|undefined;let claimed=false;
 try {const input=aiRequestSchema.parse(await readJSON(request));id=input.requestId;claimed=await claimJob(id,digest(input));if(!claimed)return;
  const waitingUntil=Date.now()+110000;let result:Response;
  while(true){result=await POST(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(input)}),110000);if(result.status!==429||(await result.clone().json()).code!=='busy'||Date.now()>=waitingUntil)break;await new Promise(r=>setTimeout(r,4000));}
  await finishJob(id,result);
  await kickTags().catch(()=>console.error('Tag queue wake deferred'));
 }catch(e){if(id&&claimed)await finishJob(id,errorResponse(e)).catch(()=>console.error('AI job finalization unavailable'));else console.error('AI job rejected:',e instanceof Error?e.name:'unknown');}
});
export const config={background:true};
