import {required,env,json} from '../../server/core.mjs';
export default async()=>{if(!['APP_URL','JOB_SECRET','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_SECRET','TOKEN_ENCRYPTION_KEY','OPENAI_MODEL'].every(env))return json({queued:false,reason:'Integration setup incomplete'});const r=await fetch(required('APP_URL')+'/.netlify/functions/morning-background',{method:'POST',headers:{Authorization:'Bearer '+required('JOB_SECRET')},signal:AbortSignal.timeout(10000)});return json({queued:r.status===202},r.status===202?200:502);};
export const config={schedule:'0 * * * *'};
