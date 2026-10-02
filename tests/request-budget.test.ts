import test from 'node:test';
import assert from 'node:assert/strict';
import {withRequestBudget,remainingTime} from '../src/lib/request-budget';
test('исчерпанный бюджет прерывает вызов до запуска транспорта',async()=>{await withRequestBudget(0,async()=>{assert.throws(()=>remainingTime(35000),/AI не успел/);});assert.equal(remainingTime(35000),35000);});
test('резерв сохранения и независимые запросы учитываются отдельно',async()=>{await Promise.all([withRequestBudget(1000,async()=>{await Promise.resolve();assert.throws(()=>remainingTime(35000,12000),/AI не успел/);}),withRequestBudget(55000,async()=>{await Promise.resolve();assert.equal(remainingTime(35000,12000),35000);})]);});
