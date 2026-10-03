import {applyCommand,requestSchema,fail,commandBasisText,JournalError} from "../lib/domain";
import {readWorkspace,writeWorkspace,completed,digest} from "../lib/repository";
import {readJSON,errorResponse} from "../lib/http";
export async function GET(){try{return Response.json({state:await readWorkspace(),aiConfigured:!!process.env.GIGACHAT_AUTH_KEY},{headers:{"Cache-Control":"no-store"}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 const body=requestSchema.parse(await readJSON(request));const fingerprint=digest(body.command);
 if(await completed(body.requestId,fingerprint))return Response.json({state:await readWorkspace(),duplicate:true});
 for(let attempt=0;attempt<2;attempt++){
 const original=await readWorkspace();if(original.revision!==body.revision&&(!body.contentBasis||digest(commandBasisText(original))!==body.contentBasis))fail("conflict","Данные изменились. Обнови и повтори сохранение — текст останется.",409);
 try{const state=await writeWorkspace(applyCommand(original,body.command),original.revision,body.requestId,fingerprint,body.command.kind);return Response.json({state},{headers:{"Cache-Control":"no-store"}});}catch(e){if(attempt===0&&body.contentBasis&&e instanceof JournalError&&e.code==='conflict')continue;throw e;}
 }
 return fail('conflict','Данные изменились. Повтори сохранение — текст останется.',409);
}catch(e){return errorResponse(e);}}
