import {POST} from "../src/server/ai";
import {withCors} from "../src/lib/http";
export default async (request:Request)=>withCors(request,()=>request.method==="POST"?POST(request):Promise.resolve(new Response(null,{status:405})));
