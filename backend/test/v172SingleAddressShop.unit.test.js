const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createSingleAddressShopHandlers,normalizeShop,positiveId}=require('../services/singleAddressShopV172');
function response(){return {statusCode:200,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(value){this.body=value;return this;}};}
const owner={user:{role:'barber',profileId:5,accountId:25}};
const body={name:'Birinchi shop',address:'Toshkent, 7-uy',description:'Oddiy tavsif',published:true,expectedRevision:0};
function harness({verified='approved',existing=null,readShop=null,writeError=null}={}){
 let calls=[];let released=0;let shop=existing;
 const query=async(sql,values=[])=>{calls.push([sql,values]);
  if (sql.includes('SELECT b.id,b.verification_status'))return {rowCount:verified==='missing'?0:1,rows:[{id:5,verification_status:verified}]};
  if (sql.includes('SELECT id,revision FROM barber_owned_shops'))return {rowCount:shop?1:0,rows:shop?[shop]:[]};
  if (sql.includes('INSERT INTO barber_owned_shops')||sql.includes('UPDATE barber_owned_shops')){
   if(writeError)throw writeError;
   shop={id:11,owner_barber_id:5,revision:(shop?.revision||0)+1,
    name:values[1],address:values[2],description:values[3],published:values[4],updated_at:'2026-11-21T00:00:00Z'};
   return {rowCount:1,rows:[shop]};
  }
  if(sql.includes('SELECT s.* FROM barber_owned_shops'))return {rowCount:shop?1:0,rows:shop?[shop]:[]};
  if(sql.includes('SELECT s.id,s.owner_barber_id'))return {rowCount:readShop?1:0,rows:readShop?[readShop]:[]};
  return {rowCount:0,rows:[]};
 };
 const db={query,async connect(){return {query,release(){released++;}}}};
 return {handlers:createSingleAddressShopHandlers(db),calls,getReleased:()=>released};
}
test('#119 input: allowed fields, single address and optimistic revision are enforced',()=>{
 assert.deepEqual(Object.keys(normalizeShop(body)),['name','address','description','published','expectedRevision']);
 for(const extra of [{verified:true},{ownerId:5},{teamMembers:[5]}])assert.throws(()=>normalizeShop({...body,...extra}),/Shop maydonlari/);
 for(const entry of [{...body,address:' '},{...body,expectedRevision:'0'},{...body,published:'true'},{...body,name:'X'},null])assert.throws(()=>normalizeShop(entry));
 assert.equal(positiveId('05'),null);assert.equal(positiveId('-7'),null);assert.equal(positiveId('5'),5);
});
test('#120 public view: only approved, published shop projection and no personal details',async()=>{
 const row={id:11,owner_barber_id:5,name:'Shop',address:'Toshkent 11',description:'',updated_at:'x',phone:'+99890',published:true};
 const h=harness({readShop:row});const r=response();await h.handlers.byId({params:{id:'11'}},r);
 assert.equal(r.statusCode,200);assert.equal(r.body.ownerBarberId,5);assert.equal(r.body.phone,undefined);
 assert.equal(r.body.verified,false);assert.equal(r.headers['Cache-Control'],'no-store');
 assert.match(h.calls[0][0],/s\.published=TRUE AND b\.verification_status='approved'/);
 assert.match(h.calls[0][0],/u\.deactivated_at IS NULL/);
 const missing=harness();const mr=response();await missing.handlers.byBarber({params:{barberId:'5'}},mr);assert.equal(mr.statusCode,404);
});
test('#119 write: session role, account and profile must match; only approved can publish',async()=>{
 const h=harness({verified:'pending'});
 let r=response();await h.handlers.save({user:{role:'customer',profileId:5,accountId:25},body},r);assert.equal(r.statusCode,403);assert.equal(h.calls.length,0);
 r=response();await h.handlers.save({...owner,body},r);assert.equal(r.statusCode,403);assert.equal(r.body.code,'barber_not_approved');
 assert.ok(h.calls.some(([sql])=>sql==='ROLLBACK'));assert.equal(h.getReleased(),1);
 const d=harness({verified:'pending'}),dr=response();await d.handlers.save({...owner,body:{...body,published:false}},dr);
 assert.equal(dr.statusCode,201);assert.equal(dr.body.shop.published,false);assert.equal(dr.body.shop.verified,false);
 assert.ok(d.calls.some(([sql])=>sql.includes('AND b.user_id=$2 FOR UPDATE OF b')));
});
test('#120 write: owner creates and updates, stale edit is rejected, no duplicate insert',async()=>{
 const h=harness();const first=response();await h.handlers.save({...owner,body},first);assert.equal(first.statusCode,201);
 assert.equal(first.body.shop.revision,1);assert.equal(first.body.shop.id,11);
 const second=response();await h.handlers.save({...owner,body:{...body,name:'Yangi',expectedRevision:1}},second);
 assert.equal(second.statusCode,200);assert.equal(second.body.shop.revision,2);
 const stale=response();await h.handlers.save({...owner,body:{...body,expectedRevision:1}},stale);
 assert.equal(stale.statusCode,409);assert.equal(stale.body.code,'shop_revision_conflict');
 assert.equal(h.calls.filter(([s])=>s.includes('INSERT INTO barber_owned_shops')).length,1);
 assert.equal(h.getReleased(),3);
});
test('#120 uncertainty: database write failure does not claim successful publication',async()=>{
 const h=harness({writeError:Error('PG connection lost')});const r=response();await h.handlers.save({...owner,body},r);
 assert.equal(r.statusCode,500);assert.equal(r.body.code,'shop_unavailable');
 assert.ok(h.calls.some(([s])=>s==='ROLLBACK'));assert.equal(h.getReleased(),1);
});
test('#120 uncertain commit discards database connection and never reports published',async()=>{
 let released=null;
 const db={async connect(){return {async query(sql){
  if(sql.includes('SELECT b.id,b.verification_status'))return {rowCount:1,rows:[{id:5,verification_status:'approved'}]};
  if(sql.includes('SELECT id,revision'))return {rowCount:0,rows:[]};
  if(sql.includes('INSERT INTO'))return {rowCount:1,rows:[{id:11,owner_barber_id:5,revision:1,published:true,name:'Shop',address:'Toshkent',description:''}]};
  if(sql==='COMMIT')throw Error('commit acknowledgement lost');
  return {rowCount:0,rows:[]};
 },release(value){released=value;}};}};
 const r=response();await createSingleAddressShopHandlers(db).save({...owner,body},r);
 assert.equal(r.statusCode,500);assert.equal(r.body.code,'shop_unavailable');assert.equal(released,true);
});
test('#119/#120 migration and public route include authorization and chain',()=>{
 const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const sql=read('database/migrations/20261226_single_address_barber_shops.sql');
 assert.match(sql,/owner_barber_id INTEGER NOT NULL UNIQUE REFERENCES barbers\(id\) ON DELETE CASCADE/);
 assert.match(sql,/address VARCHAR\(240\) NOT NULL/);assert.match(sql,/ustara_schema_migrations/);
 assert.match(read('database/bootstrap.sql'),/20261226_single_address_barber_shops/);
 assert.match(read('database/bootstrap/verify.sql'),/barber_owned_shops/);
 const routes=read('routes/shops.js');assert.match(routes,/routes\.put\('\/mine',auth,handlers\.save\)/);
 assert.match(read('server.js'),/app\.use\("\/api\/shops"/);
});
