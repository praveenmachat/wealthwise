import {env,json} from '../../server/core.mjs';
export default async()=>json({supabaseUrl:env('SUPABASE_URL')||null,publishableKey:env('SUPABASE_PUBLISHABLE_KEY')||null});
export const config={path:'/api/config',method:'GET'};
