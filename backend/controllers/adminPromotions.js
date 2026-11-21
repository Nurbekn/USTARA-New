const pool = require('../db');
const positiveId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const { parseDates } = require('../services/promotionWindow');
async function list(req,res) {
  try {
    const rows = await pool.query(`SELECT b.id,b.first_name,b.last_name,b.verification_status,p.starts_at,p.expires_at,p.is_active
      FROM barbers b LEFT JOIN barber_promotions p ON p.barber_id=b.id ORDER BY b.id DESC LIMIT 500`);
    return res.json(rows.rows);
  } catch { return res.status(503).json({message:'Reklama boshqaruvi uchun database migration kerak',code:'promotion_unavailable'}); }
}
async function enable(req,res) {
  const id=positiveId(req.params.id), window=parseDates(req.body);
  if(!id || !window) return res.status(400).json({message:'Sartarosh ID yoki muddat noto‘g‘ri (1–720 soat).'});
  try {
    const result = await pool.query(`INSERT INTO barber_promotions(barber_id,starts_at,expires_at,is_active)
      SELECT id,$2,$3,TRUE FROM barbers WHERE id=$1 AND verification_status='approved'
      ON CONFLICT(barber_id) DO UPDATE SET starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,is_active=TRUE,updated_at=now()
      RETURNING barber_id,expires_at`,[id,window.startsAt,window.expiresAt]);
    return result.rows.length?res.json(result.rows[0]):res.status(404).json({message:'Tasdiqlangan sartarosh topilmadi'});
  } catch {return res.status(503).json({message:'Reklamani saqlab bo‘lmadi',code:'promotion_unavailable'});}
}
async function disable(req,res) {
  const id=positiveId(req.params.id);
  if(!id)return res.status(400).json({message:'ID noto‘g‘ri'});
  try { await pool.query('UPDATE barber_promotions SET is_active=FALSE,updated_at=now() WHERE barber_id=$1',[id]);return res.json({success:true}); }
  catch {return res.status(503).json({message:'Reklamani to‘xtatib bo‘lmadi'});}
}
async function publicList(_req,res) {
  try {
    const result=await pool.query(`SELECT p.barber_id FROM barber_promotions p JOIN barbers b ON b.id=p.barber_id
      WHERE p.is_active AND p.starts_at<=now() AND p.expires_at>now() AND b.verification_status='approved'`);
    return res.json(result.rows.map(r=>r.barber_id));
  } catch(error) {
    if(error.code === '42P01')return res.json([]); // Migration not yet deployed.
    return res.status(503).json({message:'Reklama ma’lumoti vaqtincha olinmadi'});
  }
}
module.exports={parseDates,list,enable,disable,publicList};
