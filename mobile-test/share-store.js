"use strict";
globalThis.comfyMobileShare=async(operation,payload)=>new Promise((resolve,reject)=>{
 const request=indexedDB.open("comfyMobileSharesV1",1);
 request.onupgradeneeded=()=>request.result.createObjectStore("pending",{keyPath:"id"});
 request.onerror=()=>reject(new Error("Shared text could not be saved on this device."));
 request.onsuccess=()=>{
  const db=request.result,transaction=db.transaction("pending","readwrite"),store=transaction.objectStore("pending"),all=store.getAll();let result=null;
  all.onsuccess=()=>{
   const now=Date.now();for(const entry of all.result){if(now-entry.createdAt>7200000)store.delete(entry.id);}
   if(operation==="save"){
    const valid=all.result.filter(entry=>now-entry.createdAt<=7200000).sort((left,right)=>left.createdAt-right.createdAt);
    while(valid.length>=10)store.delete(valid.shift().id);
    const id=crypto.randomUUID();store.put({id,text:payload.text,createdAt:now});result=id;
   }else if(operation==="take"){
    const entry=all.result.find(entry=>entry.id===payload.id&&now-entry.createdAt<=7200000);if(entry){result=entry.text;store.delete(entry.id);}
   }
  };
  transaction.oncomplete=()=>{db.close();resolve(result);};transaction.onerror=()=>{db.close();reject(new Error("Shared text could not be saved on this device."));};transaction.onabort=transaction.onerror;
 };
});
