const pool = require('../db');
const { createTelegramApi } = require('../telegram/api');

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Faqat admin uchun' });
  return next();
}
const fail = (res) => res.status(503).json({ message: 'Maʼlumotlarni hozir yuklab bo‘lmadi.' });
const intId = (raw) => /^\d+$/.test(String(raw)) && Number.isSafeInteger(+raw) && +raw > 0 ? +raw : null;


async function users(_req,res) {
  res.set('Cache-Control','no-store');
  try {
    // Deliberately excludes password hashes and authentication secrets.
    const result=await pool.query(`SELECT u.id AS user_id,u.phone,u.role,u.created_at,
      (u.admin_suspended_at IS NOT NULL) AS is_suspended,
      (u.deactivated_at IS NOT NULL) AS is_deactivated,
      CASE WHEN u.role='customer' THEN c.id ELSE b.id END AS profile_id,
      COALESCE(c.first_name,b.first_name,'') AS first_name,
      COALESCE(c.last_name,b.last_name,'') AS last_name
      FROM users u LEFT JOIN customers c ON c.user_id=u.id
      LEFT JOIN barbers b ON b.user_id=u.id
      ORDER BY u.created_at DESC,u.id DESC LIMIT 200`);
    res.json(result.rows);
  } catch { fail(res); }
}
const { createAccountDeletionService }=require('../services/accountDeletionService');
const deletionService=createAccountDeletionService(pool);
async function deleteUser(req,res) {
  const role=req.params.role;
  const profileId=intId(req.params.id);
  if (!profileId || !['customer','barber'].includes(role)) return res.status(400).json({message:'Hisob ID yoki turi noto‘g‘ri'});
  try {
    const result=await deletionService.deleteAccount({actor:req.user,profileId,role});
    res.json({removed:true,profileId:result.profileId,role:result.role});
  } catch(error) {
    res.status(Number.isInteger(error.status)?error.status:503).json({code:error.code||'delete_unavailable',message: error.status?error.message:'Hisobni o‘chirib bo‘lmadi.'});
  }
}

async function overview(_req, res) {
  try {
    const [users, barbers, bookings, posts, reports] = await Promise.all([
      pool.query("SELECT role, count(*)::int AS count FROM users GROUP BY role"),
      pool.query("SELECT verification_status, count(*)::int AS count FROM barbers GROUP BY verification_status"),
      pool.query("SELECT status, count(*)::int AS count FROM bookings GROUP BY status"),
      pool.query('SELECT count(*)::int AS count FROM social_posts'),
      pool.query('SELECT count(*)::int AS count FROM social_reports'),
    ]);
    res.json({ users: Object.fromEntries(users.rows.map(r=>[r.role,r.count])),
      barbers: Object.fromEntries(barbers.rows.map(r=>[r.verification_status,r.count])),
      bookings: Object.fromEntries(bookings.rows.map(r=>[r.status,r.count])),
      posts: posts.rows[0].count, reports: reports.rows[0].count });
  } catch { fail(res); }
}
async function barbers(_req, res) {
  try {
    const result = await pool.query(`SELECT b.id,b.first_name,b.last_name,b.specialty,b.salon_name,b.verification_status,
      b.accepting_bookings,b.created_at,u.phone FROM barbers b JOIN users u ON u.id=b.user_id
      ORDER BY CASE b.verification_status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,b.created_at DESC LIMIT 200`);
    res.json(result.rows);
  } catch { fail(res); }
}
async function bookings(_req, res) {
  try {
    const result = await pool.query(`SELECT bk.id,bk.booking_time,bk.status,bk.created_at,
      c.first_name AS customer_first,c.last_name AS customer_last,
      b.first_name AS barber_first,b.last_name AS barber_last,s.name AS service_name
      FROM bookings bk JOIN customers c ON c.id=bk.customer_id
      JOIN barbers b ON b.id=bk.barber_id JOIN services s ON s.id=bk.service_id
      ORDER BY bk.created_at DESC,bk.id DESC LIMIT 200`);
    res.json(result.rows);
  } catch { fail(res); }
}
async function reports(_req,res) {
  try {
    const result = await pool.query(`SELECT r.id,r.post_id,r.reason,r.details,r.created_at,
      b.first_name AS barber_first,b.last_name AS barber_last
      FROM social_reports r JOIN social_posts p ON p.id=r.post_id
      JOIN barbers b ON b.id=p.barber_id ORDER BY r.created_at DESC,r.id DESC LIMIT 200`);
    res.json(result.rows);
  } catch { fail(res); }
}
async function removePost(req,res) {
  const postId=intId(req.params.id);
  if (!postId) return res.status(400).json({message:'Post ID noto‘g‘ri'});
  try {
    // Cascades delete associated interactions/reports; media is deliberately retained.
    const result=await pool.query('DELETE FROM social_posts WHERE id=$1 RETURNING id',[postId]);
    if (!result.rowCount) return res.status(404).json({message:'Post topilmadi'});
    res.json({removed:true,id:result.rows[0].id});
  } catch { fail(res); }
}
async function telegramHealth(_req,res) {
  const env=process.env;
  const mode=env.TELEGRAM_UPDATE_MODE==='webhook'?'webhook':'polling';
  const configured=!!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
  const result={mode,configured,apiReachable:false,identityMatches:false,webhookActive:false,linkedBarbers:0};
  try { const db=await pool.query('SELECT count(*)::int AS count FROM barber_telegram_links'); result.linkedBarbers=db.rows[0].count; }
  catch { result.databaseReady=false; }
  if (!configured) return res.json(result);
  try {
    const api=createTelegramApi(env.TELEGRAM_BOT_TOKEN);
    const [me,hook]=await Promise.all([api('getMe',{},AbortSignal.timeout(6000)),api('getWebhookInfo',{},AbortSignal.timeout(6000))]);
    result.apiReachable=true;
    result.identityMatches=me?.is_bot===true && String(me.id)===env.TELEGRAM_BOT_TOKEN.split(':')[0] && me.username?.toLowerCase()===env.TELEGRAM_BOT_USERNAME.toLowerCase();
    result.webhookActive=!!hook?.url;
    result.modeConflict=mode==='polling' && result.webhookActive;
    // Do not expose bot token, webhook URL, chat IDs or other secrets.
  } catch { result.apiReachable=false; }
  res.json(result);
}
module.exports={adminOnly,overview,users,deleteUser,barbers,bookings,reports,removePost,telegramHealth};
