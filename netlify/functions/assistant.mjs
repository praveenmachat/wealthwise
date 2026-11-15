import {safe,identify,originCheck,limit,body,load,commit,json,error,requestId} from '../../server/core.mjs';
import {extract} from '../../server/extract.mjs';
export default safe(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);originCheck(req);const u=await identify(req);await limit(u.id,'ai',20);const b=await body(req),id=requestId(b.requestId);
 if(typeof b.message!=='string'||b.message.length>6000)throw error('Please keep messages under 6,000 characters.');
 if(b.image&&!/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(b.image))throw error('Upload a JPEG, PNG or WebP image.');
 const row=await load(u.id);if(row.data.audit.some(a=>a.id===id))return json({...row,reply:'This request was already processed. Check your review inbox.'});
 const r=await extract(row.data,{message:b.message,image:b.image,source:b.image?'receipt':'assistant',sourceId:id});
 if(r.proposals.length){row.data.proposals.push(...r.proposals);row.data.audit.unshift({id,at:new Date().toISOString(),source:'assistant',action:'proposals.create',before:null,after:{count:r.proposals.length}});const saved=await commit(u.id,row.data,row.revision);return json({...saved,reply:r.reply+'\n'+r.proposals.length+' proposed update(s) are in your review inbox. Nothing has been applied to your balances.'});}
 return json({reply:r.reply});
});
export const config={path:'/api/assistant'};
