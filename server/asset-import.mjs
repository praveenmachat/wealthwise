import {TYPES,CURRENCIES,validDate} from '../public/domain.mjs';
export function validateAssetImport(state,input){
 if(!input||!Object.hasOwn(TYPES,input.type)||!CURRENCIES.includes(input.currency))throw new Error('Choose an account type and currency.');
 const asOf=validDate(input.asOf),recordId=input.recordId||null;
 if(recordId){const old=state.assets.find(a=>a.id===recordId&&!a.archived);if(!old||old.type!==input.type||old.currency!==input.currency)throw new Error('Choose an existing account with the selected type and currency.');if(asOf<old.asOf)throw new Error('This balance date is older than the existing record.');}
 return {type:input.type,currency:input.currency,asOf,recordId};
}
export function matchesAssetImport(change,data,selection){
 return change.action==='asset.save'&&(change.recordId||null)===selection.recordId&&data.type===selection.type&&data.currency===selection.currency&&data.asOf===selection.asOf;
}

