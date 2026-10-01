import {GET,POST} from "../src/server/journal";
import {withCors} from "../src/lib/http";
export default async (request:Request)=>withCors(request,()=>request.method==="GET"?GET():request.method==="POST"?POST(request):Promise.resolve(new Response(null,{status:405})));
