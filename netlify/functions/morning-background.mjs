import {timingSafeEqual} from 'node:crypto';
import {required,db,load,json} from '../../server/core.mjs';
import {sync} from '../../server/gmail.mjs';
export default async req=>{
 const expected=Buffer.from('Bearer '+required('JOB_SECRET')),given=Buffer.from(req.headers.get('authorization')||'');
 if(given.length!==expected.length||!timingSafeEqual(given,expected))return json({error:'Unauthorized'},401);
 const start=Date.now();let offset=0;
 while(Date.now()-start<700000){const connections=await db('ww_connections?select=user_id,last_sync,page_token&order=user_id&limit=20&offset='+offset);if(!connections.length)break;
 for(const c of connections){if(Date.now()-start>700000)break;try{const row=await load(c.user_id),tz=row.data.settings.timezone,parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).formatToParts(new Date()),hour=parts.find(p=>p.type==='hour')?.value;
 const date=d=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,dateStyle:'short'}).format(new Date(d));
 if(hour==='07'&&(!c.last_sync||date(c.last_sync)!==date(Date.now())||c.page_token)){let more=true;for(let count=0;more&&count<10&&Date.now()-start<650000;count++){more=(await sync(c.user_id)).hasMore;}}
 }catch{/* Per-user failure is recorded by sync; never log document contents. */}}
 offset+=connections.length;
 }
 return json({done:true});
};
export const config={background:true};
