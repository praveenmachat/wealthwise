export const TYPES = {bank:'Bank account',fd:'Fixed deposit',property:'Property',metal:'Precious metal',vehicle:'Vehicle',stock:'Stock',fund:'Mutual fund',insurance:'Insurance',loan:'Loan',card:'Credit card',other:'Other asset'};
export const CURRENCIES = ['INR','AED','USD','EUR','GBP','SGD'];
export const LIABILITY = new Set(['loan','card']);
export function emptyState(){return {assets:[],transactions:[],plans:[],proposals:[],audit:[],processed:[],settings:{currency:'INR',timezone:'Asia/Dubai',autoSave:true,gmailQuery:'label:Finance newer_than:30d',trustedSenders:[]}};}
export function fail(message){throw new Error(message);}
export function money(value){
 const s=String(value).trim();
 if(!/^\d+(\.\d{1,2})?$/.test(s))fail('Enter a positive amount with at most two decimal places.');
 const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));
 if(!Number.isSafeInteger(n)||n>1e15)fail('Amount is too large.');return n;
}
export function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail('Enter a valid date.');return s;}
function label(s){s=String(s||'').trim();if(!s||s.length>160)fail('A name of 1–160 characters is required.');return s;}
function currency(c){if(!CURRENCIES.includes(c))fail('Select a supported currency.');return c;}
export function asset(input,id){
 if(!TYPES[input.type])fail('Select an asset or liability type.');
 const loan=input.type==='loan'?loanSchedule(input):input.type==='card'?cardDetails(input):{};
 const details={branch:String(input.branch||'').trim().slice(0,120),iban:String(input.iban||'').trim().slice(0,40)};
 return {id,type:input.type,name:label(input.name),amount:money(input.amount),currency:currency(input.currency),asOf:validDate(input.asOf),institution:String(input.institution||'').slice(0,120),accountRef:input.type==='card'?String(input.accountRef||'').replace(/\D/g,'').slice(-4):String(input.accountRef||'').slice(0,80),coverage:input.type==='insurance'?money(input.coverage||0):0,notes:String(input.notes||'').slice(0,1000),archived:false,...loan,...details};
}
export const CARD_MONEY=['creditLimit','availableCredit','availableCashLimit','amountDue','minimumPayment'];
export const CARD_DATES=['statementDate','paymentDueDate'];
export const CARD_TEXT=['cardholder','cardType','cardStatus','expiryMonth','balanceBasis'];
function cardDetails(input){
 const result={};
 for(const k of CARD_MONEY)result[k]=input[k]==null||input[k]===''?null:money(input[k]);
 for(const k of CARD_DATES)result[k]=input[k]?validDate(input[k]):null;
 for(const k of CARD_TEXT)result[k]=String(input[k]||'').trim().slice(0,120);
 if(result.expiryMonth&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(result.expiryMonth))fail('Enter card expiry as year and month.');
 if(result.balanceBasis&&!['outstanding','statement_due'].includes(result.balanceBasis))fail('Choose what the card balance represents.');
 return result;
}
function loanSchedule(input){
 const remainingMonths=input.remainingMonths==null||input.remainingMonths===''?null:Number(input.remainingMonths);
 if(remainingMonths!==null&&(!Number.isInteger(remainingMonths)||remainingMonths<0||remainingMonths>1200))fail('Enter remaining tenure in whole months.');
 const installmentAmount=input.installmentAmount==null||input.installmentAmount===''?null:money(input.installmentAmount);
 const nextInstallmentDate=input.nextInstallmentDate?validDate(input.nextInstallmentDate):null;
 if(nextInstallmentDate&&(!installmentAmount||!remainingMonths))fail('Enter a positive installment amount and remaining tenure.');
 return {remainingMonths,installmentAmount,nextInstallmentDate};
}
export function localDate(now,timezone='Asia/Dubai'){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
export function dueLoans(state,now=new Date().toISOString()){const date=localDate(now,state.settings.timezone);return state.assets.filter(a=>!a.archived&&a.type==='loan'&&a.nextInstallmentDate&&a.nextInstallmentDate<=date&&a.remainingMonths>0);}
function nextMonth(date,anchor){
 const d=new Date(date+'T12:00:00Z'),year=d.getUTCFullYear(),month=d.getUTCMonth()+1;
 return new Date(Date.UTC(year,month,Math.min(anchor,new Date(Date.UTC(year,month+1,0)).getUTCDate()),12)).toISOString().slice(0,10);
}
export function transaction(input,id){
 if(!['expense','income','transfer'].includes(input.kind))fail('Select expense, income or transfer.');
 const amount=money(input.amount);if(amount===0)fail('Amount must be greater than zero.');
 return {id,kind:input.kind,name:label(input.name),amount,currency:currency(input.currency),date:validDate(input.date),category:String(input.category||'Other').slice(0,80),reference:String(input.reference||'').slice(0,120),accountId:input.accountId||null,notes:String(input.notes||'').slice(0,1000)};
}
export function totals(state,cur){
 const active=state.assets.filter(a=>!a.archived&&a.currency===cur);
 const assets=active.filter(a=>!LIABILITY.has(a.type)).reduce((s,a)=>s+a.amount,0);
 const liabilities=active.filter(a=>LIABILITY.has(a.type)).reduce((s,a)=>s+a.amount,0);
 return {assets,liabilities,net:assets-liabilities};
}
export function cashflow(state,cur,month){const t=state.transactions.filter(t=>t.currency===cur&&t.date.startsWith(month));return {income:t.filter(x=>x.kind==='income').reduce((s,x)=>s+x.amount,0),expense:t.filter(x=>x.kind==='expense').reduce((s,x)=>s+x.amount,0)};}
export function fingerprint(t){return [t.accountId||'',t.kind,t.currency,t.date,t.amount,t.reference||t.name.toLowerCase().replace(/\s+/g,' ')].join('|');}
export function mutate(current,command,meta){
 const s=structuredClone(current),{id,now,source='manual'}=meta;
 if(s.audit.some(e=>e.id===id))return s;
 let before=null,after=null;
 if(command.action==='asset.save'){
   const prior=s.assets.find(a=>a.id===command.id);if(command.id&&!prior)fail('Asset not found.');
   const data={...command.data};
   if(prior?.type==='card'&&data.type==='card')for(const key of [...CARD_MONEY,...CARD_DATES,...CARD_TEXT])if(data[key]===undefined)data[key]=CARD_MONEY.includes(key)&&prior[key]!=null?(prior[key]/100).toFixed(2):prior[key];
   for(const key of ['branch','iban'])if(prior&&data[key]===undefined)data[key]=prior[key];
   if(prior?.type==='loan'&&data.type==='loan')for(const key of ['remainingMonths','nextInstallmentDate','installmentAmount'])if(data[key]===undefined)data[key]=key==='installmentAmount'&&prior[key]!=null?(prior[key]/100).toFixed(2):prior[key];
   after=asset(data,prior?.id||id);before=prior||null;
   if(prior?.type==='loan'&&after.type==='loan'){after.installmentHistory=prior.installmentHistory||[];after.installmentStatus=prior.installmentStatus||null;after.installmentDay=after.nextInstallmentDate===prior.nextInstallmentDate?prior.installmentDay:Number(after.nextInstallmentDate?.slice(-2))||null;}
   if(prior)s.assets[s.assets.indexOf(prior)]=after;else s.assets.push(after);
 }else if(command.action==='loan.confirm'){
   const prior=s.assets.find(a=>a.id===command.id&&a.type==='loan'&&!a.archived);
   if(!prior||!dueLoans(s,now).some(a=>a.id===prior.id)||command.data.dueDate!==prior.nextInstallmentDate)fail('This installment is not due or has already been updated.');
   if(!['paid','unpaid'].includes(command.data.status))fail('Choose paid or not paid.');
   before=structuredClone(prior);
   const paid=command.data.status==='paid',date=localDate(now,s.settings.timezone);
   after={...prior,installmentStatus:paid?null:'unpaid',installmentHistory:[...(prior.installmentHistory||[]),{dueDate:prior.nextInstallmentDate,status:command.data.status,checkedAt:now,amount:prior.installmentAmount}]};
   if(paid){
     const paymentDate=validDate(command.data.paymentDate||date);if(paymentDate>date)fail('Payment date cannot be in the future.');
     after.installmentHistory.at(-1).paymentDate=paymentDate;
     after.remainingMonths=Math.max(0,prior.remainingMonths-1);
     after.installmentDay=prior.installmentDay||Number(prior.nextInstallmentDate.slice(-2));
     after.nextInstallmentDate=after.remainingMonths?nextMonth(prior.nextInstallmentDate,after.installmentDay):null;
     if(command.data.balance!==undefined&&command.data.balance!==''){after.amount=money(command.data.balance);after.asOf=paymentDate;}
   }
   s.assets[s.assets.indexOf(prior)]=after;
 }else if(command.action==='asset.archive'){
   const prior=s.assets.find(a=>a.id===command.id);if(!prior)fail('Asset not found.');before=structuredClone(prior);prior.archived=true;after=prior;
 }else if(command.action==='transaction.save'){
   const prior=s.transactions.find(t=>t.id===command.id);if(command.id&&!prior)fail('Transaction not found.');
   after=transaction(command.data,prior?.id||id);before=prior||null;
   if(s.transactions.some(t=>t.id!==after.id&&fingerprint(t)===fingerprint(after)))fail('This transaction appears to be already recorded. Review the existing entry.');
   if(prior)s.transactions[s.transactions.indexOf(prior)]=after;else s.transactions.push(after);
 }else if(command.action==='plan.save'){
   if(!s.assets.some(a=>a.id===command.data.assetId&&a.type==='fund'))fail('Link the SIP to a mutual fund first.');
   after={id,name:label(command.data.name),assetId:command.data.assetId,amount:money(command.data.amount),currency:currency(command.data.currency),day:Number(command.data.day)};
   if(!Number.isInteger(after.day)||after.day<1||after.day>28)fail('Choose a debit day between 1 and 28.');s.plans.push(after);
 }else if(command.action==='settings.save'){
   before=s.settings;const d=command.data;
   try{new Intl.DateTimeFormat('en',{timeZone:d.timezone});}catch{fail('Invalid timezone.');}
   after={...s.settings,currency:currency(d.currency),timezone:d.timezone,autoSave:d.autoSave===true,gmailQuery:String(d.gmailQuery||'').trim().slice(0,500),trustedSenders:String(d.trustedSenders||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)};
   if(!after.gmailQuery||!/(?:label:|from:)/i.test(after.gmailQuery))fail('Choose at least one Gmail label or sender to limit processing.');s.settings=after;
 }else fail('Unsupported change.');
 s.audit.unshift({id,at:now,action:command.action,source,before,after:structuredClone(after)});
 return s;
}
export function applyProposal(current,proposalId,meta){
 const p=current.proposals.find(p=>p.id===proposalId&&p.status==='pending');if(!p)fail('This proposal is no longer pending.');
 if(p.command.id&&p.before!==undefined){const record=current.assets.find(a=>a.id===p.command.id)||current.transactions.find(a=>a.id===p.command.id);if(JSON.stringify(record)!==JSON.stringify(p.before))fail('The record changed after this proposal. Review it again.');}
 const s=mutate(current,p.command,{...meta,source:p.source||'assistant'});
 s.proposals.find(x=>x.id===p.id).status='approved';return s;
}
export function sampleState(){
 let s=emptyState();const now=new Date().toISOString(),today=now.slice(0,10),month=today.slice(0,7);
 const examples=[['bank','Everyday account','82000'],['fd','A little future security','250000'],['fund','Long-term index fund','186000'],['property','Home','4200000'],['metal','Gold savings','96000'],['loan','Home loan','1850000'],['card','Everyday credit card','12450']];
 for(const [type,name,amount]of examples)s=mutate(s,{action:'asset.save',data:{type,name,amount,currency:'INR',asOf:today}},{id:'sample-'+type,now,source:'sample'});
 for(const [kind,name,amount,category]of [['income','Monthly salary','95000','Salary'],['expense','Fresh groceries','2450','Food'],['expense','Coffee with friends','480','Dining']])s=mutate(s,{action:'transaction.save',data:{kind,name,amount,category,currency:'INR',date:month+'-01'}},{id:'sample-'+name,now,source:'sample'});
 return s;
}

