import test from 'node:test';
import assert from 'node:assert/strict';
import {emailText} from '../server/email-text.mjs';
import {geojitProposals,verifiedGeojit} from '../server/geojit.mjs';
import {emptyState,applyProposal} from '../public/domain.mjs';
const html='<html><body>Holding Statement As On 21 Nov 2026 ClientId: 12345<table><tr><td>INE208A01029</td><td>Example stock</td><td>Beneficiary Balance</td><td>300</td><td>163.35</td><td>49005.00</td><td>NSE</td></tr><tr><td>Total</td><td>49005.00</td></tr></table></body></html>';
test('HTML conversion keeps adjacent financial columns separate',()=>{assert.match(emailText(html),/300 \| 163.35 \| 49005.00/);assert.ok(!emailText(html).includes('300163.35'));});
test('first Geojit import uses reconciled table values and maps ISIN after approval',()=>{
 const state=emptyState();state.settings.trustedSenders=['info@geojit.com'];
 state.proposals=geojitProposals(state,html,'test-mail');
 assert.equal(state.proposals[0].command.data.amount,'49005.00');
 const saved=applyProposal(state,state.proposals[0].id,{id:'asset1',now:new Date().toISOString()});
 assert.equal(saved.assets[0].amount,4900500);assert.equal(saved.assets[0].accountRef,'INE208A01029');
 const update=verifiedGeojit(saved,html,{sender:'info@geojit.com',authenticated:true,messageId:'mail2'});
 assert.equal(update.data.assets.length,1);assert.equal(update.data.assets[0].amount,4900500);
});
test('invalid Geojit values cannot become review proposals',()=>{assert.throws(()=>geojitProposals(emptyState(),html.replace('49005.00','300163.35'),'bad'),/reconcile/);});

