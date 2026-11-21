// v173 #124: curate existing owner-authored image posts; no new uploads or external URLs.
const {positiveId,ShopInputError}=require('./singleAddressShopV172');
const MAX_POSTS=8;
function validateGallery(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['postIds','expectedRevision'].includes(k))||
  !Object.hasOwn(body,'postIds')||!Object.hasOwn(body,'expectedRevision'))
  throw new ShopInputError('Galereya maydonlari noto‘g‘ri','invalid_gallery');
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)
  throw new ShopInputError('Shop revision noto‘g‘ri','invalid_gallery');
 if(!Array.isArray(body.postIds)||body.postIds.length>MAX_POSTS)
  throw new ShopInputError('8 tadan ortiq rasmli post belgilanmaydi','invalid_gallery');
 const ids=body.postIds.map(positiveId);
 if(ids.some(id=>id===null)||new Set(ids).size!==ids.length)
  throw new ShopInputError('Post ID takrorlangan yoki noto‘g‘ri','invalid_gallery');
 return {postIds:ids,expectedRevision:body.expectedRevision};
}
// #171: author credit is read from the same canonical barber row that owns the post.
// Never accept an author name or author ID supplied by the editor/client.
function galleryItems(rows){return rows.map(r=>{
  const authorName=[r.author_first_name,r.author_last_name]
    .filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()).join(' ').slice(0,140);
  return {postId:Number(r.post_id??r.id),caption:r.caption||'',
    mediaUrl:`/api/media/${r.media_id}`,...(authorName?{authorName}:{})};
});}

const ITEMS_SQL=`SELECT p.id AS post_id,p.caption,p.media_ids[1] AS media_id,
 b.first_name AS author_first_name,b.last_name AS author_last_name
 FROM shop_gallery_posts g JOIN social_posts p ON p.id=g.post_id
 JOIN barbers b ON b.id=p.barber_id
 JOIN ustara_media m ON m.id=p.media_ids[1]
 WHERE g.shop_id=$1 AND p.barber_id=$2 AND m.content_type IN ('image/jpeg','image/png','image/webp')
 ORDER BY g.position ASC`;
function createShopGalleryHandlers(db){
 const actor=req=>req.user?.role==='barber'&&positiveId(req.user.profileId)&&positiveId(req.user.accountId)
  ?{barberId:positiveId(req.user.profileId),accountId:positiveId(req.user.accountId)}:null;
 const failure=(res,e)=>e instanceof ShopInputError
  ?res.status(e.status).json({code:e.code,message:e.message})
  :res.status(500).json({code:'gallery_unavailable',message:'Galereya hozircha mavjud emas'});
 async function ownerShop(barberId,accountId){
  const result=await db.query(`SELECT s.id,s.revision FROM barber_owned_shops s
   JOIN barbers b ON b.id=s.owner_barber_id JOIN users u ON u.id=b.user_id
   WHERE b.id=$1 AND b.user_id=$2 AND u.role='barber' AND u.deactivated_at IS NULL`,[barberId,accountId]);
  return result.rows[0]||null;
 }
 return {
  async mine(req,res){
   const owner=actor(req);if(!owner)return res.status(403).json({code:'barber_required'});
   res.set('Cache-Control','no-store');
   try{
    const shop=await ownerShop(owner.barberId,owner.accountId);
    if(!shop)return res.status(404).json({code:'shop_not_found'});
    const [selected,available]=await Promise.all([
     db.query(ITEMS_SQL,[shop.id,owner.barberId]),
     db.query(`SELECT p.id AS post_id,p.caption,p.media_ids[1] AS media_id
      FROM social_posts p JOIN ustara_media m ON m.id=p.media_ids[1]
      WHERE p.barber_id=$1 AND m.content_type IN ('image/jpeg','image/png','image/webp')
       AND (p.id IN (SELECT post_id FROM shop_gallery_posts WHERE shop_id=$2)
         OR p.id IN (SELECT id FROM social_posts WHERE barber_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100))
      ORDER BY p.created_at DESC,p.id DESC LIMIT 108`,[owner.barberId,shop.id])
    ]);
    return res.json({revision:shop.revision,selected:galleryItems(selected.rows),available:galleryItems(available.rows)});
   }catch(e){return failure(res,e);}
  },
  async save(req,res){
   const owner=actor(req);if(!owner)return res.status(403).json({code:'barber_required'});
   let input;try{input=validateGallery(req.body);}catch(e){return failure(res,e);}
   res.set('Cache-Control','no-store');
   let client;let commitStarted=false;let discard=false;
   try{
    client=await db.connect();await client.query('BEGIN');
    const b=await client.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
      WHERE b.id=$1 AND b.user_id=$2 AND u.role='barber' AND u.deactivated_at IS NULL
      FOR UPDATE OF b`,[owner.barberId,owner.accountId]);
    if(!b.rowCount)throw new ShopInputError('Sartarosh profili topilmadi','barber_not_found',404);
    const sr=await client.query('SELECT id,revision FROM barber_owned_shops WHERE owner_barber_id=$1 FOR UPDATE',[owner.barberId]);
    if(!sr.rowCount)throw new ShopInputError('Avval shop yarating','shop_not_found',404);
    const shop=sr.rows[0];
    if(shop.revision!==input.expectedRevision)throw new ShopInputError('Shop o‘zgargan, sahifani yangilang','shop_revision_conflict',409);
    if(input.postIds.length){
     const owned=await client.query(`SELECT p.id FROM social_posts p
      JOIN ustara_media m ON m.id=p.media_ids[1]
      WHERE p.barber_id=$1 AND p.id=ANY($2::bigint[])
       AND m.content_type IN ('image/jpeg','image/png','image/webp')
      FOR KEY SHARE OF p`,[owner.barberId,input.postIds]);
     if(owned.rowCount!==input.postIds.length)throw new ShopInputError('Faqat o‘z rasmli postlaringizni tanlang','invalid_gallery_post');
    }
    await client.query('DELETE FROM shop_gallery_posts WHERE shop_id=$1',[shop.id]);
    if(input.postIds.length)await client.query(`INSERT INTO shop_gallery_posts(shop_id,post_id,position)
      SELECT $1,id,ord::smallint FROM unnest($2::bigint[]) WITH ORDINALITY AS t(id,ord)`,[shop.id,input.postIds]);
    const revision=await client.query(`UPDATE barber_owned_shops SET revision=revision+1,updated_at=clock_timestamp()
      WHERE id=$1 RETURNING revision`,[shop.id]);
    commitStarted=true;await client.query('COMMIT');
    return res.json({revision:revision.rows[0].revision,postIds:input.postIds});
   }catch(e){discard=commitStarted;if(client&&!commitStarted)try{await client.query('ROLLBACK');}catch{discard=true;}return failure(res,e);}
   finally{if(client)client.release(discard||undefined);}
  },
 };
}
module.exports={createShopGalleryHandlers,validateGallery,galleryItems,ITEMS_SQL,MAX_POSTS};
