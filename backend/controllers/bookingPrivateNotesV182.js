'use strict';
// #179: PRIVATE notes belong only to the barber who currently owns the booking.
// They are never included in any general booking response, and never sent by Telegram.
const MAX_ID = 2147483647;
const NOTE_MAX = 500;
const validId = value => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= MAX_ID ? n : null;
};
const validOwner = user => user?.role === 'barber' && Number.isSafeInteger(user.profileId)
  && user.profileId > 0 && user.profileId <= MAX_ID;
const validRevision = n => Number.isInteger(n) && n >= 0 && n < MAX_ID;
const validText = text => typeof text === 'string' && text === text.trim()
  && Array.from(text).length >= 1 && Array.from(text).length <= NOTE_MAX
  && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text);
const safeResult = row => row ? {
  text: row.note, revision: Number(row.revision), expiresAt: new Date(row.expires_at).toISOString(),
} : { text: '', revision: 0, expiresAt: null };
function deny(req, res) {
  res.set?.('Cache-Control', 'no-store');
  res.set?.('X-Robots-Tag', 'noindex, nofollow');
  if (!validOwner(req.user)) { res.status(403).json({code:'forbidden',message:'Faqat bronning sartaroshi shaxsiy qaydni boshqaradi.'}); return true; }
  if (!validId(req.params?.id)) { res.status(400).json({code:'bad_booking_id',message:'Bron ID noto‘g‘ri.'}); return true; }
  return false;
}
function readHandler({query}) {
  return async (req,res) => {
    if (deny(req,res)) return;
    try {
      const found = await query(`SELECT b.id,n.note,n.revision,n.expires_at
        FROM bookings b LEFT JOIN booking_private_notes n
          ON n.booking_id=b.id AND n.barber_id=b.barber_id AND n.expires_at > clock_timestamp()
        WHERE b.id=$1 AND b.barber_id=$2`,[validId(req.params.id),req.user.profileId]);
      if (found.rowCount !== 1) return res.status(404).json({code:'not_found',message:'Bron topilmadi.'});
      return res.status(200).json(safeResult(found.rows[0].note == null ? null : found.rows[0]));
    } catch (error) {
      console.error('Private booking note read unavailable',{code:error.code || 'unavailable'});
      return res.status(503).json({code:'note_unavailable',message:'Qayd holatini olish imkoni bo‘lmadi.'});
    }
  };
}
function writeHandler({connect}, operation) {
  return async (req,res) => {
    if (deny(req,res)) return;
    const body=req.body;
    const required=operation === 'save' ? ['text','expectedRevision'] : ['expectedRevision'];
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== required.length || required.some(k=>!Object.hasOwn(body,k))
      || !validRevision(body.expectedRevision) || (operation==='save' && !validText(body.text)))
      return res.status(400).json({code:'invalid_note',message:'Qayd 1–500 belgi bo‘lishi va versiya aniq ko‘rsatilishi kerak.'});
    let client, commitStarted=false, broken=false;
    try {
      client=await connect();
      await client.query('BEGIN');
      const booking=(await client.query(`SELECT id,booking_time FROM bookings
        WHERE id=$1 AND barber_id=$2 FOR UPDATE`,[validId(req.params.id),req.user.profileId]));
      if (booking.rowCount!==1) {
        await client.query('ROLLBACK');
        return res.status(404).json({code:'not_found',message:'Bron topilmadi.'});
      }
      // Expired entries cannot be resurrected; delete before comparing revisions.
      await client.query(`DELETE FROM booking_private_notes WHERE booking_id=$1
        AND expires_at <= clock_timestamp()`,[validId(req.params.id)]);
      const found=await client.query(`SELECT note,revision,expires_at FROM booking_private_notes
        WHERE booking_id=$1 AND barber_id=$2 FOR UPDATE`,[validId(req.params.id),req.user.profileId]);
      const row=found.rows[0]||null;
      const currentRev=row ? Number(row.revision) : 0;
      if (currentRev !== body.expectedRevision) {
        await client.query('ROLLBACK');
        return res.status(409).json({code:'note_changed',message:'Qayd boshqa oynada o‘zgargan. Yangilang.'});
      }
      const deadline = await client.query(`SELECT ($1::timestamptz + INTERVAL '90 days' > clock_timestamp()) AS allowed`,[booking.rows[0].booking_time]);
      if (deadline.rows[0]?.allowed !== true) {
        await client.query('ROLLBACK');
        return res.status(409).json({code:'note_expired',message:'Ushbu bron uchun qayd saqlash muddati tugagan.'});
      }
      let next;
      if (operation==='delete') {
        if (row) await client.query(`DELETE FROM booking_private_notes WHERE booking_id=$1 AND barber_id=$2`,[validId(req.params.id),req.user.profileId]);
        next=safeResult(null);
      } else if (row) {
        if (currentRev >= MAX_ID - 1) throw Error('revision_limit');
        const changed=await client.query(`UPDATE booking_private_notes SET note=$3,revision=revision+1,updated_at=clock_timestamp()
          WHERE booking_id=$1 AND barber_id=$2 RETURNING note,revision,expires_at`,
          [validId(req.params.id),req.user.profileId,body.text]);
        if (changed.rowCount!==1) throw Error('note_write_missing');
        next=safeResult(changed.rows[0]);
      } else {
        const created=await client.query(`INSERT INTO booking_private_notes(booking_id,barber_id,note,expires_at)
          VALUES ($1,$2,$3,$4::timestamptz + INTERVAL '90 days') RETURNING note,revision,expires_at`,
          [validId(req.params.id),req.user.profileId,body.text,booking.rows[0].booking_time]);
        if (created.rowCount!==1) throw Error('note_insert_missing');
        next=safeResult(created.rows[0]);
      }
      commitStarted=true;
      await client.query('COMMIT');
      return res.status(200).json(next);
    } catch (error) {
      if (commitStarted) broken=true;
      if (client && !commitStarted) { try { await client.query('ROLLBACK'); } catch { broken=true; } }
      // Never log private text. Unknown commit result requires GET reconciliation.
      console.error('Private booking note write unavailable',{code:error.code || 'unavailable'});
      return res.status(503).json({code:'note_result_unknown',message:'Qayd holati noma’lum. Qayta yuborishdan avval qaydni yangilang.'});
    } finally { client?.release(broken); }
  };
}
module.exports={readHandler,saveHandler:deps=>writeHandler(deps,'save'),deleteHandler:deps=>writeHandler(deps,'delete'),validText,validId};
