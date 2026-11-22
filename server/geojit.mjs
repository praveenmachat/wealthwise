import {parseHTML} from 'linkedom';
import {money,validDate,mutate} from '../public/domain.mjs';
import {createHash} from 'node:crypto';
const months={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
export function parseGeojit(html){
 const {document}=parseHTML(html);const text=document.body?.textContent||document.textContent;
 const date=text.match(/Holding\s+Statement\s+As\s+On\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i);
 const client=text.match(/Client\s*Id\s*:\s*(\d+)/i);if(!date||!client)throw new Error('Statement date or client identity is missing.');
 const asOf=validDate(`${date[3]}-${months[date[2][0].toUpperCase()+date[2].slice(1).toLowerCase()]}-${date[1].padStart(2,'0')}`);
 if(asOf>new Date().toISOString().slice(0,10))throw new Error('Future statement date.');
 const clean=s=>s.replace(/,/g,'').trim();let total=null;const holdings=[];
 for(const tr of document.querySelectorAll('tr')){const cells=[...tr.querySelectorAll('td,th')].map(c=>c.textContent.trim());const index=cells.findIndex(c=>/^IN[A-Z0-9]{10}$/.test(c));
 if(index>=0){const c=cells.slice(index);if(c.length<7)throw new Error('Incomplete holdings row.');const qty=Number(clean(c[3])),price=money(clean(c[4])),amount=money(clean(c[5]));if(!Number.isFinite(qty)||qty<=0||Math.abs(Math.round(qty*price)-amount)>2)throw new Error('Holding value does not reconcile.');holdings.push({isin:c[0],name:c[1],qty,price,amount});}
 else if(cells.some(c=>/^Total\s*:?$/i.test(c))){const last=cells.at(-1);total=money(clean(last));}}
 if(!holdings.length||total===null||holdings.reduce((s,h)=>s+h.amount,0)!==total||new Set(holdings.map(h=>h.isin)).size!==holdings.length)throw new Error('Statement totals or duplicate securities failed validation.');
 return {asOf,clientId:client[1],holdings,total};
}
export function verifiedGeojit(state,html,{sender,authenticated,messageId}){
 if(!state.settings.autoSave||!authenticated||!state.settings.trustedSenders.includes(sender.toLowerCase()))return null;
 const statement=parseGeojit(html),institution='Geojit:'+statement.clientId;
 const mapped=state.assets.filter(a=>!a.archived&&a.type==='stock'&&a.institution===institution);
 if(!mapped.length)return null;
 if(mapped.some(a=>a.currency!=='INR'||a.asOf>statement.asOf))throw new Error('This statement is older than a recorded balance or has a different currency.');
 if(mapped.some(a=>!/^IN[A-Z0-9]{10}$/.test(a.accountRef)))throw new Error('Map every Geojit position to its ISIN before automatic updates.');
 let next=state;const now=new Date().toISOString();
 for(const h of statement.holdings){const old=mapped.find(a=>a.accountRef===h.isin);const id=createHash('sha256').update(messageId+':'+h.isin).digest('hex');
 next=mutate(next,{action:'asset.save',id:old?.id,data:{type:'stock',name:h.name,amount:(h.amount/100).toFixed(2),currency:'INR',asOf:statement.asOf,institution,accountRef:h.isin,notes:`Quantity ${h.qty}; statement price ${(h.price/100).toFixed(2)}. Gmail source ${messageId}. Purchase cost unknown.`}},{id,now,source:'gmail:verified-geojit'});}
 for(const old of mapped.filter(a=>!statement.holdings.some(h=>h.isin===a.accountRef))){next=mutate(next,{action:'asset.save',id:old.id,data:{...old,amount:'0',asOf:statement.asOf,notes:'Absent from complete statement '+messageId}},{id:createHash('sha256').update(messageId+':zero:'+old.id).digest('hex'),now,source:'gmail:verified-geojit'});}
 return {data:next,count:statement.holdings.length};
}
export function geojitProposals(state,html,messageId){
 const statement=parseGeojit(html),institution='Geojit:'+statement.clientId;
 const mapped=state.assets.filter(a=>!a.archived&&a.type==='stock'&&a.institution===institution);
 if(mapped.some(a=>a.currency!=='INR'||a.asOf>statement.asOf))throw new Error('Statement is older than a recorded balance or has a different currency.');
 const rows=statement.holdings.map(h=>({h,old:mapped.find(a=>a.accountRef===h.isin)}));
 for(const old of mapped.filter(a=>!statement.holdings.some(h=>h.isin===a.accountRef)))rows.push({old,h:{isin:old.accountRef,name:old.name,qty:0,price:0,amount:0}});
 return rows.map(({h,old})=>({
   id:createHash('sha256').update(messageId+':review:'+h.isin).digest('hex'),status:'pending',
   title:h.name,reason:'Statement rows and total reconcile. Confirm this account and holding.',
   evidence:`${h.isin}: quantity ${h.qty} × INR ${(h.price/100).toFixed(2)} = INR ${(h.amount/100).toFixed(2)}. Statement total INR ${(statement.total/100).toFixed(2)}.`,
   command:{action:'asset.save',...(old?{id:old.id}:{}),data:{type:'stock',name:h.name,amount:(h.amount/100).toFixed(2),currency:'INR',asOf:statement.asOf,institution,accountRef:h.isin,notes:`Quantity ${h.qty}; statement price ${(h.price/100).toFixed(2)}. Gmail source ${messageId}. Purchase cost unknown.`}},
   source:'gmail',sourceId:messageId,createdAt:new Date().toISOString(),...(old?{before:old}:{})
 }));
}

