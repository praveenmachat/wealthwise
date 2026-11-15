import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {emptyState} from '../public/domain.mjs';
export const env=k=>globalThis.Netlify?.env?.get(k)||process.env[k];
export function required(k){const v=env(k);if(!v)throw Object.assign(new Error('This service is not configured yet. Please contact the app owner.'),{status:503});return v;}
export const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export function error(message,status=400){return Object.assign(new Error(message),{status});}
export async function body(req){const text=await req.text();if(text.length>5_700_000)throw error('The upload is too large.',413);try{return JSON.parse(text);}catch{throw error('Invalid request.');}}
export function originCheck(req){const o=req.headers.get('origin');if(o&&o!==required('APP_URL'))throw error('Request origin does not match this app.',403);}
export async function identify(req){
 const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))throw error('Please sign in.',401);
 const r=await fetch(required('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:required('SUPABASE_PUBLISHABLE_KEY'),Authorization:authorization},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw error('Your session expired. Please sign in again.',401);const u=await r.json();if(!u.email_confirmed_at)throw error('Verify your email before using your account.',403);return u;
}
export async function db(path,options={}){
 const r=await fetch(required('SUPABASE_URL')+'/rest/v1/'+path,{...options,headers:{apikey:required('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+required('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json',Prefer:'return=representation',...options.headers},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw error('Database operation failed. Your changes were not saved.',502);
 const text=await r.text();return text?JSON.parse(text):null;
}
export async function load(userId){
 let [row]=await db('ww_workspaces?user_id=eq.'+encodeURIComponent(userId));
 if(!row){await db('ww_workspaces?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({user_id:userId,data:emptyState()})});[row]=await db('ww_workspaces?user_id=eq.'+encodeURIComponent(userId));}
 return row;
}
export async function commit(userId,data,revision){
 if(JSON.stringify(data).length>4_000_000)throw error('Workspace is approaching its capacity. Export your data and contact support.',413);
 const rows=await db('ww_workspaces?user_id=eq.'+encodeURIComponent(userId)+'&revision=eq.'+revision,{method:'PATCH',body:JSON.stringify({data,revision:revision+1,updated_at:new Date().toISOString()})});
 if(!rows?.length)throw error('Your data changed in another session. Refresh and review before saving.',409);return rows[0];
}
export async function limit(userId,name,maximum=20){const allowed=await db('rpc/ww_rate_limit',{method:'POST',body:JSON.stringify({bucket:userId+':'+name,maximum})});if(!allowed)throw error('You have reached the hourly limit. Please try again later.',429);}
function key(){const k=Buffer.from(required('TOKEN_ENCRYPTION_KEY'),'base64');if(k.length!==32)throw error('The Gmail connection service is not configured.',503);return k;}
export function seal(value,userId){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from(userId));return Buffer.concat([iv,c.update(value,'utf8'),c.final(),c.getAuthTag()]).toString('base64');}
export function unseal(value,userId){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAAD(Buffer.from(userId));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString('utf8');}
export function safe(handler){return async(req,ctx)=>{try{return await handler(req,ctx);}catch(e){return json({error:e.status?e.message:'This request could not be completed. No successful update was confirmed.'},e.status||500);}};}
export function requestId(s){if(typeof s!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(s))throw error('Missing valid request ID.');return s;}
