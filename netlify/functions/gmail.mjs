import {safe,identify,body,originCheck,json,error,limit} from '../../server/core.mjs';
import {disconnect} from '../../server/gmail.mjs';
export default safe(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);originCheck(req);const u=await identify(req);await limit(u.id,'gmail',30);const b=await body(req);
 if(b.action==='disconnect'){await disconnect(u.id);return json({disconnected:true});}
 throw error('Use ChatGPT to import from Gmail.',410);
});
export const config={path:'/api/gmail'};
