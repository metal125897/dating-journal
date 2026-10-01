import {createServer} from "node:http";
import {GET,POST} from "../src/server/journal";
import {POST as AI} from "../src/server/ai";
import {withCors} from "../src/lib/http";
createServer(async(req,res)=>{const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>100000){res.writeHead(413);res.end();return;}chunks.push(chunk);}const body=Buffer.concat(chunks);const request=new Request("http://127.0.0.1:3101"+req.url,{method:req.method,headers:req.headers as HeadersInit,...(body.length?{body}:{} )});const response=await withCors(request,()=>req.url?.startsWith("/api/ai")?AI(request):req.method==="GET"?GET():POST(request));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}).listen(3101,"127.0.0.1",()=>console.log("API дневника: 127.0.0.1:3101"));
