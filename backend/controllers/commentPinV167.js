'use strict';
// #82: one pinned comment per post. The server verifies ownership via users.id,
// never from a caller-supplied barberId. All mutations are serialized by post row.
function safeId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function createHandlers(db) {
  async function setPin(req, res) {
    const userId = req.user?.accountId;
    if (req.user?.role !== 'barber' || !Number.isSafeInteger(userId) || userId < 1) {
      return res.status(403).json({message:'Pin qilish faqat post egasiga ruxsat etiladi.'});
    }
    const postId = safeId(req.params.id), commentId = safeId(req.params.commentId);
    if (!postId || !commentId || typeof req.body?.pinned !== 'boolean'
        || Object.keys(req.body).length !== 1) {
      return res.status(400).json({message:'Pin so‘rovi noto‘g‘ri.'});
    }
    let client, commitAttempted = false, released = false;
    try {
      client = await db.connect();
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      const ownPost = await client.query(
        `SELECT p.id FROM social_posts p JOIN barbers b ON b.id=p.barber_id
         WHERE p.id=$1 AND b.user_id=$2 AND b.verification_status='approved'
         FOR UPDATE OF p FOR SHARE OF b`, [postId,userId]);
      if (!ownPost.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({message:'Post topilmadi yoki sizga tegishli emas.'});
      }
      const current = await client.query(
        'SELECT id,pinned FROM social_comments WHERE id=$1 AND post_id=$2', [commentId,postId]);
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({message:'Izoh topilmadi.'});
      }
      if (req.body.pinned) {
        await client.query('UPDATE social_comments SET pinned=FALSE WHERE post_id=$1 AND pinned=TRUE', [postId]);
        await client.query('UPDATE social_comments SET pinned=TRUE WHERE post_id=$1 AND id=$2', [postId,commentId]);
      } else if (current.rows[0].pinned === true) {
        await client.query('UPDATE social_comments SET pinned=FALSE WHERE post_id=$1 AND id=$2', [postId,commentId]);
      }
      commitAttempted = true;
      await client.query('COMMIT');
      res.set('Cache-Control','no-store');
      return res.json({postId,commentId,pinned:req.body.pinned});
    } catch (error) {
      if (client && !commitAttempted) { try { await client.query('ROLLBACK'); } catch { /* connection may be broken */ } }
      if (client && commitAttempted) { client.release(true); released=true; }
      return res.status(503).json({message:'Izoh holati tasdiqlanmadi. Yangilab tekshiring.'});
    } finally {
      if (client && !released) client.release();
    }
  }
  return {setPin};
}
module.exports = {createHandlers,safeId};
