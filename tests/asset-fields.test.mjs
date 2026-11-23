import test from 'node:test';import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';import {configureAssetFields} from '../public/asset-fields.mjs';
test('type-specific forms hide and disable unrelated fields and restore them when switched',()=>{
 const names=['type','institution','accountRef','branch','iban','coverage','amount','notes'];
 const {document}=parseHTML('<form>'+names.map(n=>'<div><label for="'+n+'">'+n+'</label><input id="'+n+'" name="'+n+'"></div>').join('')+'<p data-insurance-help></p><fieldset id="loan-fields"></fieldset><fieldset id="card-fields"></fieldset></form>');
 const f=document.querySelector('form');Object.defineProperty(f,'elements',{value:Object.fromEntries(names.map(n=>[n,document.getElementById(n)]))});
 for(const type of ['property','vehicle','metal','other']){
 f.elements.type.value=type;configureAssetFields(f);
 for(const n of ['institution','accountRef','branch','iban','coverage']){assert.equal(f.elements[n].hidden,true);assert.equal(f.elements[n].disabled,true);}
 }
 f.elements.type.value='bank';configureAssetFields(f);assert.equal(f.elements.iban.hidden,false);assert.equal(f.elements.institution.disabled,false);
 f.elements.type.value='insurance';configureAssetFields(f);assert.equal(f.elements.coverage.hidden,false);assert.equal(f.elements.branch.hidden,true);assert.match(document.querySelector('label[for="accountRef"]').textContent,/Policy/);
 f.elements.type.value='card';configureAssetFields(f);assert.equal(document.querySelector('#card-fields').disabled,false);assert.equal(document.querySelector('#loan-fields').disabled,true);
});

