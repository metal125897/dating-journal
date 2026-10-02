import {aiRequestSchema} from "../src/server/ai";
import {withCors,readJSON,errorResponse} from "../src/lib/http";
import {fetch} from 'undici';
import {prepareJob,finishJob,jobResponse} from '../src/lib/ai-jobs';
import {digest} from '../src/lib/repository';
export default async (request:Request)=>withCors(request,async()=>{try{
 if(request.method!=='POST')return new Response(null,{status:405});
 const input=aiRequestSchema.parse(await readJSON(request));
 const status=await prepareJob(input.requestId,digest(input));
 if(status==='done')return jobResponse(input.requestId);
 if(status==='running')return Response.json({pending:true,requestId:input.requestId},{status:202});
 const origin=process.env.URL||'https://ornate-dolphin-ba40bd.netlify.app';
 const accepted=await fetch(new URL('/.netlify/functions/ai-background',origin),{method:'POST',headers:{'Content-Type':'application/json',...(request.headers.get('origin')?{Origin:request.headers.get('origin')!}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(8000)});
 await accepted.body?.cancel();
 if(accepted.status!==202){const response=Response.json({code:'provider',message:'Не удалось запустить AI. Попробуй ещё раз; записи сохранены.'},{status:503});await finishJob(input.requestId,response.clone());return response;}
 return Response.json({pending:true,requestId:input.requestId},{status:202});
 }catch(e){return errorResponse(e);}});
