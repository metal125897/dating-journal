import {GET,POST} from "../src/server/journal";
import {withCors} from "../src/lib/http";
import {kickTags} from '../src/lib/tag-queue';
export default async (request:Request)=>withCors(request,async()=>{const response=request.method==='GET'?await GET():request.method==='POST'?await POST(request):new Response(null,{status:405});if(response.ok){const data=await response.clone().json();await kickTags(data.state).catch(()=>console.error('Tag queue wake deferred'));}return response;});
