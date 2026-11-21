'use strict';
// v164 — #66: bounded, strictly read-only Admin Booking Control Center.
// Never accepts mutation instructions or exposes customer phones/secrets.
const STATUSES=Object.freeze(['all','pending','confirmed','completed','cancelled','rejected']);
const PAGE_SIZE=50;
const validDay=s=>{
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
};
function parseQuery(query={}){
  if(!query || Array.isArray(query) || typeof query!=='object')return null;
  const keys=Object.keys(query);
  if(keys.some(key=>!['status','date','barberId','page'].includes(key)))return null;
  const status=query.status??'all',day=query.date??'',barberId=query.barberId??'',page=query.page??'1';
  if(!STATUSES.includes(status)||typeof day!=='string'||(day!==''&&!validDay(day)))return null;
  if(typeof barberId!=='string'||(barberId!==''&&!/^[1-9]\d{0,14}$/.test(barberId)))return null;
  if(typeof page!=='string'||!/^([1-9]\d{0,2})$/.test(page))return null;
  const pageNum=Number(page),barber=barberId===''?null:Number(barberId);
  if(pageNum>100||(barber!==null&&(!Number.isSafeInteger(barber)||barber>2147483647)))return null;
  return {status,day,barber,page:pageNum};
}
function createHandlers(db){
  return {async list(req,res){
    res.set('Cache-Control','no-store');
    if(req.user?.role!=='admin')return res.status(403).json({message:'Faqat admin uchun'});
    const filters=parseQuery(req.query);
    if(!filters)return res.status(400).json({message:'Bron filtrlari noto‘g‘ri'});
    const args=[],where=[];
    const param=value=>{args.push(value);return `$${args.length}`;};
    if(filters.status!=='all')where.push(`bk.status=${param(filters.status)}`);
    if(filters.barber!==null)where.push(`bk.barber_id=${param(filters.barber)}`);
    if(filters.day){
      const next=new Date(Date.parse(filters.day+'T00:00:00.000Z')+86400000).toISOString().slice(0,10);
      where.push(`bk.booking_time>=${param(filters.day+'T00:00:00+05:00')}`);
      where.push(`bk.booking_time<${param(next+'T00:00:00+05:00')}`);
    }
    const sql=`SELECT bk.id,bk.booking_time,bk.status,bk.created_at,bk.barber_id,
      c.first_name AS customer_first,c.last_name AS customer_last,
      b.first_name AS barber_first,b.last_name AS barber_last,
      s.name AS service_name
      FROM bookings bk JOIN customers c ON c.id=bk.customer_id
      JOIN barbers b ON b.id=bk.barber_id JOIN services s ON s.id=bk.service_id
      ${where.length?'WHERE '+where.join(' AND '):''}
      ORDER BY bk.booking_time DESC,bk.id DESC
      LIMIT ${param(PAGE_SIZE+1)} OFFSET ${param((filters.page-1)*PAGE_SIZE)}`;
    try{
      const result=await db.query(sql,args);
      return res.json({page:filters.page,pageSize:PAGE_SIZE,hasNext:result.rows.length>PAGE_SIZE,
        filters:{status:filters.status,date:filters.day,barberId:filters.barber},
        bookings:result.rows.slice(0,PAGE_SIZE)});
    }catch(error){
      console.error('admin booking control read failed',error?.code||'database_unavailable');
      return res.status(503).json({message:'Bronlarni hozir yuklab bo‘lmadi'});
    }
  }};
}
module.exports={createHandlers,parseQuery,PAGE_SIZE,STATUSES};
