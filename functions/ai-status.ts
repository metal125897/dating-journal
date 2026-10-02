import {z} from 'zod';
import {withCors,errorResponse} from '../src/lib/http';
import {jobResponse} from '../src/lib/ai-jobs';
export default async (request:Request)=>withCors(request,async()=>{try{if(request.method!=='GET')return new Response(null,{status:405});const id=z.uuid().parse(new URL(request.url).searchParams.get('requestId'));return await jobResponse(id);}catch(e){return errorResponse(e);}});
