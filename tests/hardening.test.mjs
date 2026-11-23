import test from 'node:test';import assert from 'node:assert/strict';
import {body} from '../server/core.mjs';import {authenticatedSender} from '../server/mail-auth.mjs';import {asset} from '../public/domain.mjs';
test('request parser rejects non-object JSON, wrong content type and oversized bodies',async()=>{
 for(const value of ['null','[]','"hello"'])await assert.rejects(()=>body(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:value})),e=>e.status===400);
 await assert.rejects(()=>body(new Request('https://example.com',{method:'POST',body:'{}'})),e=>e.status===415);
 await assert.rejects(()=>body(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json','content-length':'5700001'},body:'{}'})),e=>e.status===413);
 await assert.rejects(()=>body(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(5700001)})),e=>e.status===413);
 assert.deepEqual(await body(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:'{"ok":true}'})),{ok:true});
});
test('mail auto-save requires Gmail authentication and matching sender domains',()=>{
 const check=value=>authenticatedSender([{name:'Authentication-Results',value}],'info@geojit.com');
 assert.equal(check('mx.google.com; dkim=pass header.i=@geojit.com; dmarc=pass header.from=geojit.com'),true);
 assert.equal(check('other.example; dkim=pass header.i=@geojit.com; dmarc=pass header.from=geojit.com'),false);
 assert.equal(check('mx.google.com; dkim=pass header.i=@attacker.com; dmarc=pass header.from=attacker.com'),false);
 assert.equal(check('mx.google.com; dkim=pass header.i=@geojit.com; dmarc=fail header.from=geojit.com'),false);
});
test('prototype names are not accepted as asset types',()=>{for(const type of ['constructor','__proto__','toString'])assert.throws(()=>asset({type,name:'x',amount:'1',currency:'INR',asOf:'2026-11-23'},'x'));});

