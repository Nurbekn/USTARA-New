// #39-41: private human-to-human messages. No request can self-label as AI.
// The only trusted identities are accountId + role resolved by authMiddleware.
const MAX_BODY = 1000;
const id = value => (typeof value === 'string' && /^[1-9]\d*$/.test(value) || Number.isSafeInteger(value) && value > 0)
  && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647 ? Number(value) : null;
const bodyText = value => typeof value === 'string' && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  && value.trim().length <= MAX_BODY ? value.trim() : null;
function account(req) {
  return ['customer', 'barber'].includes(req.user?.role) && id(req.user.accountId)
    ? { userId: Number(req.user.accountId), role: req.user.role } : null;
}
function message(row) {
  return { id: Number(row.id), threadId: Number(row.thread_id), senderUserId: Number(row.sender_user_id),
    body: row.body, sharedPostId: row.shared_post_id == null ? null : Number(row.shared_post_id),
    source: row.sender_kind, createdAt: row.created_at };
}
const error = (res, status, text, code) => res.status(status).json({ message: text, ...(code ? { code } : {}) });
function createHandlers(db) {
  async function createThread(req, res) {
    const a = account(req), barberId = id(req.body?.barberId);
    if (!a || a.role !== 'customer') return error(res, 403, 'Chatni faqat mijoz boshlashi mumkin.');
    if (!barberId) return error(res, 400, 'Sartarosh ID noto‘g‘ri.');
    try {
      const found = await db.query(`INSERT INTO customer_barber_chat_threads(customer_user_id,barber_id)
        SELECT $1,b.id FROM barbers b WHERE b.id=$2 AND b.verification_status='approved'
        ON CONFLICT(customer_user_id,barber_id) DO UPDATE SET customer_user_id=EXCLUDED.customer_user_id
        RETURNING id`, [a.userId, barberId]);
      return found.rowCount ? res.json({ threadId: Number(found.rows[0].id) }) : error(res, 404, 'Tasdiqlangan sartarosh topilmadi.');
    } catch { return error(res, 503, 'Chatni ochib bo‘lmadi.', 'chat_unavailable'); }
  }
  async function list(req, res) {
    const a = account(req); if (!a) return error(res, 403, 'Chatga kirish mumkin emas.');
    try {
      const rows = await db.query(`SELECT t.id,t.updated_at,t.barber_id,
        CASE WHEN $2='customer' THEN concat_ws(' ',b.first_name,b.last_name)
          ELSE concat_ws(' ',c.first_name,c.last_name) END AS peer_name
        FROM customer_barber_chat_threads t JOIN barbers b ON b.id=t.barber_id
        JOIN customers c ON c.user_id=t.customer_user_id
        WHERE ($2='customer' AND t.customer_user_id=$1) OR ($2='barber' AND b.user_id=$1)
        ORDER BY t.updated_at DESC,t.id DESC LIMIT 100`,[a.userId,a.role]);
      return res.json(rows.rows.map(r => ({ id:Number(r.id), peerName:r.peer_name || 'Foydalanuvchi',barberId:Number(r.barber_id),updatedAt:r.updated_at })));
    } catch { return error(res, 503, 'Chatlar yuklanmadi.', 'chat_unavailable'); }
  }
  // Call this on every read/write. Do not rely on frontend-selected barberId.
  async function member(dbClient, threadId, a, lock = false) {
    const found = await dbClient.query(`SELECT t.id,t.customer_user_id,b.user_id AS barber_user_id,b.verification_status
      FROM customer_barber_chat_threads t JOIN barbers b ON b.id=t.barber_id
      WHERE t.id=$1 AND (($2='customer' AND t.customer_user_id=$3)
        OR ($2='barber' AND b.user_id=$3)) ${lock ? 'FOR UPDATE OF t' : ''}`,[threadId,a.role,a.userId]);
    return found.rows[0] || null;
  }
  async function read(req, res) {
    const a = account(req), threadId = id(req.params.threadId);
    if (!a) return error(res,403,'Chatga kirish mumkin emas.');
    if (!threadId) return error(res,400,'Chat ID noto‘g‘ri.');
    try {
      if (!await member(db,threadId,a)) return error(res,404,'Chat topilmadi.');
      const items = await db.query(`SELECT m.id,m.thread_id,m.sender_user_id,m.body,m.shared_post_id,m.sender_kind,m.created_at
        FROM customer_barber_chat_messages m WHERE m.thread_id=$1 ORDER BY m.id DESC LIMIT 100`,[threadId]);
      return res.json({ messages: items.rows.reverse().map(message), limited: items.rowCount===100 });
    } catch { return error(res,503,'Xabarlar yuklanmadi.','chat_unavailable'); }
  }
  async function send(req,res) {
    const a = account(req), threadId = id(req.params.threadId);
    if (!a) return error(res,403,'Chatga kirish mumkin emas.');
    if (!threadId) return error(res,400,'Chat ID noto‘g‘ri.');
    const body = bodyText(req.body?.body ?? '');
    const postId = req.body?.sharedPostId == null ? null : id(req.body.sharedPostId);
    if (body === null || req.body?.senderKind !== undefined || req.body?.source !== undefined
      || req.body?.isAi !== undefined || (req.body?.sharedPostId != null && !postId) || (!body && !postId))
      return error(res,400,'Xabar matni, post yoki manbasi noto‘g‘ri.');
    let client;
    try {
      client = await db.connect();
      await client.query('BEGIN');
      const thread = await member(client,threadId,a,true);
      if (!thread) { await client.query('ROLLBACK'); return error(res,404,'Chat topilmadi.'); }
      if (thread.verification_status !== 'approved') {
        await client.query('ROLLBACK'); return error(res,409,'Bu sartaroshga yangi xabar yuborib bo‘lmaydi.');
      }
      if (postId) {
        const allowed = await client.query(`SELECT 1 FROM social_posts p JOIN barbers b ON b.id=p.barber_id
          WHERE p.id=$1 AND b.verification_status='approved'`,[postId]);
        if (!allowed.rowCount) { await client.query('ROLLBACK'); return error(res,404,'Ulashiladigan post topilmadi.'); }
      }
      const recent = await client.query(`SELECT created_at FROM customer_barber_chat_messages
        WHERE thread_id=$1 AND sender_user_id=$2 ORDER BY id DESC LIMIT 1`,[threadId,a.userId]);
      if (recent.rowCount && Date.now() - new Date(recent.rows[0].created_at).getTime() < 2000) {
        await client.query('ROLLBACK'); res.set('Retry-After','2'); return error(res,429,'Xabarlarni juda tez yubormang.');
      }
      // A post-only share needs a fallback caption: moderation may later delete the post.
      const persistedBody = !body && postId ? 'Ulashilgan post' : body;
      const inserted = await client.query(`INSERT INTO customer_barber_chat_messages(thread_id,sender_user_id,body,shared_post_id,sender_kind)
        VALUES($1,$2,$3,$4,'human')
        RETURNING id,thread_id,sender_user_id,body,shared_post_id,sender_kind,created_at`,[threadId,a.userId,persistedBody,postId]);
      await client.query('UPDATE customer_barber_chat_threads SET updated_at=clock_timestamp() WHERE id=$1',[threadId]);
      await client.query('COMMIT');
      return res.status(201).json({ message:message(inserted.rows[0]) });
    } catch {
      if (client) try { await client.query('ROLLBACK'); } catch { /* best effort */ }
      return error(res,503,'Xabarni yuborib bo‘lmadi.','chat_unavailable');
    } finally { client?.release(); }
  }
  return { createThread, list, read, send };
}
module.exports = { createHandlers, id, bodyText };
