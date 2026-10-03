import {evidenceFor,resolveEvidence} from "../lib/evidence";
import {withRequestBudget} from "../lib/request-budget";
import { z } from "zod";
import { Workspace, Session, TAGS, requireAI, requirePerson, personalEntries, basisText, questionsSchema, validateResult, answersSchema, JournalError, fail, addMemories } from "../lib/domain";
import { readWorkspace, writeWorkspace, completed, digest, acquireAI, releaseAI } from "../lib/repository";
import { readJSON, errorResponse } from "../lib/http";
import { generate } from "../lib/provider";
import { PROMPT_VERSION } from "../lib/prompts";
export const aiRequestSchema=z.object({requestId:z.uuid(),kind:z.enum(["tags","signals","questions","submitA","submitB","amendment"]),personId:z.uuid(),entryId:z.uuid().optional(),type:z.enum(["A","B"]).optional(),sessionId:z.uuid().optional(),userQuestion:z.string().trim().max(4000).optional(),answers:z.array(z.string().trim().min(1).max(20000)).length(3).optional(),questionIndex:z.number().int().min(0).max(2).optional(),text:z.string().trim().min(1).max(20000).optional()});
export async function POST(request:Request,budget=55000){return withRequestBudget(budget,()=>handlePOST(request));}
async function handlePOST(request:Request){let operationId:string|undefined;let lockOwner:string|undefined;let locked=false;try{
 const b=aiRequestSchema.parse(await readJSON(request));operationId=b.requestId;const fingerprint=digest(b);
 if(await completed(b.requestId,fingerprint))return Response.json({state:await readWorkspace(),duplicate:true});
 const original=await readWorkspace();requireAI(original,b.personId,b.kind==="tags");
 const allSkipped=b.kind==="submitA"&&b.answers&&answersSchema(b.answers).every(x=>x.skipped);
 if(!process.env.GIGACHAT_AUTH_KEY&&!allSkipped)fail("ai_config","AI ещё не подключён. Проверь Настройки.",503);
 if(!allSkipped){lockOwner=await acquireAI(b.requestId,fingerprint,b.kind);locked=true;}
 const state:Workspace=structuredClone(original);const expectedBasis=digest(basisText(original,b.personId));const now=new Date().toISOString();
 const session=b.sessionId?state.sessions.find(x=>x.id===b.sessionId&&x.personId===b.personId):undefined;
 const skippedTopics=state.sessions.filter(x=>x.personId===b.personId).flatMap(x=>x.packets.flatMap(p=>p.answers.flatMap((a,i)=>a.skipped?[x.questions[i]?.topic||""]:[])));
 let packetId:string|undefined;let amendmentId:string|undefined;
 if(b.kind==="submitA"||b.kind==="submitB") {if(!session||session.stage!=="questions"||session.type!==(b.kind==="submitA"?"A":"B"))fail("session","Этот пакет уже отправлен или не найден",409);if(session.basis!==expectedBasis)fail("stale","Основание изменилось. Получи новые вопросы; ответы остаются в черновике.",409);const answers=answersSchema(b.answers);packetId=crypto.randomUUID();session.packets.push({id:packetId,answers,submittedAt:now});}
 if(b.kind==="amendment"){if(!session||session.stage!=="done"||session.type!=="A"||b.questionIndex===undefined||!b.text)fail("session","Выбери отправленный вопрос и напиши дописку");amendmentId=crypto.randomUUID();session.amendments.push({id:amendmentId,questionIndex:b.questionIndex,text:b.text,submittedAt:now,result:null});}
 const evidence=evidenceFor(state,b.personId);const person=requirePerson(state,b.personId);const input={person:{name:person.name},expectations:state.user.expectations||'',userMemory:(state.user.aiContext||[]).map(m=>({text:m.text,edited:!!m.edited,refs:evidence.refsFor('user-memory:'+m.id)})),entries:personalEntries(state,b.personId).map(e=>({eventDate:e.eventDate,tags:e.tags,refs:evidence.refsFor(e.id)})),sources:evidence.fragments,type:b.type||session?.type,userQuestion:b.userQuestion||session?.userQuestion,questions:session?.questions,requiredAnswerRefs:packetId?session!.packets.at(-1)!.answers.flatMap((a,i)=>a.skipped?[]:evidence.refsFor(packetId+":"+i)):[],requiredAmendmentRefs:amendmentId?evidence.refsFor(amendmentId):[],currentAnswers:packetId?session!.packets.at(-1)!.answers.map((a,i)=>({question:session!.questions[i].text,skipped:a.skipped,refs:a.skipped?[]:evidence.refsFor(packetId+":"+i)})):[],currentAmendment:amendmentId?{question:session!.questions[b.questionIndex!].text,refs:evidence.refsFor(amendmentId)}:undefined,skippedTopics};
 async function validated<T>(validator:(v:unknown)=>T,kind:string=b.kind,payload:unknown=input):Promise<T>{let feedback:unknown;for(let attempt=0;attempt<2;attempt++){try{return validator(await generate(kind,feedback?{input:payload,validationFeedback:feedback}:payload));}catch(e){const retry=e instanceof z.ZodError||e instanceof JournalError&&["invalid_ai","invalid_sources"].includes(e.code);feedback=e instanceof z.ZodError?e.issues.map(x=>({path:x.path,code:x.code,message:x.message})):e instanceof JournalError?{code:e.code,message:e.message}:undefined;if(e instanceof z.ZodError)console.error("AI format paths:",JSON.stringify(feedback));if(!retry)throw e;if(attempt===1){if(e instanceof z.ZodError)fail("invalid_ai","Ответ модели не прошёл проверку формата. Повтори запрос; записи сохранены.",502);throw e;}}}return fail("invalid_ai","Не удалось проверить ответ модели",502);}
 if(b.kind==="tags"){
  const entry=state.entries.find(x=>x.id===b.entryId&&x.personId===b.personId)||fail("entry","Запись не найдена",404);if(entry.manualTags)fail("manual","Теги уже изменены вручную",409);
  const result=await validated(v=>z.object({tags:z.array(z.enum(TAGS)).max(TAGS.length)}).parse(v),"tags",{text:entry.text});entry.tags=[...new Set(result.tags)];entry.tagging="done";
 }else if(b.kind==="questions"){
  if(!b.type||b.type==="B"&&!b.userQuestion?.trim())fail("question","Напиши вопрос");
  const result=await validated(v=>{const q=questionsSchema.parse(v);if(new Set(q.questions.map(x=>x.topic.toLowerCase())).size!==3||q.questions.some(x=>skippedTopics.some(t=>t.toLowerCase()===x.topic.toLowerCase())))fail("invalid_ai","Модель повторила тему вопроса",502);return q;});
  const created:Session={id:crypto.randomUUID(),personId:b.personId,type:b.type,userQuestion:b.userQuestion||"",questions:result.questions,basis:expectedBasis,stage:"questions",packets:[],amendments:[],result:null,generatedAt:now};state.sessions.push(created);
 }else if(b.kind==="signals"){
  const result=await validated(v=>validateResult(resolveEvidence(v,evidence),state,b.personId));state.reports=state.reports.filter(x=>x.personId!==b.personId);state.reports.push({id:crypto.randomUUID(),personId:b.personId,basis:expectedBasis,result,generatedAt:now,model:process.env.GIGACHAT_MODEL||"GigaChat-2-Max",promptVersion:PROMPT_VERSION});
 }else if(session){
  if(b.kind==="submitA"&&session.packets.at(-1)?.answers.every(x=>x.skipped))session.result={blocks:[{kind:"basis",title:"Без ответа",text:"Пропуски сохранены как границы тем. Новых фактов и дополнений нет; модель не вызывалась.",sources:[]}],summary:"Все три ответа пропущены. Новых фактов для Сигналов нет.",additions:[]};
  else {const result=await validated(v=>{const r=validateResult(resolveEvidence(v,evidence),state,b.personId);if(b.kind==="submitB"&&!r.nextStep)fail("invalid_ai","В ответе нет следующего шага",502);if(amendmentId&&!r.blocks.some(x=>x.sources.some(y=>y.id===amendmentId)))fail("invalid_sources","Модель не использовала текущую дописку",502);if((b.kind==="submitA"||b.kind==="submitB")&&session.packets.at(-1)?.answers.some(x=>!x.skipped)&&!r.blocks.some(x=>x.sources.some(y=>y.id.startsWith(packetId+":"))))fail("invalid_sources","Модель не использовала отправленные ответы",502);return r;});if(amendmentId)session.amendments.find(x=>x.id===amendmentId)!.result=result;else session.result=result;}
  session.stage="done";
  if(session.result&&!amendmentId)addMemories(state,b.personId,session.result,now);
  session.basis=digest(basisText(state,b.personId));
  if(b.kind==='submitA'&&!allSkipped&&session.result){state.reports=state.reports.filter(x=>x.personId!==b.personId);state.reports.push({id:crypto.randomUUID(),personId:b.personId,basis:session.basis,result:session.result,generatedAt:now,model:process.env.GIGACHAT_MODEL||'GigaChat-2-Max',promptVersion:PROMPT_VERSION});}
 }
 const current=await readWorkspace();requireAI(current,b.personId,b.kind==="tags");
 let finalState=state;
 if(b.kind==='tags'){const before=original.entries.find(e=>e.id===b.entryId)!;const latest=current.entries.find(e=>e.id===b.entryId);if(!latest||latest.manualTags||latest.version!==before.version||latest.text!==before.text)fail('stale','Запись изменена; прежняя разметка не применена',409);finalState=current;Object.assign(latest,{tags:state.entries.find(e=>e.id===b.entryId)!.tags,tagging:'done'});}
 else {if(digest(basisText(current,b.personId))!==expectedBasis)fail("stale","Данные изменились во время анализа. Ответ не применён; повтори по актуальным записям.",409);finalState={...current,user:state.user,reports:[...current.reports.filter(r=>r.personId!==b.personId),...state.reports.filter(r=>r.personId===b.personId)],sessions:[...current.sessions.filter(x=>x.personId!==b.personId),...state.sessions.filter(x=>x.personId===b.personId)]};}
 const saved=await writeWorkspace(finalState,current.revision,b.requestId,fingerprint,"ai."+b.kind);if(locked)await releaseAI(b.requestId,undefined,lockOwner).catch(()=>console.error("AI lease release deferred until expiry"));locked=false;
 return Response.json({state:saved},{headers:{"Cache-Control":"no-store"}});
}catch(e){if(operationId&&locked)await releaseAI(operationId,e instanceof JournalError?e.code:"invalid_ai",lockOwner).catch(()=>{});return errorResponse(e);}}





