import { z } from "zod";
import { Workspace, Session, TAGS, requireAI, requirePerson, personalEntries, sourceMap, basisText, questionsSchema, validateResult, answersSchema, JournalError, fail } from "../lib/domain";
import { readWorkspace, writeWorkspace, completed, digest, acquireAI, releaseAI } from "../lib/repository";
import { readJSON, errorResponse } from "../lib/http";
import { generate } from "../lib/provider";
import { PROMPT_VERSION } from "../lib/prompts";
const schema=z.object({requestId:z.uuid(),kind:z.enum(["tags","signals","questions","submitA","submitB","amendment"]),personId:z.uuid(),entryId:z.uuid().optional(),type:z.enum(["A","B"]).optional(),sessionId:z.uuid().optional(),userQuestion:z.string().trim().max(4000).optional(),answers:z.array(z.string().trim().min(1).max(20000)).length(3).optional(),questionIndex:z.number().int().min(0).max(2).optional(),text:z.string().trim().min(1).max(20000).optional()});
export async function POST(request:Request){let operationId:string|undefined;let locked=false;try{
 const b=schema.parse(await readJSON(request));operationId=b.requestId;const fingerprint=digest(b);
 if(await completed(b.requestId,fingerprint))return Response.json({state:await readWorkspace(),duplicate:true});
 const original=await readWorkspace();requireAI(original,b.personId,b.kind==="tags");
 if(!process.env.GIGACHAT_AUTH_KEY&&!(b.kind==="submitA"&&b.answers&&answersSchema(b.answers).every(x=>x.skipped)))fail("ai_config","AI ещё не подключён. Проверь Настройки.",503);
 await acquireAI(b.requestId,fingerprint,b.kind);locked=true;
 const state:Workspace=structuredClone(original);const expectedBasis=digest(basisText(original,b.personId));const now=new Date().toISOString();
 const session=b.sessionId?state.sessions.find(x=>x.id===b.sessionId&&x.personId===b.personId):undefined;
 const skippedTopics=state.sessions.filter(x=>x.personId===b.personId).flatMap(x=>x.packets.flatMap(p=>p.answers.flatMap((a,i)=>a.skipped?[x.questions[i]?.topic||""]:[])));
 let packetId:string|undefined;let amendmentId:string|undefined;
 if(b.kind==="submitA"||b.kind==="submitB") {if(!session||session.stage!=="questions"||session.type!==(b.kind==="submitA"?"A":"B"))fail("session","Этот пакет уже отправлен или не найден",409);if(session.basis!==expectedBasis)fail("stale","Основание изменилось. Получи новые вопросы; ответы остаются в черновике.",409);const answers=answersSchema(b.answers);packetId=crypto.randomUUID();session.packets.push({id:packetId,answers,submittedAt:now});}
 if(b.kind==="amendment"){if(!session||session.stage!=="done"||session.type!=="A"||b.questionIndex===undefined||!b.text)fail("session","Выбери отправленный вопрос и напиши дописку");amendmentId=crypto.randomUUID();session.amendments.push({id:amendmentId,questionIndex:b.questionIndex,text:b.text,submittedAt:now,result:null});}
 const input={person:requirePerson(state,b.personId),user:state.user,entries:personalEntries(state,b.personId),sources:Object.fromEntries(sourceMap(state,b.personId)),type:b.type||session?.type,userQuestion:b.userQuestion||session?.userQuestion,questions:session?.questions,packets:session?.packets,amendments:session?.amendments,skippedTopics};
 async function validated<T>(validator:(v:unknown)=>T,kind:string=b.kind,payload:unknown=input):Promise<T>{let feedback:unknown;for(let attempt=0;attempt<2;attempt++){try{return validator(await generate(kind,feedback?{input:payload,validationFeedback:feedback}:payload));}catch(e){const retry=e instanceof z.ZodError||e instanceof JournalError&&["invalid_ai","invalid_sources"].includes(e.code);feedback=e instanceof z.ZodError?e.issues.map(x=>({path:x.path,code:x.code,message:x.message})):e instanceof JournalError?e.code:undefined;if(e instanceof z.ZodError)console.error("AI format paths:",JSON.stringify(feedback));if(!retry)throw e;if(attempt===1){if(e instanceof z.ZodError)fail("invalid_ai","Ответ модели не прошёл проверку формата. Повтори запрос; записи сохранены.",502);throw e;}}}return fail("invalid_ai","Не удалось проверить ответ модели",502);}
 if(b.kind==="tags"){
  const entry=state.entries.find(x=>x.id===b.entryId&&x.personId===b.personId)||fail("entry","Запись не найдена",404);if(entry.manualTags)fail("manual","Теги уже изменены вручную",409);
  const result=await validated(v=>z.object({tags:z.array(z.enum(TAGS)).max(5)}).parse(v),"tags",{text:entry.text});entry.tags=[...new Set(result.tags)];entry.tagging="done";entry.version++;entry.updatedAt=now;
 }else if(b.kind==="questions"){
  if(!b.type||b.type==="B"&&!b.userQuestion?.trim())fail("question","Напиши вопрос");
  const result=await validated(v=>{const q=questionsSchema.parse(v);if(new Set(q.questions.map(x=>x.topic.toLowerCase())).size!==3||q.questions.some(x=>skippedTopics.some(t=>t.toLowerCase()===x.topic.toLowerCase())))fail("invalid_ai","Модель повторила тему вопроса",502);return q;});
  const created:Session={id:crypto.randomUUID(),personId:b.personId,type:b.type,userQuestion:b.userQuestion||"",questions:result.questions,basis:expectedBasis,stage:"questions",packets:[],amendments:[],result:null,generatedAt:now};state.sessions.push(created);
 }else if(b.kind==="signals"){
  const result=await validated(v=>validateResult(v,state,b.personId));state.reports=state.reports.filter(x=>x.personId!==b.personId);state.reports.push({id:crypto.randomUUID(),personId:b.personId,basis:expectedBasis,result,generatedAt:now,model:process.env.GIGACHAT_MODEL||"GigaChat-2",promptVersion:PROMPT_VERSION});
 }else if(session){
  if(b.kind==="submitA"&&session.packets.at(-1)?.answers.every(x=>x.skipped))session.result={blocks:[{kind:"basis",title:"Без ответа",text:"Пропуски сохранены как границы тем. Новых фактов и дополнений нет; модель не вызывалась.",sources:[]}],summary:"Все три ответа пропущены. Можно вернуться к теме отдельной допиской.",additions:[]};
  else {const result=await validated(v=>{const r=validateResult(v,state,b.personId);if(b.kind==="submitB"&&!r.nextStep)fail("invalid_ai","В ответе нет следующего шага",502);if(b.kind==="submitB"&&session.packets.at(-1)?.answers.some(x=>!x.skipped)&&!r.blocks.some(x=>x.sources.some(y=>y.id.startsWith(packetId+":"))))fail("invalid_sources","Модель не использовала отправленные ответы",502);return r;});if(amendmentId)session.amendments.find(x=>x.id===amendmentId)!.result=result;else session.result=result;}
  session.stage="done";session.basis=digest(basisText(state,b.personId));
 }
 const current=await readWorkspace();requireAI(current,b.personId,b.kind==="tags");if(current.revision!==original.revision||digest(basisText(current,b.personId))!==expectedBasis)fail("stale","Данные изменились во время анализа. Ответ не применён; повтори по актуальным записям.",409);
 const saved=await writeWorkspace(state,original.revision,b.requestId,fingerprint,"ai."+b.kind);await releaseAI(b.requestId);locked=false;
 return Response.json({state:saved},{headers:{"Cache-Control":"no-store"}});
}catch(e){if(operationId&&locked)await releaseAI(operationId,e instanceof JournalError?e.code:"invalid_ai").catch(()=>{});return errorResponse(e);}}

