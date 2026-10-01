import {generate} from '../src/lib/provider';
const result=await generate('questions',{type:'A',person:{name:'Вымышленный персонаж',context:'Знакомы месяц'},user:{context:'Ценю ясность договорённостей',values:['ясность']},entries:[{text:'Согласовали встречу и время.'},{text:'Заранее сообщил, что заболел.'},{text:'Перенесли прогулку.'},{text:'Погуляли в парке.'},{text:'Поговорили о планах.'}],skippedTopics:[]});
console.log(JSON.stringify(result));
