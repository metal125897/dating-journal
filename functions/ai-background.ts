import {POST,aiRequestSchema} from '../src/server/ai';
import {readJSON,errorResponse} from '../src/lib/http';
import {claimJob,finishJob} from '../src/lib/ai-jobs';
import {digest} from '../src/lib/repository';
import {withRequestBudget} from '../src/lib/request-budget';
export default async (request:Request)=>withRequestBudget(120000,async()=>{
 let id:string|undefined;let claimed=false;
 try {const input=aiRequestSchema.parse(await readJSON(request));id=input.requestId;claimed=await claimJob(id,digest(input));if(!claimed)return;
  const result=await POST(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(input)}),110000);
  await finishJob(id,result);
 }catch(e){if(id&&claimed)await finishJob(id,errorResponse(e)).catch(()=>console.error('AI job finalization unavailable'));else console.error('AI job rejected:',e instanceof Error?e.name:'unknown');}
});
export const config={background:true};
