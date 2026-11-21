'use strict';
// Per-process emergency limiter only. Multi-worker production requires a
// shared edge limiter; never trust client-supplied forwarded IP headers.
const WINDOW_MS=10*60*1000,MAX_KEYS=5000;
const attempts=new Map();
function publicQrRateLimit(req,res,next){
 const now=Date.now();const ip=req.socket?.remoteAddress||'unknown';
 const statusEndpoint=req.path==='/qr-status';
 const summaryEndpoint=req.path.startsWith('/public/');
 const limit=statusEndpoint?300:summaryEndpoint?120:60;
 const key=`${statusEndpoint?'status':summaryEndpoint?'summary':'join'}:${ip}`;
 if(attempts.size>MAX_KEYS){for(const [k,v] of attempts)if(v.until<=now)attempts.delete(k);}
 const item=attempts.get(key);
 if(item&&item.until>now&&item.count>=limit){
  res.set('Cache-Control','no-store');res.set('Retry-After',String(Math.max(1,Math.ceil((item.until-now)/1000))));
  return res.status(429).json({code:'qr_rate_limited',message:'So‘rovlar juda ko‘p. Birozdan keyin qayta urinib ko‘ring.'});
 }
 if(item&&item.until>now)item.count++;
 else if(attempts.size<MAX_KEYS)attempts.set(key,{until:now+WINDOW_MS,count:1});
 else return res.status(503).json({code:'qr_busy',message:'QR tizimi vaqtincha band.'});
 next();
}
module.exports={publicQrRateLimit};
