import { neon,neonConfig } from "@neondatabase/serverless";
import {Agent,fetch as databaseFetch} from "undici";
import {createHash} from "node:crypto";
import {Workspace,fail,JournalError} from "./domain";
export function digest(v:unknown){return createHash("sha256").update(typeof v==="string"?v:JSON.stringify(v)).digest("hex");}
const databaseAgent=new Agent({connections:2,pipelining:0,connect:{timeout:5000},headersTimeout:10000,bodyTimeout:10000});
neonConfig.fetchFunction=async(url:string,options:NonNullable<Parameters<typeof databaseFetch>[1]>)=>{for(let attempt=0;attempt<2;attempt++){try{return await databaseFetch(url,{...options,signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(6500)]),dispatcher:databaseAgent});}catch(e){if(attempt===1||options.signal?.aborted)throw e;}}throw new Error("Database transport unavailable");};
function db(){const url=process.env.DATABASE_URL;if(!url)fail("database_config","База данных ещё не подключена. Можно открыть отдельный демо-режим.",503);return neon(url,{fetchOptions:{signal:AbortSignal.timeout(10000)}});}
function databaseCode(e:unknown){const code=e&&typeof e==="object"&&"code" in e?String(e.code):"connection";return /^[0-9A-Z_]{1,64}$/.test(code)?code:"connection";}
export async function readWorkspace():Promise<Workspace> {try{const r=await db()`SELECT journal_read() AS state`;return r[0].state as Workspace;}catch(e){if(e instanceof JournalError)throw e;const source=e&&typeof e==="object"&&"sourceError" in e?e.sourceError:undefined;console.error("Journal DB read:",databaseCode(e),e instanceof Error?e.name:"unknown",databaseCode(source),source instanceof Error?source.name:"unknown",source&&typeof source==="object"&&"cause" in source?databaseCode(source.cause):"unknown");return fail("database","База сейчас недоступна. Текст формы сохранён — попробуй позже.",503);}}
export async function completed(id:string,fingerprint:string){const r=await db()`SELECT fingerprint,status FROM journal_operations WHERE id=${id}::uuid`;if(r.length&&r[0].fingerprint!==fingerprint)fail("idempotency","Этот запрос уже использован с другим содержимым",409);return r[0]?.status==="done";}
export async function writeWorkspace(s:Workspace,expected:number,id:string,fingerprint:string,kind:string):Promise<Workspace> {
 try{const r=await db()`SELECT journal_write(${expected},${JSON.stringify(s)}::jsonb,${id}::uuid,${fingerprint},${kind}) AS result`;return r[0].result.state;}catch(e){if(e instanceof JournalError)throw e;const message=e instanceof Error?e.message:"";if(message.includes("REVISION_CONFLICT"))fail("conflict","Данные изменились в другом окне. Обнови и сохрани ещё раз — введённый текст остаётся.",409);if(message.includes("IDEMPOTENCY_MISMATCH"))fail("idempotency","Запрос уже использован",409);const source=e&&typeof e==="object"&&"sourceError" in e?e.sourceError:undefined;console.error("Journal DB write:",databaseCode(e),e instanceof Error?e.name:"unknown",source instanceof Error?source.name:"unknown");return fail("database","Не удалось сохранить в базу. Повтори отправку.",503);}
}
export async function acquireAI(id:string,fingerprint:string,kind:string) {
 const owner=crypto.randomUUID();const sql=db();const r=await sql`UPDATE journal_ai_lock SET owner=${owner}::uuid,lease_until=now()+interval '150 seconds',last_started_at=now() WHERE id=true AND (owner=${owner}::uuid OR lease_until<now() AND (last_started_at IS NULL OR last_started_at<now()-interval '3 seconds')) RETURNING owner`;
 if(!r.length)fail("busy","AI обрабатывает другой запрос. Попробуй чуть позже.",429);
 try {await db()`INSERT INTO journal_operations(id,fingerprint,kind,status,lease_until) VALUES(${id}::uuid,${fingerprint},${kind},'running',now()+interval '150 seconds') ON CONFLICT(id) DO UPDATE SET status='running',started_at=now(),lease_until=now()+interval '150 seconds' WHERE journal_operations.fingerprint=EXCLUDED.fingerprint`;}catch(e){await releaseAI(id,undefined,owner);throw e;}return owner;
}
export async function releaseAI(id:string,errorCode?:string,owner=id) {await db()`UPDATE journal_ai_lock SET owner=NULL,lease_until=now() WHERE owner=${owner}::uuid`;if(errorCode)await db()`UPDATE journal_operations SET status='error',error_code=${errorCode} WHERE id=${id}::uuid AND status='running'`;}


