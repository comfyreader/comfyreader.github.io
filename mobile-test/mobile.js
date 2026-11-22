"use strict";
(()=>{
 const config=window.COMFY_MOBILE_CONFIG;
 const status=document.getElementById("status"),frame=document.getElementById("reader"),login=document.getElementById("login");
 const sessionKey="comfyMobileAuthV1",pendingKey="comfyMobilePkceV1";
 let session=null,assetUrls=[],installPrompt=null,busy=false,refreshPromise=null;
 function report(message){status.textContent=message;}
 function destroyReader(){
  try{frame.contentWindow?.speechSynthesis?.cancel();}catch(ignored){}
  frame.removeAttribute("srcdoc");frame.src="about:blank";frame.hidden=true;
  for(const url of assetUrls)URL.revokeObjectURL(url);assetUrls=[];
  document.getElementById("sessionBar").hidden=true;login.hidden=false;
 }
 function remember(value){
  session=value?{access_token:value.access_token,refresh_token:value.refresh_token,expires_at:value.expires_at||Math.floor(Date.now()/1000)+(value.expires_in||3600)}:null;
  if(session)localStorage.setItem(sessionKey,JSON.stringify(session));else localStorage.removeItem(sessionKey);
 }
 async function authRequest(path,body,token){
  const response=await fetch(config.endpoint+path,{method:body===undefined?"GET":"POST",headers:{apikey:config.publicKey,...(token?{Authorization:"Bearer "+token}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",credentials:"omit"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error_description||data.msg||data.message||"Sign-in could not be completed.");return data;
 }
 async function accessToken(){
  if(!session?.refresh_token)throw new Error("Sign in to open the private test.");
  if(session.expires_at*1000>Date.now()+60000)return session.access_token;
  if(!refreshPromise)refreshPromise=authRequest("/auth/v1/token?grant_type=refresh_token",{refresh_token:session.refresh_token}).then(value=>{remember(value);return value.access_token;}).finally(()=>{refreshPromise=null;});
  return refreshPromise;
 }
 async function loadReader(){
  report("Checking your access...");const token=await accessToken();await authRequest("/auth/v1/user",undefined,token);
  const response=await fetch(config.endpoint+"/storage/v1/object/authenticated/"+encodeURIComponent(config.bucket)+"/"+encodeURIComponent(config.object)+"?v=0.1.4",{headers:{apikey:config.publicKey,Authorization:"Bearer "+token},cache:"no-store",credentials:"omit"});
  if(!response.ok)throw new Error(response.status===401?"Your sign-in expired. Please sign in again.":"This account does not have access to the private Comfy test.");
  report("Opening your private reader...");const bundle=await response.json();
  if(!["0.1.0","0.1.1","0.1.2","0.1.3","0.1.4"].includes(bundle.version)||!bundle.files?.["page.html"])throw new Error("The private reader package is not supported.");
  const decoded=new Map();
  for(const [name,file]of Object.entries(bundle.files)){
   const bytes=Uint8Array.from(atob(file.data),character=>character.charCodeAt(0));
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),value=>value.toString(16).padStart(2,"0")).join("");
   if(hash!==file.sha256)throw new Error("The reader package could not be verified.");decoded.set(name,bytes);
  }
  const urls={},text=new TextDecoder();
  for(const [name,bytes]of decoded){if(name==="page.html"||name.endsWith(".css"))continue;urls[name]=URL.createObjectURL(new Blob([bytes],{type:bundle.files[name].type}));assetUrls.push(urls[name]);}
  for(const name of [...decoded.keys()].filter(name=>name.endsWith(".css")).sort((left,right)=>left==="fonts.css"?-1:right==="fonts.css"?1:0)){
   let css=text.decode(decoded.get(name));css=css.replace(/(?:url\(["']?)([^)'"\s]+)(?:["']?\))/g,(match,path)=>urls[path]?`url("${urls[path]}")`:match);
   urls[name]=URL.createObjectURL(new Blob([css],{type:"text/css"}));assetUrls.push(urls[name]);
  }
  let html=text.decode(decoded.get("page.html"));
  html=html.replace(/\b(src|href)="([^"]+)"/g,(match,attribute,path)=>urls[path]?`${attribute}="${urls[path]}"`:match);
  const bootstrap=URL.createObjectURL(new Blob(["window.comfyMobileAssets="+JSON.stringify(urls)+";"],{type:"text/javascript"}));assetUrls.push(bootstrap);
  html=html.replace("<head>",'<head><script src="'+bootstrap+'"></script>');
  frame.onload=async()=>{
   const id=sessionStorage.getItem("comfyMobilePendingShareV1");if(!id)return;
   try{const shared=await comfyMobileShare("take",{id});sessionStorage.removeItem("comfyMobilePendingShareV1");if(shared)frame.contentWindow.postMessage({type:"COMFY_SHARED_TEXT",text:shared},location.origin);}catch(error){report(error.message);}
  };
  frame.removeAttribute("src");frame.srcdoc=html;login.hidden=true;frame.hidden=false;document.getElementById("sessionBar").hidden=false;report("");
 }
 async function guarded(action){
  if(busy)return;busy=true;document.querySelectorAll("#login button,#login input").forEach(control=>control.disabled=true);
  try{await action();}catch(error){destroyReader();report(error.message||"Comfy could not open. Please try again.");}
  finally{busy=false;document.querySelectorAll("#login button,#login input").forEach(control=>control.disabled=false);}
 }
 document.getElementById("emailForm").addEventListener("submit",event=>{event.preventDefault();void guarded(async()=>{
  report("Signing in...");const value=await authRequest("/auth/v1/token?grant_type=password",{email:document.getElementById("email").value.trim(),password:document.getElementById("password").value});document.getElementById("password").value="";remember(value);await loadReader();
 });});
 document.getElementById("google").addEventListener("click",()=>void guarded(async()=>{
  const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,"0")).join("");
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));
  const challenge=btoa(String.fromCharCode(...digest)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  sessionStorage.setItem(pendingKey,JSON.stringify({verifier,time:Date.now()}));
  const destination=new URL(config.endpoint+"/auth/v1/authorize");destination.search=new URLSearchParams({provider:"google",redirect_to:location.origin+location.pathname,code_challenge:challenge,code_challenge_method:"s256"});location.assign(destination);
 }));
 document.getElementById("signOut").addEventListener("click",()=>void guarded(async()=>{const old=session?.access_token;destroyReader();remember(null);if(old){try{await authRequest("/auth/v1/logout?scope=local",{},old);}catch(ignored){}}report("Signed out on this device.");}));
 for(const id of ["install","installReader"])document.getElementById(id).addEventListener("click",async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;document.getElementById("install").hidden=true;document.getElementById("installReader").hidden=true;}});
 window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;document.getElementById("install").hidden=false;document.getElementById("installReader").hidden=false;});
 window.addEventListener("pagehide",()=>{try{frame.contentWindow?.speechSynthesis?.cancel();}catch(ignored){}});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&session&&!frame.hidden){void guarded(async()=>{const token=await accessToken();await authRequest("/auth/v1/user",undefined,token);});}});
 if("serviceWorker"in navigator){navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"}).catch(()=>report("Sharing setup is unavailable. You can still paste text into Comfy."));}
 void guarded(async()=>{
  const parameters=new URLSearchParams(location.search);const code=parameters.get("code");
  const sharedId=parameters.get("share");
  if(sharedId&&/^[0-9a-f-]{36}$/i.test(sharedId)){sessionStorage.setItem("comfyMobilePendingShareV1",sharedId);parameters.delete("share");history.replaceState(null,"",location.pathname+(parameters.size?"?"+parameters.toString():""));report("Shared text is saved on this device. Sign in to read it.");}
  if(code||parameters.has("error")){
   let pending=null;try{pending=JSON.parse(sessionStorage.getItem(pendingKey)||"null");}catch(ignored){}
   sessionStorage.removeItem(pendingKey);history.replaceState(null,"",location.pathname);
   if(parameters.has("error"))throw new Error("Google sign-in was not completed. Try again.");
   if(!pending?.verifier||Date.now()-pending.time>600000)throw new Error("Sign-in expired. Please start again.");
   remember(await authRequest("/auth/v1/token?grant_type=pkce",{auth_code:code,code_verifier:pending.verifier}));await loadReader();return;
  }
  try{session=JSON.parse(localStorage.getItem(sessionKey)||"null");}catch(ignored){}
  if(session)await loadReader();
 });
})();
