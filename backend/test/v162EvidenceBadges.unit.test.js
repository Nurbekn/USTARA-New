const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandlers,changeInput,TYPES,idOf}=require('../controllers/barberEvidenceBadgesV162');
const ROOT=path.join(__dirname,'..');
function response(){return {statusCode:200,body:null,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(body){this.body=body;return this;}};}
function request({role='admin',params={},body={},id=19,query={}}={}){return {user:{role,id},params,body,query};}
function fakeBadgeDb({barberApproved=true,original=null,commitError=null,queryError=null}={}){
 const queries=[],releases=[];
 let badge=original?{...original}:null;
 const state={badge};
 const client={
  async query(sql,args){
   queries.push({sql,args});
   if(sql==='BEGIN'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))return {rows:[],rowCount:0};
   if(sql==='COMMIT'){if(commitError)throw commitError;return {rows:[],rowCount:0};}
   if(sql.startsWith('SELECT id,verification_status FROM barbers'))return {rowCount:barberApproved?1:0,rows:barberApproved?[{id:31,verification_status:'approved'}]:[]};
   if(sql.startsWith('SELECT state,revision FROM barber_evidence_badges'))return {rowCount:badge?1:0,rows:badge?[{...badge}]:[]};
   if(sql.includes('INSERT INTO barber_evidence_badges')){badge={state:args[2],revision:args[4]};state.badge=badge;return {rowCount:1,rows:[{...badge}]};}
   if(sql.includes('INSERT INTO barber_badge_audit_events'))return {rowCount:1,rows:[]};
   throw Error('Unexpected SQL: '+sql);
  },release(broken){releases.push(broken===true);},
 };
 return {state,queries,releases,db:{async connect(){return client;},async query(sql,args){queries.push({sql,args});if(queryError)throw queryError;
  if(sql.includes('SELECT b.id,COALESCE'))return {rowCount:barberApproved?1:0,rows:barberApproved?[{id:31,badges:['identity_checked']}]:[]};
  if(sql.includes('SELECT b.id,b.first_name'))return {rowCount:1,rows:[{id:31,first_name:'Test',last_name:'Barber',verification_status:'approved',badges:[]}]};
  throw Error('Unexpected read: '+sql);
 }}};
}
const goodBody=(action='grant',expected_revision=0)=>({action,evidence_note:'Admin tekshirgan shaxsga doir hujjat dalili.',expected_revision});
async function sendChange(db,{role='admin',barberId='31',badgeType=TYPES[0],body=goodBody(),id=19}={}){
 const r=response();await createHandlers(db).change(request({role,id,params:{barberId,badgeType},body}),r);return r;
}
test('evidence must be exact-shape, meaningful, control-free, and revisioned',()=>{
 assert.deepEqual(changeInput(goodBody()),{action:'grant',note:goodBody().evidence_note,expectedRevision:0});
 for(const input of [{...goodBody(),note:'x'},{...goodBody(),expected_revision:-1},{...goodBody(),expected_revision:'0'},
  {...goodBody(),action:'approved'},{...goodBody(),evidence_note:'x'.repeat(19)},
  {...goodBody(),evidence_note:'x'.repeat(501)},{...goodBody(),evidence_note:'x'.repeat(22)+'\nmore'},
  {...goodBody(),extra:'forged'}])assert.equal(changeInput(input),null);
 assert.equal(idOf('01'),null);assert.equal(idOf('0'),null);assert.equal(idOf('31'),31);
});
test('grant requires admin, known type, approved barber, expected revision',async()=>{
 for(const options of [{role:'customer'},{barberId:'01'},{badgeType:'vip'},{body:{...goodBody(),action:'other'}}]){
  const f=fakeBadgeDb();const r=await sendChange(f.db,options);
  assert.ok([400,403].includes(r.statusCode));assert.equal(f.queries.length,0);
 }
 const f=fakeBadgeDb({barberApproved:false});const r=await sendChange(f.db);
 assert.equal(r.statusCode,404);assert.ok(f.queries.some(q=>q.sql==='ROLLBACK'));
 assert.ok(!f.queries.some(q=>q.sql.includes('INSERT INTO barber_badge_audit_events')));
});
test('new grant atomically saves event, never uses a caller-supplied admin id',async()=>{
 const f=fakeBadgeDb();const r=await sendChange(f.db);
 assert.equal(r.statusCode,200);assert.deepEqual(r.body,{barberId:31,type:'identity_checked',state:'active',revision:1});
 const event=f.queries.find(q=>q.sql.includes('INSERT INTO barber_badge_audit_events'));
 assert.deepEqual(event.args,[31,'identity_checked','grant',goodBody().evidence_note,1,19]);
 assert.ok(f.queries.some(q=>q.sql==='COMMIT'));assert.deepEqual(f.releases,[false]);
 assert.ok(f.queries.find(q=>q.sql.includes('FOR UPDATE')));
});
test('stale badge, duplicate grant and missing revoke do not change history',async()=>{
 for(const [original,action,version] of [[{state:'active',revision:2},'grant',2],
  [{state:'revoked',revision:3},'revoke',3],[{state:'revoked',revision:3},'grant',2],[null,'revoke',0]]){
  const f=fakeBadgeDb({original});const r=await sendChange(f.db,{body:goodBody(action,version)});
  assert.equal(r.statusCode,409);assert.equal(f.queries.some(q=>q.sql.includes('INSERT INTO barber_badge_audit_events')),false);
  assert.ok(f.queries.some(q=>q.sql==='ROLLBACK'));
 }
});
test('revoke increments revision and audit; regrant from revoked status allowed',async()=>{
 for(const [oldState,action] of [['active','revoke'],['revoked','grant']]){
  const f=fakeBadgeDb({original:{state:oldState,revision:4}});
  const r=await sendChange(f.db,{body:goodBody(action,4)});
  assert.equal(r.statusCode,200);assert.equal(r.body.revision,5);
  assert.equal(f.queries.find(q=>q.sql.includes('INSERT INTO barber_badge_audit_events')).args[2],action);
 }
});
test('commit result uncertain never declares successful badge mutation or repeats it',async()=>{
 const f=fakeBadgeDb({commitError:Object.assign(new Error('broken socket'),{code:'08006'})});
 const r=await sendChange(f.db);assert.equal(r.statusCode,503);
 assert.equal(f.queries.filter(q=>q.sql==='COMMIT').length,1);
 assert.equal(f.queries.some(q=>q.sql==='ROLLBACK'),false);
 assert.deepEqual(f.releases,[true]);
});
test('public badge listing never exposes evidence or revoked badges',async()=>{
 const f=fakeBadgeDb();const r=response();await createHandlers(f.db).publicList(request({role:'customer',params:{id:'31'}}),r);
 assert.deepEqual(r.body,{barberId:31,badges:['identity_checked']});
 assert.ok(!JSON.stringify(r.body).includes('evidence'));
 assert.equal(r.headers['Cache-Control'],'no-store');
 const no=fakeBadgeDb({barberApproved:false}),notFound=response();
 await createHandlers(no.db).publicList(request({params:{id:'31'}}),notFound);
 assert.equal(notFound.statusCode,404);
});
test('admin paginated listing is private and refuses bad input',async()=>{
 const f=fakeBadgeDb(),handlers=createHandlers(f.db);
 let r=response();await handlers.list(request({role:'barber'}),r);assert.equal(r.statusCode,403);
 r=response();await handlers.list(request({query:{page:'101'}}),r);assert.equal(r.statusCode,400);
 r=response();await handlers.list(request({query:{page:'2'}}),r);assert.equal(r.statusCode,200);
 assert.deepEqual(r.body,{page:2,hasNext:false,barbers:[{id:31,first_name:'Test',last_name:'Barber',verification_status:'approved',badges:[]}]});
 assert.deepEqual(f.queries.at(-1).args,[50]);
});
test('new migration and forward-only bootstrap keep old schema files untouched',()=>{
 const filename='20261220_barber_evidence_badges.sql';
 const sql=fs.readFileSync(path.join(ROOT,'database/migrations',filename),'utf8');
 const boot=fs.readFileSync(path.join(ROOT,'database/bootstrap.sql'),'utf8');
 const verify=fs.readFileSync(path.join(ROOT,'database/bootstrap/verify.sql'),'utf8');
 assert.ok(boot.indexOf('20261219_customer_barber_chat.sql')<boot.indexOf(filename));
 assert.match(sql,/CREATE TABLE barber_badge_audit_events/);
 assert.match(sql,/CREATE TABLE barber_evidence_badges/);
 assert.match(sql,/UNIQUE\(barber_id,badge_type,revision\)/);
 assert.match(verify,/20261220_barber_evidence_badges/);
});
