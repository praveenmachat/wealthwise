const CACHE='wealthwise-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/style.css','/app.mjs','/domain.mjs','/icon.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/.netlify/'))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(r=>r||new Response('Offline. Reconnect to continue.',{status:503}))));});
