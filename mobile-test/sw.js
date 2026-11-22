"use strict";
importScripts("./share-store.js");
const cacheName="comfy-mobile-shell-0.1.5";
const shell=["./","./index.html","./config.js","./mobile.js","./share-store.js","./shell.css","./manifest.webmanifest","./icon.svg","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(shell.map(path=>new Request(new URL(path,self.registration.scope),{cache:"reload"})))).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith("comfy-mobile-shell-")&&name!==cacheName).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(url.origin!==scope.origin)return;
 if(event.request.method==="POST"&&url.pathname===new URL("share",scope).pathname){
  event.respondWith((async()=>{
   try{
    if(!(event.request.headers.get("Content-Type")||"").startsWith("application/x-www-form-urlencoded"))return new Response("Unsupported share format.",{status:415});
    const reader=event.request.body.getReader(),chunks=[];let length=0;
    for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>1048576){await reader.cancel();return new Response("Choose a smaller passage to share.",{status:413});}chunks.push(part.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const form=new URLSearchParams(new TextDecoder().decode(bytes));
    const text=(form.get("text")||form.get("url")||form.get("title")||"").replace(/\u00a0/g," ");
    if(!text.trim()||text.length>200000)return new Response("Select some text and share it to Comfy.",{status:400});
    const id=await comfyMobileShare("save",{text});
    return Response.redirect(new URL("?share="+encodeURIComponent(id),scope),303);
   }catch(error){return new Response("Comfy could not receive this share. Open Comfy and paste the text instead.",{status:400});}
  })());return;
 }
 if(event.request.method!=="GET"||!shell.some(path=>new URL(path,scope).pathname===url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(cacheName);const key=new Request(url.origin+url.pathname);try{const response=await fetch(event.request);if(response.ok)await cache.put(key,response.clone());return response;}catch(error){const saved=await cache.match(key);return saved||new Response("Connect to the internet to open Comfy.",{status:503});}})());
});
