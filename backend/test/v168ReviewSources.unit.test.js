'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('#89 existing review source checks only completed bookings and rating 1..5 (not structured review)',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../controllers/reviewsController.js'),'utf8');
 assert.match(source,/rating < 1 \|\| rating > 5/);
 assert.match(source,/b.status='completed'/);
 assert.match(source,/WHERE b.id=\$1 AND b.customer_id=\$2/);
});
