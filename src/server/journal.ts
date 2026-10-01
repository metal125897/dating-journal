import {applyCommand,requestSchema,fail} from "../lib/domain";
import {readWorkspace,writeWorkspace,completed,digest} from "../lib/repository";
import {readJSON,errorResponse} from "../lib/http";
export async function GET(){try{return Response.json({state:await readWorkspace(),aiConfigured:!!process.env.GIGACHAT_AUTH_KEY},{headers:{"Cache-Control":"no-store"}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 const body=requestSchema.parse(await readJSON(request));const fingerprint=digest(body.command);
 if(await completed(body.requestId,fingerprint))return Response.json({state:await readWorkspace(),duplicate:true});
 const original=await readWorkspace();if(original.revision!==body.revision)fail("conflict","Данные изменились. Обнови и повтори сохранение — текст останется.",409);
 const state=await writeWorkspace(applyCommand(original,body.command),body.revision,body.requestId,fingerprint,body.command.kind);
 return Response.json({state},{headers:{"Cache-Control":"no-store"}});
}catch(e){return errorResponse(e);}}
