import {createHash} from 'node:crypto';
import {CARD_MONEY,CARD_DATES,CARD_TEXT,localDate,mutate} from '../public/domain.mjs';
import {emailAddress} from '../public/gmail-import.mjs';
import {error} from './core.mjs';

const kinds=new Set(['balance','income','expense','transfer']);

export function stageEmailImport(state, file, now){
 if(file?.version!==1||!Array.isArray(file.records)||file.records.length>100){
   throw error('Choose a WealthWise Gmail JSON file with up to 100 records.');
 }
 const data=structuredClone(state);
 const seen=new Set(data.proposals.map(proposal=>proposal.id));
 const today=localDate(now,state.settings.timezone);
 let imported=0;
 for(const [index, record] of file.records.entries()){
   try{
     const {kind,sender,date,amount,currency,name,sourceId,accountId,reference}=record;
     if(!kinds.has(kind)||typeof sender!=='string'||sender.length>254||!emailAddress.test(sender)
         ||typeof sourceId!=='string'||!sourceId.trim()||sourceId.length>250
         ||typeof name!=='string'||!name.trim()||name.length>160
         ||typeof amount!=='string'||typeof date!=='string'||date>today
         ||(reference!==undefined&&(typeof reference!=='string'||reference.length>120))){
       throw new Error('Check the sender, date, amount and source details.');
     }
     const prior=kind==='balance'?state.assets.find(asset=>asset.id===accountId&&!asset.archived):undefined;
     if(kind==='balance'&&(!prior||prior.currency!==currency||prior.asOf>date)){
       throw new Error('The balance must match an active account, currency and current or newer date.');
     }
     const accountDetails={};
     if(prior?.type==='card'){
       for(const field of CARD_MONEY)accountDetails[field]=prior[field]==null?null:(prior[field]/100).toFixed(2);
       for(const field of [...CARD_DATES,...CARD_TEXT])accountDetails[field]=prior[field];
     }
     if(prior?.type==='loan'){
       accountDetails.remainingMonths=prior.remainingMonths;
       accountDetails.nextInstallmentDate=prior.nextInstallmentDate;
       accountDetails.installmentAmount=prior.installmentAmount==null?null:(prior.installmentAmount/100).toFixed(2);
     }
     const command=prior
       ?{action:'asset.save',id:prior.id,data:{...accountDetails,branch:prior.branch,iban:prior.iban,type:prior.type,name:prior.name,amount,currency,asOf:date,
         institution:prior.institution,accountRef:prior.accountRef,notes:prior.notes,
         coverage:((prior.coverage||0)/100).toFixed(2)}}
       :{action:'transaction.save',data:{kind,name,amount,currency,date,reference}};
     const normalizedAmount=Number(amount).toFixed(2);
     const key=JSON.stringify([sender.toLowerCase(),sourceId,kind,date,currency,normalizedAmount,prior?.id||reference||name]);
     const id='chatgpt-'+createHash('sha256').update(key).digest('hex');
     if(seen.has(id))continue;
     mutate(state,command,{id,now,source:'ChatGPT Gmail import'});
     data.proposals.push({id,status:'pending',createdAt:now,source:'ChatGPT Gmail import',
       title:prior?'Update '+prior.name:name,reason:'Verify these details against the original email.',
       evidence:sender+' · '+date,command,...(prior?{before:prior}:{})});
     seen.add(id);
     imported++;
   }catch(err){
     throw error('Import row '+(index+1)+': '+err.message);
   }
 }
 return {data,imported};
}
