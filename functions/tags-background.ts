import {z} from 'zod';
import {readJSON} from '../src/lib/http';
import {drainTags} from '../src/lib/tag-queue';
export default async (request:Request)=>{try{const {owner}=z.object({owner:z.uuid()}).parse(await readJSON(request));await drainTags(owner);}catch(e){console.error('Tag worker stopped:',e instanceof Error?e.name:'unknown');}};
export const config={background:true};
