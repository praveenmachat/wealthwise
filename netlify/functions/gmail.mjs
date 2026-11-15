import {safe,identify,body,originCheck,json,error,limit} from '../../server/core.mjs';
import {begin,disconnect,sync} from '../../server/gmail.mjs';
export default safe(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);originCheck(req);const u=await identify(req);await limit(u.id,'gmail',30);const b=await body(req);
 if(b.action==='connect'){const result=await begin(u);return json({url:result.url},200,{'Set-Cookie':`ww_oauth=${result.state}; HttpOnly; Secure; SameSite=Lax; Path=/api/gmail; Max-Age=600`});}
 if(b.action==='disconnect'){await disconnect(u.id);return json({disconnected:true});}
 if(b.action==='sync')return json(await sync(u.id));throw error('Unknown Gmail action.');
});
export const config={path:'/api/gmail'};
