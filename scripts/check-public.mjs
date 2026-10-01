import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const secrets=['DATABASE_URL','GIGACHAT_AUTH_KEY'].map(k=>process.env[k]).filter(v=>v&&v.length>10);
const bad=files.filter(path=>secrets.some(secret=>readFileSync(path).includes(Buffer.from(secret))));
if(files.some(x=>x==='.env.local'||x.startsWith('node_modules/')||x.startsWith('references/'))||bad.length){console.error('Unsafe publication paths:',bad);process.exit(1);}
console.log(`Publication scan passed: ${files.length} files; server secrets excluded.`);
