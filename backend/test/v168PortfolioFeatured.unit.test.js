'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandlers,safeId}=require('../controllers/portfolioFeaturedV168');
function setup({role='barber', userId=77, owner=true, featured=false, count=0, fail=null}={}) {
 const state={featured,count,commits:0,rollbacks:0,updated:0,released:[],queries:[]};
 const client={async query(sql,params){state.queries.push({sql,params});
   if(fail && sql.includes(fail))throw Error('DB unavailable');
   if(sql==='ROLLBACK'){state.rollbacks++;return {rowCount:0,rows:[]};}
   if(sql==='COMMIT'){state.commits++;return {rowCount:0,rows:[]};}
   if(sql.includes('FROM barbers b JOIN social_posts'))return owner?{rowCount:1,rows:[{barber_id:9}]}:{rowCount:0,rows:[]};
   if(sql.startsWith('SELECT featured_at'))return {rowCount:1,rows:[{featured_at:state.featured?'2026-11-21T00:00:00Z':null}]};
   if(sql.includes('count(*)::integer'))return {rowCount:1,rows:[{n:state.count}]};
   if(sql.startsWith('UPDATE social_posts')){state.featured=params[1];state.updated++;return {rowCount:1,rows:[]};}
   return {rowCount:0,rows:[]};
  },release:(destroy)=>state.released.push(destroy)};
 const req={params:{id:'33'},body:{featured:true},user:{role,accountId:userId}};
 const res={statusCode:200,headers:{},payload:null,status(n){this.statusCode=n;return this;},json(o){this.payload=o;return this;},set(k,v){this.headers[k]=v;return this;}};
 return {state,req,res,run:()=>createHandlers({connect:async()=>client}).setFeatured(req,res)};
}
test('#91 only authenticated barber with valid input can manage featured work',async()=>{
 assert.equal(safeId('0002'),null);assert.equal(safeId('1'),1);assert.equal(safeId('9007199254740992'),null);
 const deny=setup({role:'customer'});await deny.run();assert.equal(deny.res.statusCode,403);assert.equal(deny.state.queries.length,0);
 const invalid=setup();invalid.req.body={featured:'true'};await invalid.run();assert.equal(invalid.res.statusCode,400);
 const foreign=setup({owner:false});await foreign.run();assert.equal(foreign.res.statusCode,404);assert.equal(foreign.state.commits,0);
 assert.equal(foreign.state.rollbacks,1);
});
test('#91 six-feature cap enforced inside one barber-row lock transaction',async()=>{
 const f=setup({count:6});await f.run();assert.equal(f.res.statusCode,409);
 assert.equal(f.res.payload.code,'featured_limit');assert.equal(f.state.updated,0);
 assert.equal(f.state.commits,0);assert.equal(f.state.rollbacks,1);
 assert.match(f.state.queries.find(q=>q.sql.includes('FROM barbers b JOIN social_posts')).sql,/FOR UPDATE OF b/);
 assert.deepEqual(f.state.queries.find(q=>q.sql.includes('count(*)::integer')).params,[9]);
});
test('#91 pin/unpin commits and idempotent retries never consume extra slots',async()=>{
 const pin=setup({count:5});await pin.run();assert.equal(pin.res.statusCode,200);
 assert.equal(pin.state.commits,1);assert.equal(pin.state.updated,1);assert.deepEqual(pin.res.payload,{postId:33,featured:true});
 const again=setup({count:6,featured:true});await again.run();assert.equal(again.res.statusCode,200);
 assert.equal(again.state.updated,0);assert.equal(again.state.queries.some(q=>q.sql.includes('count(*)::integer')),false);
 const remove=setup({count:6,featured:true});remove.req.body.featured=false;await remove.run();
 assert.equal(remove.res.statusCode,200);assert.equal(remove.state.updated,1);assert.equal(remove.state.featured,false);
});
test('#91 unavailable DB or uncertain COMMIT must never imply success',async()=>{
 const failure=setup({fail:'SELECT featured_at'});await failure.run();assert.equal(failure.res.statusCode,503);
 assert.equal(failure.state.rollbacks,1);assert.equal(failure.state.commits,0);
 const uncertain=setup({fail:'COMMIT'});await uncertain.run();assert.equal(uncertain.res.statusCode,503);
 assert.deepEqual(uncertain.state.released,[true]);assert.equal(uncertain.state.rollbacks,0);
});
test('#91 API, ordering, database migration and UI source are connected',()=>{
 const root=path.resolve(__dirname,'..');
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');
 assert.match(read('routes/social.js'),/\/posts\/:id\/featured/);
 assert.match(read('controllers/socialController.js'),/p\.featured_at DESC NULLS LAST/);
 assert.match(read('controllers/socialController.js'),/featured: row\.featured_at != null/);
 assert.match(read('../frontend/src/pages/barber/Portfolio.jsx'),/setPortfolioFeatured\(viewing/);
 assert.match(read('../frontend/src/pages/user/barber/BarberPublicProfile.jsx'),/item\.featured === true/);
 const migration=read('database/migrations/20261222_portfolio_featured_posts.sql');
 assert.match(migration,/ALTER TABLE social_posts ADD COLUMN featured_at TIMESTAMPTZ/);
 assert.match(read('database/bootstrap.sql'),/20261222_portfolio_featured_posts/);
 assert.match(read('database/bootstrap/verify.sql'),/social_posts_featured_v168_idx/);
});
