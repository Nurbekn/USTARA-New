"use strict";
// A bounded Chrome DevTools transport. Never leaves unresolved promises if
// Chrome crashes or its websocket closes while an E2E step is pending.
function assertLocalDevtoolsUrl(raw,port){
 let uri;try{uri=new URL(raw);}catch{throw Error('Chrome DevTools URL invalid');}
 if(uri.protocol!=='ws:'||uri.hostname!=='127.0.0.1'||uri.port!==String(port)||
    !/^\/devtools\/page\/[a-zA-Z0-9-]+$/.test(uri.pathname)||uri.username||uri.password||uri.search||uri.hash)
  throw Error('Chrome DevTools must be a same-port loopback page');
 return uri.toString();
}
function createCdpTransport(ws,{timeoutMs=7000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>30000)
  throw Error('CDP timeout invalid');
 let nextId=0,dead=false;
 const pending=new Map();
 const terminate=(message)=>{
  if(dead)return;
  dead=true;
  for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error(message));}
  pending.clear();
 };
 ws.addEventListener('message',evt=>{
  let payload;try{payload=JSON.parse(evt.data);}catch{terminate('CDP invalid response');return;}
  const entry=pending.get(payload?.id);if(!entry)return;
  clearTimeout(entry.timer);pending.delete(payload.id);
  payload.error ? entry.reject(Error('CDP command failed')) : entry.resolve(payload.result);
 });
 ws.addEventListener('close',()=>terminate('Chrome CDP connection closed'));
 ws.addEventListener('error',()=>terminate('Chrome CDP connection failed'));
 function send(method,params={}){
  if(dead||ws.readyState!==1)return Promise.reject(Error('Chrome CDP unavailable'));
  if(typeof method!=='string'||!/^[a-zA-Z]+\.[A-Za-z]+$/.test(method))
   return Promise.reject(Error('Invalid CDP method'));
  const id=++nextId;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    pending.delete(id);reject(Error('Chrome CDP command timed out'));
   },timeoutMs);
   pending.set(id,{resolve,reject,timer});
   try{ws.send(JSON.stringify({id,method,params}));}
   catch{clearTimeout(timer);pending.delete(id);reject(Error('Chrome CDP send failed'));}
  });
 }
 return {send,close(){terminate('Chrome CDP stopped');ws.close();},get pendingCount(){return pending.size;}};
}
module.exports={assertLocalDevtoolsUrl,createCdpTransport};
