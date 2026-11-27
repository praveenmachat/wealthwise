import {CURRENCIES,fail,localDate,money,mutate,transaction,validDate} from './domain.mjs';

const months='JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
const amountPattern='(?:\\d{1,3}(?:,\\d{2,3})+|\\d+)(?:\\.\\d{1,2})?(?![\\d,]|\\.\\d)';
const currencyPattern='('+CURRENCIES.join('|')+'|₹|Rs\\.?)';
const decimal=value=>value.replace(/,/g,'');
const canonicalCurrency=code=>/^(?:₹|RS\.?)$/i.test(code)?'INR':code.toUpperCase();
export const smsAccount=account=>!account.archived&&['bank','card'].includes(account.type);

export function readBankSms(text){
 if(/\b(?:otp|one[- ]time (?:password|passcode)|verification code)\b/i.test(text))fail('Paste a transaction alert without verification codes.');
 const cardBalanceStart=text.search(/\b(?:outstanding (?:balance|amount)|available (?:credit(?: limit)?|limit)|avl\.?\s+(?:credit|limit)|(?:minimum|total) amount due|statement balance)\b/i);
 const bankBalanceStart=text.search(/\b(?:available|closing|current|remaining|new|avl\.?)\s+(?:account\s+)?(?:balance|bal)\b/i);
 const balanceStart=Math.min(...[cardBalanceStart,bankBalanceStart].filter(index=>index>=0),text.length);
 const entry=text.slice(0,balanceStart);
 const balanceText=text.slice(balanceStart);
 const amounts=[...entry.matchAll(new RegExp(currencyPattern+'\\s*('+amountPattern+')','gi'))];
 const amount=amounts.length===1?decimal(amounts[0][2]):'';
 const code=amounts.length===1?amounts[0][1].toUpperCase():'';
 const currency=canonicalCurrency(code);
 const credited=/\b(?:credited|credit received|salary received)\b/i.test(entry);
 const debited=/\b(?:debited|spent|purchase of|paid to|withdrawn|used|charged)\b/i.test(entry);
 const special=/\b(?:transfers?|transferred|repayment|refund|reversal|reversed|cashback|loan disburs(?:ed|ement)|card payment)\b/i.test(entry);
 const cardAlert=/\b(?:credit card|card ending|on your card)\b/i.test(entry)||cardBalanceStart>=0;
 const cardPayment=cardAlert&&/\b(?:payment received|payment of .{1,100} received|card (?:payment|repayment))\b/i.test(entry);
 const kind=cardPayment?'transfer':special||credited===debited?'':credited?(cardAlert?'':'income'):'expense';
 const direction=cardPayment?'in':'';
 const balanceMatch=balanceText.match(new RegExp('(?:balance|bal)\\.?(?:\\s+is)?\\s*[:=]?\\s*(?:'+currencyPattern+'\\s*)?('+amountPattern+')','i'));
 const balanceCode=balanceMatch?.[1]?.toUpperCase();
 const balanceCurrency=/^(?:₹|RS\.?)$/.test(balanceCode||'')?'INR':balanceCode;
 const balance=balanceMatch&&(!balanceCurrency||balanceCurrency===currency)?decimal(balanceMatch[2]):'';
 const cardAmount=label=>{
   const match=balanceText.match(new RegExp('(?:'+label+')\\.?(?:\\s+is)?\\s*[:=]?\\s*(?:'+currencyPattern+'\\s*)?('+amountPattern+')','i'));
   return match&&(!match[1]||canonicalCurrency(match[1])===currency)?decimal(match[2]):'';
 };
 const outstanding=cardAmount('outstanding (?:balance|amount)');
 const availableCredit=cardAmount('available (?:credit(?: limit)?|limit)|avl\\.?\\s+(?:credit|limit)');
 const iso=entry.match(/\b\d{4}-\d{2}-\d{2}\b/);
 const named=entry.match(/\b(\d{1,2})[- /]([a-z]{3})[- /](\d{4})\b/i);
 const month=named?months.indexOf(named[2].toUpperCase())+1:0;
 const candidate=iso?.[0]||(month?named[3]+'-'+String(month).padStart(2,'0')+'-'+named[1].padStart(2,'0'):'');
 let date='';
 if(candidate){try{date=validDate(candidate);}catch{}}
 const salary=/\bsalary\b/i.test(entry);
 return {kind,direction,currency,amount,date,balance:cardAlert?'':balance,outstanding,availableCredit,name:salary?'Salary':cardPayment?'Credit card payment':'',category:salary?'Salary':''};
}

export function checkBankEntry(state,input,now){
 const account=state.assets.find(a=>a.id===input.accountId&&smsAccount(a));
 if(!account)fail('Choose a bank account or credit card for this transaction.');
 if(input.currency!==account.currency)fail('The transaction currency must match the selected account.');
 if(!['income','expense','transfer'].includes(input.kind))fail('Choose the transaction type.');
 if(input.kind==='transfer'&&!['in','out'].includes(input.direction))fail('Choose whether the transfer came in or went out.');
 const entry=transaction(input,'preview-bank-entry');
 if(entry.date>localDate(now,state.settings.timezone))fail('The transaction date cannot be in the future.');
 const card=account.type==='card';
 if(card&&input.kind==='income')fail('For credit card payments or credits, choose a transfer into the card.');
 const rawBalance=card?input.outstanding:input.balance;
 const credit=card&&input.availableCredit!==''&&input.availableCredit!=null?money(input.availableCredit):null;
 if(rawBalance===''||rawBalance==null)return {account,entry,credit};
 const reported=money(rawBalance);
 if(entry.date<account.asOf)return {account,entry,reported,credit,stale:true};
 const alerts=[];
 if(card&&account.balanceBasis!=='outstanding'){
   alerts.push('The saved card balance is not marked as current outstanding. Confirm the SMS shows current outstanding before replacing it.');
   return {account,entry,reported,credit,expected:null,difference:null,alerts};
 }
 const sign=card?-1:1;
 if(reported===account.amount&&entry.date===account.asOf)alerts.push('The SMS balance is already saved for this date. Check whether the transaction is already recorded.');
 if(entry.date===account.asOf)alerts.push('The saved balance and alert are dated the same day. Confirm the alert is later before replacing the balance.');
 const relevant=state.transactions.filter(t=>t.currency===account.currency&&t.date>=account.asOf&&t.date<=entry.date);
 let expected=account.amount;
 for(const t of relevant){
   if(t.accountId&&t.accountId!==account.id)continue;
   if(!t.accountId){if(!alerts.includes('Some entries in this period have no linked account.'))alerts.push('Some entries in this period have no linked account.');continue;}
   if(t.date===account.asOf||t.date===entry.date){if(!alerts.includes('Other entries share a balance or alert date. Check when they occurred.'))alerts.push('Other entries share a balance or alert date. Check when they occurred.');}
   if(t.date===account.asOf)continue;
   if(t.kind==='income')expected+=sign*t.amount;
   if(t.kind==='expense')expected-=sign*t.amount;
   if(t.kind==='transfer'){
     if(t.direction==='in')expected+=sign*t.amount;
     else if(t.direction==='out')expected-=sign*t.amount;
     else if(!alerts.includes('A recorded transfer has no direction.'))alerts.push('A recorded transfer has no direction.');
   }
 }
 expected+=sign*(entry.kind==='income'||input.direction==='in'&&entry.kind==='transfer'?1:-1)*entry.amount;
 return {account,entry,reported,credit,expected,difference:reported-expected,alerts};
}

export function saveBankEntry(state,input,meta){
 const result=checkBankEntry(state,input,meta.now);
 const {account,entry,stale,difference,alerts}=result;
 const updateBalance=input.updateBalance===true;
 if(updateBalance&&(stale||result.reported===undefined))fail('A current or newer reported balance is required.');
 if(updateBalance&&(difference!==0||alerts.length)&&input.confirmDifference!==true)fail('Review the balance difference before saving.');
 const saved=mutate(state,{action:'transaction.save',data:input},meta);
 if(!updateBalance)return saved;
 return mutate(saved,{action:'asset.save',id:account.id,data:{
   type:account.type,name:account.name,amount:account.type==='card'?input.outstanding:input.balance,currency:account.currency,asOf:entry.date,
   institution:account.institution,accountRef:account.accountRef,notes:account.notes,
   ...(account.type==='card'?{balanceBasis:'outstanding',...(result.credit===null?{}:{availableCredit:input.availableCredit})}:{})
 }},{...meta,id:meta.id+'-balance'});
}
