import {required} from '../../server/core.mjs';
import {finish} from '../../server/gmail.mjs';
export default async req=>{
 let result='error';try{const u=new URL(req.url),cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ww_oauth='))?.slice(9);await finish(u.searchParams.get('code'),u.searchParams.get('state'),cookie);result='connected';}catch{}
 return new Response(null,{status:303,headers:{Location:required('APP_URL')+'/?gmail='+result+'#settings','Cache-Control':'no-store','Set-Cookie':'ww_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/gmail; Max-Age=0','Referrer-Policy':'no-referrer'}});
};
export const config={path:'/api/gmail/callback',method:'GET'};
