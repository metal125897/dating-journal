import {neon} from "@neondatabase/serverless";
const sql=neon(process.env.DATABASE_URL!);
for(let i=0;i<8;i++){try{const r=await sql`SELECT journal_read() IS NOT NULL AS ok`;console.log(i,r[0].ok);}catch(e){const x=e as Error&{code?:string;cause?:Error&{code?:string}};console.log(i,{name:x.name,code:x.code,cause:x.cause?.name,causeCode:x.cause?.code,hints:["fetch","certificate","timeout","socket","json","connection","not supported"].filter(v=>x.message.toLowerCase().includes(v))});}}
