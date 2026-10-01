import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL отсутствует: внеси значение в .env.local');
const sql=neon(process.env.DATABASE_URL);
const source=await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8');
const statements=[];let start=0,single=false,dollar=false;
for(let i=0;i<source.length;i++){
 if(!single&&source.slice(i,i+2)==='$$'){dollar=!dollar;i++;continue;}
 if(!dollar&&source[i]==="'"){if(single&&source[i+1]==="'"){i++;continue;}single=!single;}
 if(source[i]===';'&&!single&&!dollar){const statement=source.slice(start,i).trim();start=i+1;if(statement&&!['BEGIN','COMMIT'].includes(statement))statements.push(statement);}
}
try{await sql.transaction(statements.map(statement=>sql.query(statement)));}catch(e){console.error('Миграция не применена. Код PostgreSQL:',typeof e?.code==='string'?e.code:'connection');process.exit(1);}
console.log('Миграция дневника применена. Данные вишлиста не затронуты.');
