import test from 'node:test';import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {pastedImage,selectedImage,installImagePaste} from '../public/image-input.mjs';
test('clipboard accepts image files and ignores ordinary text',()=>{
 const file=new File(['image'],'screen.png',{type:'image/png'});
 assert.equal(pastedImage({items:[{kind:'file',type:'image/png',getAsFile:()=>file}]}),file);
 assert.equal(pastedImage({items:[{kind:'string',type:'text/plain'}]}),null);
});
test('paste stays local, previews image and does not intercept text or closed dialogs',()=>{
 const {document,Event}=parseHTML('<html><body><dialog id="dialog"><form id="asset-image-form"><div class="upload-zone"><input type="file" required></div></form></dialog></body></html>');
 const old=globalThis.document;globalThis.document=document;
 try{
 const dialog=document.querySelector('dialog');dialog.open=true;const form=document.querySelector('form');
 installImagePaste({notify:message=>{throw Error(message);}});
 const file=new File(['image'],'screen.png',{type:'image/png'});
 const paste=new Event('paste',{cancelable:true});paste.clipboardData={items:[{kind:'file',type:'image/png',getAsFile:()=>file}]};document.dispatchEvent(paste);
 assert.equal(paste.defaultPrevented,true);assert.equal(selectedImage(form),file);assert.ok(form.querySelector('img'));assert.equal(form.querySelector('input').required,false);
 const text=new Event('paste',{cancelable:true});text.clipboardData={items:[{kind:'string',type:'text/plain'}]};document.dispatchEvent(text);assert.equal(text.defaultPrevented,false);
 dialog.open=false;dialog.dispatchEvent(new Event('close'));
 const closed=new Event('paste',{cancelable:true});closed.clipboardData=paste.clipboardData;document.dispatchEvent(closed);assert.equal(closed.defaultPrevented,false);
 }finally{globalThis.document=old;}
});

