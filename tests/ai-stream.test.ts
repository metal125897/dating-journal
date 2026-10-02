import test from 'node:test';
import assert from 'node:assert/strict';
import {streamAI} from '../src/lib/ai-stream';
test('поток начинается до анализа и передаёт проверенный результат целиком',async()=>{let finish!:(r:Response)=>void;const pending=new Promise<Response>(r=>finish=r);const response=streamAI(()=>pending),reader=response.body!.getReader();const first=await reader.read();assert.equal(new TextDecoder().decode(first.value),' ');finish(Response.json({state:{revision:2}}));const final=await reader.read();assert.deepEqual(JSON.parse(new TextDecoder().decode(final.value)),{state:{revision:2},httpStatus:200});assert.equal((await reader.read()).done,true);});
test('ошибка в потоке остаётся ошибкой с исходным статусом',async()=>{const response=streamAI(async()=>Response.json({code:'threshold',message:'Нужно пять записей'},{status:403}));assert.deepEqual(await response.json(),{code:'threshold',message:'Нужно пять записей',httpStatus:403});});
