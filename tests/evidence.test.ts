import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace} from '../src/lib/demo';
import {evidenceFor,resolveEvidence} from '../src/lib/evidence';
import {validateResult} from '../src/lib/domain';
test('короткая ссылка подставляет точную цитату и исходный ID выбранного человека',()=>{const s=demoWorkspace(),pid=s.people[0].id,e=evidenceFor(s,pid),fragment=e.fragments.find(x=>x.kind==='entry')!;const result=validateResult(resolveEvidence({blocks:[{kind:'attention',title:'Наблюдение',text:'По записи',sources:[{ref:fragment.ref}]}],summary:'Основания ограничены'},e),s,pid);assert.equal(result.blocks[0].sources[0].quote,fragment.text);assert.ok(s.entries.some(x=>x.personId===pid&&x.id===result.blocks[0].sources[0].id&&x.text.includes(fragment.text)));});
test('неизвестный код и самостоятельно написанная цитата не обходят проверку',()=>{const s=demoWorkspace(),e=evidenceFor(s,s.people[0].id);assert.throws(()=>resolveEvidence({blocks:[{sources:[{ref:'s999999'}]}]},e),/неизвестный/);assert.throws(()=>resolveEvidence({blocks:[{sources:[{ref:e.fragments[0].ref,quote:'Выдумка'}]}]},e));});
