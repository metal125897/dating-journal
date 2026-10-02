import {z} from 'zod';
import {Workspace,sourceMap,fail} from './domain';
// The model selects a fragment. It never writes its own quotation or UUID.
export function evidenceFor(s:Workspace,personId:string){
 const registry=new Map<string,{id:string;quote:string;label:string}>();
 const fragments:{ref:string;text:string;label:string;kind:'entry'|'answer'|'amendment'|'context'}[]=[];
 const entryIds=new Set(s.entries.filter(e=>e.personId===personId).map(e=>e.id));
 const amendmentIds=new Set(s.sessions.filter(x=>x.personId===personId).flatMap(x=>x.amendments.map(a=>a.id)));
 for(const [id,source] of sourceMap(s,personId)){
  const sentences=source.text.match(/[^.!?\n]+(?:[.!?]+|(?=\n)|$)/gu)||[];
  for(const sentence of sentences)for(let offset=0;offset<sentence.length;offset+=900){const quote=sentence.slice(offset,offset+900).trim();if(!quote)continue;const ref='s'+(fragments.length+1);registry.set(ref,{id,quote,label:source.label});fragments.push({ref,text:quote,label:source.label,kind:entryIds.has(id)?'entry':amendmentIds.has(id)?'amendment':id.includes(':')?'answer':'context'});}
 }
 return {fragments,refsFor:(id:string)=>fragments.filter(f=>registry.get(f.ref)!.id===id).map(f=>f.ref),resolve:(ref:string)=>registry.get(ref)||fail('invalid_sources','Модель выбрала неизвестный фрагмент источника',502)};
}
const reference=z.object({ref:z.string().min(1)}).strict();
const output=z.object({blocks:z.array(z.object({sources:z.array(reference).default([])}).passthrough()),additions:z.array(z.object({sourceRef:z.string().min(1)}).passthrough()).optional()}).passthrough();
const titles:Record<string,string>={pattern:'Повторяющееся наблюдение',attention:'Обрати внимание',positive:'Подтверждённый позитив',basis:'Основания',facts:'Что записано',user:'Твой контекст',hypothesis:'Возможное объяснение',answers:'Как учтены ответы'};
export function resolveEvidence(raw:unknown,evidence:ReturnType<typeof evidenceFor>){const result=output.parse(raw);return {...result,summary:result.summary??result.blocks.map(b=>typeof b.text==='string'?b.text:'').join('\n'),blocks:result.blocks.map(b=>({...b,title:b.title??titles[String(b.kind)],sources:b.sources.map(r=>evidence.resolve(r.ref))})),...(result.additions?{additions:result.additions.map(a=>({...a,sourceId:evidence.resolve(a.sourceRef).id}))}:{})};}
