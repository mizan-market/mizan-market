const CACHE='mizan-market-shell-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/index.html','/favicon.svg','/manifest.webmanifest']))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||caches.match('/index.html'))))});
