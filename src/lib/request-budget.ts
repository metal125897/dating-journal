import {AsyncLocalStorage} from 'node:async_hooks';
import {fail} from './domain';
const deadline=new AsyncLocalStorage<number>();
export function withRequestBudget<T>(milliseconds:number,action:()=>Promise<T>){return deadline.run(Date.now()+milliseconds,action);}
export function remainingTime(maximum:number,reserve=0){const end=deadline.getStore();const available=end===undefined?maximum:Math.min(maximum,end-Date.now()-reserve);if(available<=0)fail('ai_timeout','AI не успел ответить. Записи и черновик сохранены — повтори запрос позже.',504);return available;}
