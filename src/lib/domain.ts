import { z } from "zod";

export const TAGS = ["контакт", "напряжение", "поступок", "договорённость", "рефлексия"] as const;
export type Tag = typeof TAGS[number];
export type Person = { id:string; name:string; birth:string|null; city:string; job:string; context:string; likes:string[]; dislikes:string[]; status:"active"|"archived"; archivedAt:string|null; createdAt:string; updatedAt:string };
export type Entry = { id:string; personId:string; text:string; eventDate:string; createdAt:string; updatedAt:string; version:number; tags:Tag[]; manualTags:boolean; tagging:"pending"|"done"|"error" };
export type Source = { id:string; quote:string; label?:string };
export type Block = { kind:"pattern"|"attention"|"positive"|"basis"|"facts"|"user"|"hypothesis"|"answers"; title:string; text:string; sources:Source[] };
export type Result = { blocks:Block[]; summary:string; nextStep?:string; additions?:{target:"user"|"person"|"interaction"; sourceId:string; text:string}[] };
export type SavedResult = { id:string; personId:string; basis:string; result:Result; generatedAt:string; model:string; promptVersion:string };
export type Question = { text:string; topic:string };
export type Packet = { id:string; answers:{text:string; skipped:boolean}[]; submittedAt:string };
export type Amendment = {id:string; questionIndex:number; text:string; submittedAt:string; result:Result|null};
export type Session = { id:string; personId:string; type:"A"|"B"; userQuestion:string; questions:Question[]; basis:string; stage:"questions"|"done"; packets:Packet[]; amendments:Amendment[]; result:Result|null; generatedAt:string };
export type Workspace = {schemaVersion:1; revision:number; consent:boolean; user:{context:string; values:string[]; updatedAt:string}; people:Person[]; entries:Entry[]; reports:SavedResult[]; sessions:Session[]};
export function emptyWorkspace(): Workspace { return {schemaVersion:1,revision:0,consent:false,user:{context:"",values:[],updatedAt:""},people:[],entries:[],reports:[],sessions:[]}; }
export class JournalError extends Error { constructor(public code:string, message:string, public status=400) {super(message);} }
export function fail(code:string,message:string,status=400):never {throw new JournalError(code,message,status);}
const text = z.string().trim().max(20000);
const required = text.min(1);
const id = z.uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},"Некорректная дата");
const list = z.array(z.string().trim().min(1).max(300)).max(100);
const personFields = z.object({name:z.string().trim().min(1).max(100),birth:dateSchema.nullable(),city:z.string().trim().max(200),job:z.string().trim().max(200),context:text,likes:list,dislikes:list});
export const commandSchema = z.discriminatedUnion("kind",[
 z.object({kind:z.literal("person.save"),id:id.optional(),fields:personFields,today:dateSchema}),
 z.object({kind:z.literal("person.archive"),id,archived:z.boolean()}),
 z.object({kind:z.literal("person.delete"),id}),
 z.object({kind:z.literal("entry.save"),id:id.optional(),personId:id,text:required,eventDate:dateSchema}),
 z.object({kind:z.literal("entry.delete"),id}),
 z.object({kind:z.literal("entry.tags"),id,tags:z.array(z.enum(TAGS)).max(5)}),
 z.object({kind:z.literal("user.save"),context:text,values:list}),
 z.object({kind:z.literal("consent"),value:z.boolean()}),
 z.object({kind:z.literal("wipe"),confirm:z.literal("DELETE")})
]);
export type Command = z.infer<typeof commandSchema>;
export const requestSchema = z.object({requestId:id,revision:z.number().int().nonnegative(),command:commandSchema});
export function normalizeAnswer(v:string) {const t=v.trim();return {text:t==="-"||t==="—"?"":t,skipped:t==="-"||t==="—"};}
export function answersSchema(v:unknown) {return z.array(required).length(3).parse(v).map(normalizeAnswer);}
export function personalEntries(s:Workspace,pid:string) {return s.entries.filter(e=>e.personId===pid).sort((a,b)=>b.eventDate.localeCompare(a.eventDate)||b.createdAt.localeCompare(a.createdAt));}
export function requirePerson(s:Workspace,pid:string) {return s.people.find(p=>p.id===pid)||fail("missing","Человек не найден",404);}
export function requireAI(s:Workspace,pid:string,tags=false) {requirePerson(s,pid);if(!s.consent)fail("consent","AI выключен в настройках",403);if(!tags&&personalEntries(s,pid).length<5)fail("threshold","Для анализа нужно пять сохранённых записей",403);}
export function sourceMap(s:Workspace,pid:string):Map<string,{text:string;label:string}> {
 const p=requirePerson(s,pid);const m=new Map<string,{text:string;label:string}>();
 for(const e of personalEntries(s,pid))m.set(e.id,{text:e.text,label:e.eventDate});
 m.set("person-context",{text:p.context,label:"Контекст человека"});m.set("person-likes",{text:p.likes.join(", "),label:"Что любит"});m.set("person-dislikes",{text:p.dislikes.join(", "),label:"Что не любит"});
 m.set("user-context",{text:s.user.context,label:"О себе"});m.set("user-values",{text:s.user.values.join(", "),label:"Мои ценности"});
 for(const session of s.sessions.filter(x=>x.personId===pid)) {for(const packet of session.packets) packet.answers.forEach((a,i)=>{if(!a.skipped)m.set(packet.id+":"+i,{text:a.text,label:"Ответ на вопрос "+(i+1)});});for(const a of session.amendments)m.set(a.id,{text:a.text,label:"Дописка"});}
 return m;
}
export function basisText(s:Workspace,pid:string) {const p=requirePerson(s,pid);return JSON.stringify({person:p,user:s.user,entries:personalEntries(s,pid),answers:s.sessions.filter(x=>x.personId===pid&&(x.packets.length||x.amendments.length)).map(x=>({id:x.id,packets:x.packets,amendments:x.amendments.map(a=>({id:a.id,text:a.text,questionIndex:a.questionIndex}))}))});}
const sourceSchema=z.object({id:z.string().min(1),quote:required});
export const resultSchema=z.object({blocks:z.array(z.object({kind:z.enum(["pattern","attention","positive","basis","facts","user","hypothesis","answers"]),title:z.string().min(1).max(200),text:required,sources:z.array(sourceSchema).max(20).default([])})).min(1).max(30),summary:required,nextStep:z.preprocess(v=>v===null||typeof v==="string"&&!v.trim()?undefined:v,required.optional()),additions:z.array(z.object({target:z.enum(["user","person","interaction"]),sourceId:z.string(),text:required})).max(12).optional()});
export const questionsSchema=z.object({questions:z.array(z.object({text:z.string().trim().min(5).max(500).transform(v=>v.replace(/\?(?:\s*\?)+$/,"?")).refine(v=>(v.match(/\?/g)||[]).length===1,"Каждый пункт содержит один вопрос"),topic:z.string().trim().min(1).max(100)})).length(3)});
export function validateResult(raw:unknown,s:Workspace,pid:string):Result {
 const result:Result=resultSchema.parse(raw);const sources=sourceMap(s,pid);const entries=personalEntries(s,pid);
 const prohibited=/(токсичн|абьюзер|нарцисс|психопат|\d+\s*%|совместимость\s*[:—-]?\s*\d)/i;
 if(prohibited.test(JSON.stringify(result)))fail("invalid_ai","Ответ модели не прошёл проверку формата",502);
 for(const block of result.blocks) {
  if(!["basis","hypothesis"].includes(block.kind)&&!block.sources.length)fail("invalid_sources","У вывода нет проверяемых источников",502);
  for(const source of block.sources){const original=sources.get(source.id);if(!original||!source.quote.trim()||!original.text.includes(source.quote))fail("invalid_sources","Модель прислала неподтверждённый источник",502);source.label=original.label;}
  if(block.kind==="pattern") {const used=entries.filter(e=>block.sources.some(x=>x.id===e.id));if(new Set(used.map(e=>e.id)).size<2||new Set(used.map(e=>e.eventDate+":"+e.text)).size<2)fail("invalid_sources","Повторение не подтверждено разными эпизодами",502);}
 }
 for(const addition of result.additions||[])if(!sources.has(addition.sourceId)||!s.sessions.some(x=>x.personId===pid&&x.packets.some(p=>p.answers.some((a,i)=>!a.skipped&&p.id+":"+i===addition.sourceId))||x.personId===pid&&x.amendments.some(a=>a.id===addition.sourceId)))fail("invalid_sources","Дополнение не связано с ответом",502);
 return result;
}
export function applyCommand(original:Workspace,c:Command,now=new Date().toISOString(),uuid=()=>crypto.randomUUID()):Workspace {
 const s=structuredClone(original);
 if(c.kind==="wipe"){const e=emptyWorkspace();e.revision=s.revision;return e;}
 if(c.kind==="person.save") {
  if(c.fields.birth&&c.fields.birth>c.today)fail("date","Дата рождения не может быть в будущем");
  if(c.id){const p=requirePerson(s,c.id);Object.assign(p,c.fields,{updatedAt:now});}else s.people.push({...c.fields,id:uuid(),status:"active",archivedAt:null,createdAt:now,updatedAt:now});
 }
 if(c.kind==="person.archive") {const p=requirePerson(s,c.id);p.status=c.archived?"archived":"active";p.archivedAt=c.archived?now:null;p.updatedAt=now;}
 if(c.kind==="person.delete") {requirePerson(s,c.id);s.people=s.people.filter(x=>x.id!==c.id);s.entries=s.entries.filter(x=>x.personId!==c.id);s.reports=s.reports.filter(x=>x.personId!==c.id);s.sessions=s.sessions.filter(x=>x.personId!==c.id);}
 if(c.kind==="entry.save") {
  const p=requirePerson(s,c.personId);if(!c.id&&p.status==="archived")fail("archived","Сначала верни человека из архива");
  if(c.id){const e=s.entries.find(x=>x.id===c.id)||fail("missing","Запись не найдена",404);if(e.personId!==c.personId){s.reports=[];s.sessions=s.sessions.map(x=>({...x,result:null,amendments:x.amendments.map(a=>({...a,result:null}))}));}Object.assign(e,{personId:c.personId,text:c.text,eventDate:c.eventDate,updatedAt:now,version:e.version+1,tagging:e.manualTags?"done":"pending"});}
  else s.entries.push({id:uuid(),personId:c.personId,text:c.text,eventDate:c.eventDate,createdAt:now,updatedAt:now,version:1,tags:[],manualTags:false,tagging:"pending"});
 }
 if(c.kind==="entry.delete") {const e=s.entries.find(x=>x.id===c.id)||fail("missing","Запись не найдена",404);s.entries=s.entries.filter(x=>x.id!==c.id);s.reports=s.reports.filter(x=>x.personId!==e.personId);s.sessions=s.sessions.map(x=>x.personId===e.personId?{...x,result:null,amendments:x.amendments.map(a=>({...a,result:null}))}:x);}
 if(c.kind==="entry.tags") {const e=s.entries.find(x=>x.id===c.id)||fail("missing","Запись не найдена",404);e.tags=[...new Set(c.tags)];e.manualTags=true;e.tagging="done";e.version++;e.updatedAt=now;}
 if(c.kind==="user.save")s.user={context:c.context,values:[...new Set(c.values)],updatedAt:now};
 if(c.kind==="consent")s.consent=c.value;
 return s;
}
export function localDate(d=new Date()) {return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
export function age(birth:string,today=localDate()){const [y,m,d]=birth.split("-").map(Number);const [ty,tm,td]=today.split("-").map(Number);return ty-y-(tm<m||tm===m&&td<d?1:0);}
export function plural(n:number,forms:[string,string,string]){const a=Math.abs(n)%100,b=a%10;return forms[a>=11&&a<=14?2:b===1?0:b>=2&&b<=4?1:2];}


