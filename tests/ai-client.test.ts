import test from 'node:test';
import assert from 'node:assert/strict';
import {readAIResponse} from '../src/lib/ai-client';
test('подтверждение запуска не принимается за готовый анализ',async()=>{let polls=0;const result=await readAIResponse(Response.json({pending:true},{status:202}),async()=>{polls++;return polls===1?Response.json({pending:true},{status:202}):Response.json({state:{revision:5}});},async()=>{});assert.equal(polls,2);assert.equal(result.state.revision,5);});
test('ошибка фоновой задачи и предел ожидания сохраняют ошибочное состояние',async()=>{await assert.rejects(readAIResponse(Response.json({pending:true},{status:202}),async()=>Response.json({code:'invalid_sources',message:'Источник отклонён'},{status:502}),async()=>{}),/Источник отклонён/);await assert.rejects(readAIResponse(Response.json({pending:true},{status:202}),async()=>Response.json({pending:true},{status:202}),async()=>{},1),/ещё выполняется/);});
