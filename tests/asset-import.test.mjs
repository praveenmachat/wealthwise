import test from 'node:test';import assert from 'node:assert/strict';
import {validateAssetImport,matchesAssetImport} from '../server/asset-import.mjs';
import {emptyState,mutate} from '../public/domain.mjs';
const selection={type:'bank',currency:'AED',asOf:'2026-11-23',recordId:null};
test('screenshot account selection rejects foreign or mismatched record IDs',()=>{
 const s=emptyState();assert.deepEqual(validateAssetImport(s,selection),selection);
 assert.throws(()=>validateAssetImport(s,{...selection,recordId:'other-user'}));
 assert.throws(()=>validateAssetImport(s,{...selection,type:'unknown'}));
});
test('screenshot results cannot change type, target, date or currency or create transactions',()=>{
 const change={action:'asset.save',recordId:null};
 assert.equal(matchesAssetImport(change,selection,selection),true);
 for(const data of [{...selection,type:'card'},{...selection,currency:'INR'},{...selection,asOf:'2012-12-24'}])assert.equal(matchesAssetImport(change,data,selection),false);
 assert.equal(matchesAssetImport({...change,recordId:'different'},selection,selection),false);
 assert.equal(matchesAssetImport({...change,action:'transaction.save'},selection,selection),false);
});
test('account details persist through later balance-only updates',()=>{
 let s=mutate(emptyState(),{action:'asset.save',data:{...selection,name:'Current account',amount:'864.68',accountRef:'123456789',branch:'Example branch',iban:'AE000000000000000000000'}},{id:'bank1',now:'2026-11-23T00:00:00Z'});
 s=mutate(s,{action:'asset.save',id:'bank1',data:{...selection,name:'Current account',amount:'900',accountRef:'123456789'}},{id:'change1',now:'2026-11-23T01:00:00Z'});
 assert.equal(s.assets[0].branch,'Example branch');assert.equal(s.assets[0].iban,'AE000000000000000000000');assert.equal(s.assets[0].amount,90000);
});

