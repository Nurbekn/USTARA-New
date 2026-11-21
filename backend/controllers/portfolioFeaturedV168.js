'use strict';
// #91: limited highlighted portfolio work. A barber row lock serializes
// writes to DIFFERENT posts owned by the same barber, preserving the six cap.
function safeId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id=Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
function createHandlers(db) {
  async function setFeatured(req,res) {
    const userId=req.user?.accountId, postId=safeId(req.params.id);
    if(req.user?.role!=='barber' || !Number.isSafeInteger(userId) || userId<1)
      return res.status(403).json({message:'Faqat sartarosh o‘z portfolioni boshqarishi mumkin.'});
    if(!postId || !req.body || typeof req.body.featured!=='boolean' ||
       Object.keys(req.body).length!==1)
      return res.status(400).json({message:'Belgilash ma’lumotlari noto‘g‘ri.'});
    let client,commitAttempted=false,released=false;
    try {
      client=await db.connect();
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      // Lock the barber (not just the post): two parallel pins cannot both
      // observe 5/6 and write a seventh featured post.
      const owner=await client.query(
        `SELECT b.id AS barber_id FROM barbers b JOIN social_posts p ON p.barber_id=b.id
         WHERE p.id=$1 AND b.user_id=$2 AND b.verification_status='approved'
         FOR UPDATE OF b`,[postId,userId]);
      if(!owner.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({message:'Post topilmadi yoki sizga tegishli emas.'});
      }
      const barberId=owner.rows[0].barber_id;
      const current=await client.query('SELECT featured_at FROM social_posts WHERE id=$1 AND barber_id=$2',[postId,barberId]);
      if(!current.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({message:'Post topilmadi.'});
      }
      const wasFeatured=current.rows[0].featured_at!==null;
      if(req.body.featured && !wasFeatured) {
        const count=await client.query(
          'SELECT count(*)::integer AS n FROM social_posts WHERE barber_id=$1 AND featured_at IS NOT NULL',[barberId]);
        if(Number(count.rows[0].n)>=6) {
          await client.query('ROLLBACK');
          return res.status(409).json({code:'featured_limit',message:'Avval 6 ta belgilangan ishning bittasini olib tashlang.'});
        }
      }
      if(wasFeatured!==req.body.featured) {
        await client.query(
          'UPDATE social_posts SET featured_at=CASE WHEN $2::boolean THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND barber_id=$3',
          [postId,req.body.featured,barberId]);
      }
      commitAttempted=true;
      await client.query('COMMIT');
      res.set('Cache-Control','no-store');
      return res.json({postId,featured:req.body.featured});
    } catch(error) {
      if(client && !commitAttempted) {try {await client.query('ROLLBACK');}catch { /* DB unavailable */ }}
      if(client && commitAttempted) {client.release(true);released=true;}
      return res.status(503).json({message:'O‘zgarish tasdiqlanmadi. Profilni yangilab tekshiring.'});
    } finally { if(client && !released) client.release(); }
  }
  return {setFeatured};
}
module.exports={createHandlers,safeId};
