"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {galleryItems,ITEMS_SQL}=require('../services/shopGalleryV173');
const {createSingleAddressShopHandlers}=require('../services/singleAddressShopV172');
const response=()=>({code:200,status(n){this.code=n;return this;},set(){return this;},json(data){this.body=data;return this;}});
test('#171 gallery author is derived only from canonical barber row, not from caption or input',()=>{
 const rows=[{post_id:8,caption:'Yozuv: Muallif o‘zgartirildi',media_id:61,author_first_name:'Mansur',author_last_name:' Karimov',authorName:'Soxta',phone:'+998123456'}];
 const result=galleryItems(rows);
 assert.deepEqual(result,[{postId:8,caption:rows[0].caption,mediaUrl:'/api/media/61',authorName:'Mansur Karimov'}]);
 assert.equal(result[0].phone,undefined);
 assert.match(ITEMS_SQL,/JOIN barbers b ON b.id=p.barber_id/);
 assert.match(ITEMS_SQL,/b.first_name AS author_first_name/);
 assert.match(ITEMS_SQL,/p.barber_id=\$2/);
});
test('#171 missing author is not invented and no client-supplied authors are accepted',()=>{
 assert.deepEqual(galleryItems([{post_id:8,media_id:61,caption:'',author_first_name:'',author_last_name:null}]),[{postId:8,caption:'',mediaUrl:'/api/media/61'}]);
 assert.deepEqual(galleryItems([{post_id:9,media_id:62,author_first_name:'   M ',author_last_name:' S   '}])[0].authorName,'M S');
});
test('#171 public shop returns server-attributed portfolio author and still requires published approved owner',async()=>{
 const calls=[];
 const db={async query(sql,args){calls.push({sql,args});
  if(sql.includes('SELECT s.id,s.owner_barber_id'))return {rowCount:1,rows:[{id:18,owner_barber_id:7,name:'Shop',address:'Toshkent',description:''}]};
  if(sql.includes('shop_gallery_posts'))return {rowCount:1,rows:[{post_id:17,caption:'Fade',media_id:66,author_first_name:'Ali',author_last_name:'Valiyev'}]};
  throw Error('Unexpected query');}};
 const res=response();await createSingleAddressShopHandlers(db).byId({params:{id:'18'}},res);
 assert.equal(res.code,200);
 assert.deepEqual(res.body.gallery,[{postId:17,caption:'Fade',mediaUrl:'/api/media/66',authorName:'Ali Valiyev'}]);
 assert.match(calls[0].sql,/s.published=TRUE AND b.verification_status='approved'/);
 assert.deepEqual(calls[1].args,[18,7]);
 assert.equal(res.body.gallery[0].phone,undefined);
});
