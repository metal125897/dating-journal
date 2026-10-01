import {POST} from '../src/server/journal';
import {readWorkspace} from '../src/lib/repository';
const s=await readWorkspace();
const ids=s.people.filter(p=>p.name==='Тестовый персонаж · smoke'&&p.context==='Вымышленная тестовая история. Предпочитает заранее согласованные планы.'&&s.entries.filter(e=>e.personId===p.id).every(e=>e.text.startsWith('Встретились в кафе.')||e.text.startsWith('Гуляли в парке.')||e.text.startsWith('Рассказал, что любит прогулки')||e.text.startsWith('Отменил встречу за два часа')||e.text.startsWith('Обсудили перенос встречи.'))).map(p=>p.id);
for(const id of ids){const current=await readWorkspace();const r=await POST(new Request('http://127.0.0.1:3101/api/journal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),revision:current.revision,command:{kind:'person.delete',id}})}));if(!r.ok)throw new Error('Fixture cleanup failed');}
console.log('Removed interrupted synthetic fixtures:',ids.length);
