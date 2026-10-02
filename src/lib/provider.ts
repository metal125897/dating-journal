import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {rootCertificates} from "node:tls";
import {Agent,fetch as secureFetch} from "undici";
import {fail,JournalError} from "./domain";
import {remainingTime} from "./request-budget";
import {TAG_RESPONSE_FORMAT} from "./ai-format";
import {SYSTEM,operationPrompt} from "./prompts";
let token:{value:string;expires:number}|null=null;
let dispatcher:Agent|undefined;
function secureAgent(){return dispatcher??=new Agent({connections:1,pipelining:0,connect:{timeout:8000,ca:[...rootCertificates,readFileSync(resolve(process.cwd(),"certs/russian-trusted-root.pem"),"utf8")],rejectUnauthorized:true}});}
async function fetchAPI(url:string,init:NonNullable<Parameters<typeof secureFetch>[1]>){try{const response=await secureFetch(url,{...init,dispatcher:secureAgent(),signal:AbortSignal.timeout(remainingTime(url.includes("oauth")?8000:60000,12000))});if(!response.ok){if(response.status===429)fail("quota","Достигнут лимит AI или запрос уже занят. Дневник продолжает работать.",429);if(response.status===401||response.status===403)fail("ai_access","Доступ к AI не подтверждён. Проверь подключение в настройках.",503);if(response.status===402)fail("quota","Бесплатная квота AI исчерпана. Новые разборы приостановлены.",429);fail("provider","AI временно недоступен. Попробуй позже.",502);}return await response.json() as {access_token?:string;expires_at?:number;choices?:{finish_reason?:string;message?:{content?:string}}[]};}catch(e){if(e instanceof JournalError)throw e;console.error("AI transport:",url.includes("oauth")?"oauth":"completion",e instanceof Error?e.name:"unknown");if(e instanceof Error&&["TimeoutError","AbortError"].includes(e.name))return fail("ai_timeout","AI не успел ответить. Записи и черновик сохранены — повтори запрос позже.",504);return fail("provider","Соединение с AI прервалось. Записи сохранены — попробуй ещё раз.",502);}}
async function accessToken(){if(token&&token.expires>Date.now()+60000)return token.value;const key=process.env.GIGACHAT_AUTH_KEY;if(!key)fail("ai_config","AI ещё не подключён. Дневник доступен, настройка — в разделе Настройки.",503);const result=await fetchAPI("https://ngw.devices.sberbank.ru:9443/api/v2/oauth",{method:"POST",headers:{Authorization:`Basic ${key}`,RqUID:randomUUID(),"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:new URLSearchParams({scope:process.env.GIGACHAT_SCOPE||"GIGACHAT_API_PERS"})});if(typeof result.access_token!=="string")fail("provider","AI не выдал токен доступа",502);token={value:result.access_token,expires:Number(result.expires_at)};return token.value;}
export async function generate(kind:string,input:unknown,observeSyntheticContent?:(content:string)=>void):Promise<unknown>{const payload=JSON.stringify(input);if(payload.length>55000)fail("context_limit","Журнал превышает доступный объём анализа. Выбери меньший период для разбора; записи сохранены.",413);const result=await fetchAPI("https://api.giga.chat/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${await accessToken()}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.GIGACHAT_MODEL||"GigaChat-2-Max",temperature:0.1,...(kind==="tags"?{response_format:TAG_RESPONSE_FORMAT}:{}),max_tokens:5000,stream:false,messages:[{role:"system",content:SYSTEM+"\n"+operationPrompt(kind)},{role:"user",content:payload}]})});const content=result.choices?.[0]?.message?.content;if(typeof content!=="string")fail("refusal","Модель не сформировала ответ",502);observeSyntheticContent?.(content);try{return JSON.parse(content.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim());}catch{console.error("AI JSON format:",result.choices?.[0]?.finish_reason||"unknown","characters",content.length);return fail("invalid_ai","Ответ модели не прошёл проверку формата",502);}}





