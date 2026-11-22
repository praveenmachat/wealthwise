import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {TYPES,LIABILITY,totals} from '../public/domain.mjs';
import {inrAmount} from '../public/currency.mjs';
const code=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
function render(filter,items){
 const context={assetFilter:filter,TYPES,LIABILITY,totals,inrAmount,fx:{rates:{AED:25},asOf:'2026-11-22'},esc:String,fmt:(n,c)=>c+' '+(n/100).toFixed(2),accountRow:a=>'<row>'+a.name+' '+a.currency+' '+a.amount+'</row>'};
 vm.createContext(context);
 vm.runInContext(code.slice(code.indexOf('function inrRow('),code.indexOf('function portfolio(){')),context);
 return {rows:context.portfolioRows(items),summary:context.portfolioSummary(items)};
}
const items=[{type:'stock',currency:'INR',amount:4900500,name:'Stock A',asOf:'2026-11-21'},{type:'stock',currency:'INR',amount:11220000,name:'Stock B',asOf:'2026-11-21'},{type:'loan',currency:'AED',amount:15009898,name:'Loan',asOf:'2026-11-21'}];
test('All view groups Indian stocks without mixing currencies',()=>{
 const r=render('all',items);assert.match(r.rows,/Indian stocks/);assert.match(r.rows,/INR 161205.00/);assert.doesNotMatch(r.rows,/Stock A|Stock B/);assert.match(r.rows,/Loan/);
 assert.doesNotMatch(r.rows,/AED/);assert.match(r.summary,/INR 3752474.50/);assert.match(r.summary,/INR 161205.00/);
});
test('Stock view keeps individual holdings and its own summary',()=>{const r=render('stock',items.slice(0,2));assert.match(r.rows,/Stock A/);assert.match(r.rows,/Stock B/);assert.match(r.summary,/2 records/);assert.doesNotMatch(r.summary,/AED/);});

