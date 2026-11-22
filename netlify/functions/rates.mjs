import {json,safe,error} from '../../server/core.mjs';
import {CURRENCIES} from '../../public/domain.mjs';
let cached;
export default safe(async()=>{
 if(cached&&Date.now()<cached.expires)return json(cached.data);
 const r=await fetch('https://open.er-api.com/v6/latest/INR',{signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw error('Exchange rates are unavailable. Please retry later.',503);
 const body=await r.json();
 if(body.result!=='success'||body.base_code!=='INR'||!Number.isFinite(body.time_last_update_unix))throw error('Invalid exchange-rate response.',503);
 const rates={};
 for(const currency of CURRENCIES){const rate=body.rates?.[currency];if(!Number.isFinite(rate)||rate<=0)throw error('Missing exchange rate.',503);rates[currency]=1/rate;}
 if(Date.now()/1000-body.time_last_update_unix>3*86400)throw error('Exchange rates are out of date.',503);
 const data={rates,asOf:new Date(body.time_last_update_unix*1000).toISOString(),provider:'ExchangeRate-API'};
 cached={data,expires:Date.now()+3600000};return json(data);
});
export const config={path:'/api/rates',method:'GET'};

