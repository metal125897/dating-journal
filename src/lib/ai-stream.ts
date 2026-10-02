import {errorResponse} from './http';
// Send JSON whitespace immediately; never send unvalidated model tokens.
// Once headers are sent, the final HTTP outcome travels in httpStatus.
export function streamAI(action:()=>Promise<Response>):Response {
 const encoder=new TextEncoder();
 let cancelled=false;let heartbeat:ReturnType<typeof setInterval>|undefined;
 const body=new ReadableStream<Uint8Array>({async start(controller){
  controller.enqueue(encoder.encode(' '));
  heartbeat=setInterval(()=>{if(!cancelled)controller.enqueue(encoder.encode(' '));},5000);
  try {const response=await action().catch(errorResponse);const data=await response.json();if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify({...data,httpStatus:response.status})));}
  catch {if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify({httpStatus:503,code:'unavailable',message:'Ответ AI прервался. Записи и черновик сохранены — попробуй ещё раз.'})));}
  finally {clearInterval(heartbeat);if(!cancelled)controller.close();}
 },cancel(){cancelled=true;clearInterval(heartbeat);}});
 return new Response(body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
