import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
test('#91 portfolio state mapping and pinned UI only after API confirmation',()=>{
 const posts=read('pages/barber/data/portfolioPosts.js');
 const store=read('pages/barber/data/store.js');
 const portfolio=read('pages/barber/Portfolio.jsx');
 assert.match(posts,/PUT.*\/api\/social\/posts\/\$\{Number\(id\)\}\/featured/);
 assert.match(posts,/result\.featured!==featured/);
 assert.match(posts,/await refreshBarberData\(\)/);
 assert.match(store,/featured: post\.featured === true/);
 assert.match(portfolio,/posts\.filter\(p => p\.featured\)\.length >= 6/);
 assert.match(portfolio,/disabled=\{featuring \|\| deleting/);
});
test('#91 public profile has a read-only featured mark',()=>{
 const publicUi=read('pages/user/barber/BarberPublicProfile.jsx');
 assert.match(publicUi,/item\.featured === true/);
 assert.match(publicUi,/bpv-featured-mark/);
 assert.doesNotMatch(publicUi,/setPortfolioFeatured/);
});
