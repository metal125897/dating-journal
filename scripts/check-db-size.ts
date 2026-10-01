import {neon} from '@neondatabase/serverless';
import '../src/lib/repository';
for(const size of [500,4000,12000]){const start=Date.now();try{const sql=neon(process.env.DATABASE_URL!,{fetchOptions:{signal:AbortSignal.timeout(10000)}});const r=await sql`SELECT length(${'А'.repeat(size)}::text) AS size`;console.log({size:r[0].size,ms:Date.now()-start});}catch(e){console.log({size,ms:Date.now()-start,name:e instanceof Error?e.name:'unknown'});}}
