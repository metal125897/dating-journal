import {POST} from "../src/server/ai";
import {withCors} from "../src/lib/http";
import {streamAI} from "../src/lib/ai-stream";
export default async (request:Request)=>withCors(request,()=>Promise.resolve(request.method==="POST"?streamAI(()=>POST(request)):new Response(null,{status:405})));
