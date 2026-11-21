// v172 #119/#120: one barber-owned, one-address shop profile. No tenant/team authorization.
const MAX_ID = Number.MAX_SAFE_INTEGER;
function positiveId(input) {
  if (!(typeof input === 'string' && /^[1-9][0-9]*$/.test(input)) && !Number.isSafeInteger(input)) return null;
  const n = Number(input);
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_ID ? n : null;
}
class ShopInputError extends Error {
  constructor(message, code='invalid_shop', status=400) { super(message); this.code=code; this.status=status; }
}
function plainText(value,label,max,min=0) {
  if (typeof value !== 'string') throw new ShopInputError(`${label} matn bo‘lishi kerak`);
  const text=value.trim().replace(/\s+/g,' ');
  if (text.length<min || text.length>max || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text))
    throw new ShopInputError(`${label} uzunligi noto‘g‘ri`);
  return text;
}
function normalizeShop(body) {
  if (!body || typeof body!=='object' || Array.isArray(body) ||
      Object.keys(body).some(k=>!['name','address','description','published','expectedRevision'].includes(k)) ||
      !['name','address','description','published','expectedRevision'].every(k=>Object.hasOwn(body,k)))
    throw new ShopInputError('Shop maydonlari noto‘g‘ri; verify/owner kabi maydonlarni yubormang');
  const expectedRevision=body.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision<0) throw new ShopInputError('revision noto‘g‘ri');
  if (typeof body.published!=='boolean') throw new ShopInputError('published boolean bo‘lishi kerak');
  return {name:plainText(body.name,'Nom',120,2),address:plainText(body.address,'Manzil',240,5),
    description:plainText(body.description,'Tavsif',1200),published:body.published,expectedRevision};
}
function publicShop(row) {
  if (!row) return null;
  return {id:row.id, ownerBarberId:row.owner_barber_id,name:row.name,
    address:row.address,description:row.description,updatedAt:row.updated_at,
    verified:false,staffCount:1};
}
function ownShop(row) {return row?{...publicShop(row),published:row.published,revision:row.revision}:null;}
function createSingleAddressShopHandlers(db) {
  const errorReply=(res,error)=>error instanceof ShopInputError
    ? res.status(error.status).json({code:error.code,message:error.message})
    : res.status(500).json({code:'shop_unavailable',message:'Shop ma’lumotlarini olishda xatolik'});
  const actor=(req)=>req.user?.role==='barber'&&positiveId(req.user.profileId)&&positiveId(req.user.accountId)
    ? {barberId:positiveId(req.user.profileId),accountId:positiveId(req.user.accountId)}:null;
  async function publicBy(where,id,res) {
    res.set('Cache-Control','no-store');
    if (!id) return res.status(400).json({code:'invalid_shop_id',message:'ID noto‘g‘ri'});
    try {
      const sql=`SELECT s.id,s.owner_barber_id,s.name,s.address,s.description,s.updated_at
       FROM barber_owned_shops s JOIN barbers b ON b.id=s.owner_barber_id
       JOIN users u ON u.id=b.user_id AND u.role='barber' AND u.deactivated_at IS NULL
       WHERE s.${where}=$1 AND s.published=TRUE AND b.verification_status='approved'`;
      const result=await db.query(sql,[id]);
      if(!result.rowCount)return res.status(404).json({code:'shop_not_found',message:'Shop topilmadi'});
      const row=result.rows[0];
      const {ITEMS_SQL,galleryItems}=require('./shopGalleryV173');
      const gallery=await db.query(ITEMS_SQL,[row.id,row.owner_barber_id]);
      return res.json({...publicShop(row),gallery:galleryItems(gallery.rows)});
    } catch(error) {return errorReply(res,error);}
  }
  return {
    async byId(req,res){return publicBy('id',positiveId(req.params.id),res);},
    async byBarber(req,res){return publicBy('owner_barber_id',positiveId(req.params.barberId),res);},
    async mine(req,res){
      const owner=actor(req);
      if (!owner) return res.status(403).json({code:'barber_required',message:'Faqat sartarosh'});
      res.set('Cache-Control','no-store');
      try {
        const result=await db.query(`SELECT s.* FROM barber_owned_shops s JOIN barbers b ON b.id=s.owner_barber_id
          WHERE s.owner_barber_id=$1 AND b.user_id=$2`,[owner.barberId,owner.accountId]);
        return res.json({shop:ownShop(result.rows[0])});
      } catch(error){return errorReply(res,error);}
    },
    async save(req,res){
      const owner=actor(req);
      if (!owner) return res.status(403).json({code:'barber_required',message:'Faqat sartarosh'});
      let input;
      try {input=normalizeShop(req.body);} catch(error){return errorReply(res,error);}
      let client; let commitStarted=false; let discardClient=false;
      try {
        client=await db.connect();
        await client.query('BEGIN');
        // Owner row serializes first creation and also checks live account ownership.
        const checked=await client.query(`SELECT b.id,b.verification_status FROM barbers b
          JOIN users u ON u.id=b.user_id AND u.role='barber'
          WHERE b.id=$1 AND b.user_id=$2 FOR UPDATE OF b`,[owner.barberId,owner.accountId]);
        if (!checked.rowCount) throw new ShopInputError('Sartarosh profili topilmadi','barber_not_found',404);
        if (input.published && checked.rows[0].verification_status!=='approved')
          throw new ShopInputError('Faqat tasdiqlangan sartarosh shop profilini e’lon qiladi','barber_not_approved',403);
        const existing=await client.query('SELECT id,revision FROM barber_owned_shops WHERE owner_barber_id=$1 FOR UPDATE',[owner.barberId]);
        const revision=existing.rows[0]?.revision||0;
        if (revision!==input.expectedRevision) throw new ShopInputError('Profil o‘zgargan. Sahifani yangilang.','shop_revision_conflict',409);
        const sql=existing.rowCount
          ? `UPDATE barber_owned_shops SET name=$2,address=$3,description=$4,published=$5,
               revision=revision+1,updated_at=clock_timestamp()
               WHERE owner_barber_id=$1 RETURNING *`
          : `INSERT INTO barber_owned_shops(owner_barber_id,name,address,description,published)
             VALUES($1,$2,$3,$4,$5) RETURNING *`;
        const result=await client.query(sql,[owner.barberId,input.name,input.address,input.description,input.published]);
        commitStarted=true;
        await client.query('COMMIT');
        return res.status(existing.rowCount?200:201).json({shop:ownShop(result.rows[0])});
      } catch(error) {
        discardClient=commitStarted;
        if(client && !commitStarted) try{await client.query('ROLLBACK');}catch{discardClient=true;}
        return errorReply(res,error);
      } finally {if(client) client.release(discardClient || undefined);}
    },
  };
}
module.exports={createSingleAddressShopHandlers,ShopInputError,normalizeShop,positiveId,publicShop};
