import test from 'node:test';import assert from 'node:assert/strict';
import {emptyState,mutate,dueLoans} from '../public/domain.mjs';
import {inrAmount} from '../public/currency.mjs';
const create=()=>mutate(emptyState(),{action:'asset.save',data:{type:'loan',name:'Loan',amount:'150098.98',currency:'AED',asOf:'2026-11-22',remainingMonths:'28',nextInstallmentDate:'2026-11-27',installmentAmount:'5360.67'}},{id:'loan',now:'2026-11-22T00:00:00Z'});
test('loan check respects due date in workspace timezone',()=>{assert.equal(dueLoans(create(),'2026-11-26T19:59:00Z').length,0);assert.equal(dueLoans(create(),'2026-11-26T20:00:00Z').length,1);});
test('paid confirmation advances schedule exactly once and preserves balance without bank evidence',()=>{
 const s=create(),command={action:'loan.confirm',id:'loan',data:{dueDate:'2026-11-27',status:'paid',paymentDate:'2026-11-27'}},meta={id:'paid',now:'2026-11-27T10:00:00Z'};
 const next=mutate(s,command,meta);assert.equal(next.assets[0].remainingMonths,27);assert.equal(next.assets[0].nextInstallmentDate,'2026-12-27');assert.equal(next.assets[0].amount,15009898);assert.deepEqual(mutate(next,command,meta),next);assert.throws(()=>mutate(next,command,{...meta,id:'again'}));
});
test('not paid keeps due date, tenure and balance',()=>{const s=mutate(create(),{action:'loan.confirm',id:'loan',data:{dueDate:'2026-11-27',status:'unpaid'}},{id:'unpaid',now:'2026-11-27T10:00:00Z'});assert.equal(s.assets[0].remainingMonths,28);assert.equal(s.assets[0].nextInstallmentDate,'2026-11-27');assert.equal(s.assets[0].installmentStatus,'unpaid');});
test('ordinary balance updates preserve repayment fields',()=>{const s=mutate(create(),{action:'asset.save',id:'loan',data:{type:'loan',name:'Loan',amount:'145000',currency:'AED',asOf:'2026-11-28'}},{id:'update',now:'2026-11-28T10:00:00Z'});assert.equal(s.assets[0].installmentAmount,536067);assert.equal(s.assets[0].remainingMonths,28);});
test('month end remains anchored after February',()=>{let s=create();s.assets[0].nextInstallmentDate='2027-01-31';for(const [due,next,now] of [['2027-01-31','2027-02-28','2027-01-31'],['2027-02-28','2027-03-31','2027-02-28']]){s=mutate(s,{action:'loan.confirm',id:'loan',data:{dueDate:due,status:'paid'}},{id:due,now:now+'T12:00:00Z'});assert.equal(s.assets[0].nextInstallmentDate,next);}});
test('FX conversion uses minor units and never treats missing rates as zero',()=>{assert.equal(inrAmount(15009898,'AED',{rates:{AED:25}}),375247450);assert.equal(inrAmount(100,'AED',null),null);assert.equal(inrAmount(100,'INR',null),100);});

