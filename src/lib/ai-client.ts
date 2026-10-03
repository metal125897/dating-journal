export async function readAIResponse(response:Response,poll:()=>Promise<Response>,wait=()=>new Promise<void>(r=>setTimeout(r,2000)),maximum=140){
 for(let attempt=0;attempt<=maximum;attempt++){
  const data=await response.json();
  if(response.status!==202){if(!response.ok||data.code)throw new Error(data.message||'Ответ AI прервался. Записи сохранены — попробуй ещё раз.');if(!data.state)throw new Error('AI не вернул сохранённый результат');return data;}
  if(attempt===maximum)throw new Error('Анализ ещё выполняется. Обнови страницу позже; записи и черновик сохранены.');
  await wait();response=await poll();
 }
 throw new Error('Анализ не завершился');
}
