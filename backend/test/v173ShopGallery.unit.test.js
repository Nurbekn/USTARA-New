const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createShopGalleryHandlers,validateGallery,galleryItems}=require('../services/shopGalleryV173');
const {createSingleAddressShopHandlers}=require('../services/singleAddressShopV172');
const actor={user:{role:'barber',profileId:5,accountId:25}};
const reply=()=>({statusCode:200,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(body){this.body=body;return this;}});
function fixture({owner=true,shop=true,revision=4,existingPosts=[11,12],commitError=false,queryError=false}={}){
 const state={queries:[],released:[],writes:0};
 const query=async(sql,args=[])=>{
  state.queries.push({sql,args});
  if(queryError)throw Error('db offline');
  if(sql==='COMMIT'&&commitError)throw Error('unknown commit acknowledgement');
  if(sql.includes('SELECT b.id FROM barbers b JOIN users'))return owner?{rowCount:1,rows:[{id:5}]}:{rowCount:0,rows:[]};
  if(sql.includes('SELECT id,revision FROM barber_owned_shops'))return shop?{rowCount:1,rows:[{id:9,revision}]}:{rowCount:0,rows:[]};
  if(sql.includes('SELECT s.id,s.revision FROM barber_owned_shops'))return shop&&owner?{rowCount:1,rows:[{id:9,revision}]}:{rowCount:0,rows:[]};
  if(sql.includes('FROM social_posts p')&&sql.includes('FOR KEY SHARE')){
   const ids=args[1].filter(id=>existingPosts.includes(id));return {rowCount:ids.length,rows:ids.map(id=>({id}))};
  }
  if(sql.startsWith('UPDATE barber_owned_shops')){state.writes++;return {rowCount:1,rows:[{revision:revision+1}]};}
  if(sql.startsWith('DELETE FROM shop_gallery_posts')||sql.startsWith('INSERT INTO shop_gallery_posts')){state.writes++;return {rowCount:1,rows:[]};}
  if(sql.includes('SELECT p.id AS post_id'))return {rowCount:1,rows:[{post_id:11,caption:'Kesim',media_id:20}]};
  return {rowCount:0,rows:[]};
 };
 const db={query,async connect(){return {query,release(discard){state.released.push(Boolean(discard));}}}};
 return {handlers:createShopGalleryHandlers(db),publicHandlers:createSingleAddressShopHandlers(db),state};
}
test('#124 gallery input strict: max 8, unique safe ids, expectedRevision, reject privilege fields',()=>{
 assert.deepEqual(validateGallery({postIds:[11,12],expectedRevision:4}),{postIds:[11,12],expectedRevision:4});
 for(const b of [{postIds:[1,1],expectedRevision:4},{postIds:Array.from({length:9},(_,i)=>i+1),expectedRevision:4},
  {postIds:[-1],expectedRevision:4},{postIds:['01'],expectedRevision:4},{postIds:[11.1],expectedRevision:4},
  {postIds:[],expectedRevision:0},{postIds:[],expectedRevision:4,ownerId:100},
  {postIds:[],expectedRevision:4,verified:true},null,[]])assert.throws(()=>validateGallery(b));
});
test('#124 gallery mutation denies customers and mismatched identity without DB calls',async()=>{
 const f=fixture();const r=reply();await f.handlers.save({user:{role:'customer',profileId:5,accountId:25},body:{postIds:[11],expectedRevision:4}},r);
 assert.equal(r.statusCode,403);assert.equal(f.state.queries.length,0);
 const g=fixture({owner:false}),a=reply();await g.handlers.save({...actor,body:{postIds:[11],expectedRevision:4}},a);
 assert.equal(a.statusCode,404);assert.ok(g.state.queries.some(v=>v.sql==='ROLLBACK'));
});
test('#124 stale revision blocked before any gallery changes',async()=>{
 const f=fixture(),r=reply();await f.handlers.save({...actor,body:{postIds:[11],expectedRevision:3}},r);
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'shop_revision_conflict');assert.equal(f.state.writes,0);
});
test('#124 cannot attach another barber post even with forged ID',async()=>{
 const f=fixture(),r=reply();await f.handlers.save({...actor,body:{postIds:[11,999],expectedRevision:4}},r);
 assert.equal(r.statusCode,400);assert.equal(r.body.code,'invalid_gallery_post');assert.equal(f.state.writes,0);
 const query=f.state.queries.find(q=>q.sql.includes('FOR KEY SHARE'));
 assert.match(query.sql,/p.barber_id=\$1/);assert.match(query.sql,/m.content_type IN/);
});
test('#124 shop missing cannot create gallery automatically',async()=>{
 const f=fixture({shop:false}),r=reply();await f.handlers.save({...actor,body:{postIds:[],expectedRevision:4}},r);
 assert.equal(r.statusCode,404);assert.equal(f.state.writes,0);
});
test('#124 atomically replaces selection and increments shop revision',async()=>{
 const f=fixture(),r=reply();await f.handlers.save({...actor,body:{postIds:[12,11],expectedRevision:4}},r);
 assert.equal(r.statusCode,200);assert.deepEqual(r.body,{revision:5,postIds:[12,11]});
 assert.equal(f.state.writes,3);assert.equal(f.state.released.length,1);assert.equal(f.state.released[0],false);
 assert.ok(f.state.queries.find(q=>q.sql.includes('WITH ORDINALITY')&&JSON.stringify(q.args[1])==='[12,11]'));
 const empty=fixture(),a=reply();await empty.handlers.save({...actor,body:{postIds:[],expectedRevision:4}},a);
 assert.equal(a.statusCode,200);assert.equal(empty.state.writes,2);
});
test('#124 unknown COMMIT does not fake success, connection discarded',async()=>{
 const f=fixture({commitError:true}),r=reply();await f.handlers.save({...actor,body:{postIds:[11],expectedRevision:4}},r);
 assert.equal(r.statusCode,500);assert.equal(r.body.code,'gallery_unavailable');assert.deepEqual(f.state.released,[true]);
});
test('#124 owner-only gallery options filter to own image posts, no user contact data',async()=>{
 const f=fixture(),r=reply();await f.handlers.mine(actor,r);
 assert.equal(r.statusCode,200);assert.deepEqual(r.body.selected,[{postId:11,caption:'Kesim',mediaUrl:'/api/media/20'}]);
 assert.equal(r.body.revision,4);assert.equal(r.body.phone,undefined);
 assert.ok(f.state.queries.find(q=>q.sql.includes('p.barber_id=$1 AND m.content_type IN')));
 assert.equal(r.headers['Cache-Control'],'no-store');
 const outsider=fixture({owner:false}),b=reply();await outsider.handlers.mine(actor,b);assert.equal(b.statusCode,404);
});
test('#124 public shop only reveals gallery after existing approval/publish guard',async()=>{
 let calls=[];
 const db={async query(sql,args){calls.push({sql,args});
  if(sql.includes('SELECT s.id,s.owner_barber_id'))return {rowCount:1,rows:[{id:9,owner_barber_id:5,name:'Shop',address:'Toshkent 11',description:''}]};
  if(sql.includes('shop_gallery_posts'))return {rowCount:1,rows:[{post_id:11,caption:'Ish',media_id:20}]};
  return {rowCount:0,rows:[]};}};
 const r=reply();await createSingleAddressShopHandlers(db).byId({params:{id:'9'}},r);
 assert.equal(r.statusCode,200);assert.equal(r.body.gallery.length,1);
 assert.match(calls[0].sql,/s.published=TRUE AND b.verification_status='approved'/);
 assert.deepEqual(calls[1].args,[9,5]);
});
test('#124 migration has FK cascades, ordered unique slots, bootstrap and routes',()=>{
 const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const sql=read('database/migrations/20261227_shop_gallery_posts.sql');
 assert.match(sql,/REFERENCES barber_owned_shops\(id\) ON DELETE CASCADE/);
 assert.match(sql,/REFERENCES social_posts\(id\) ON DELETE CASCADE/);
 assert.match(sql,/UNIQUE\(shop_id,position\)/);assert.match(sql,/position BETWEEN 1 AND 8/);
 assert.match(read('database/bootstrap.sql'),/20261227_shop_gallery_posts/);
 assert.match(read('database/bootstrap/verify.sql'),/shop_gallery_posts/);
 assert.match(read('routes/shops.js'),/routes.put\('\/mine\/gallery',auth,gallery.save\)/);
});
