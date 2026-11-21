import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const view=readFileSync(fileURLToPath(new URL('../src/layouts/UserLayout.jsx',import.meta.url)),'utf8');
test('v33 decision #60 customer has exactly the agreed five tabs in agreed order',()=>{
 const nav=view.match(/const navigation = \[([\s\S]*?)\];/)?.[1];
 assert.ok(nav);
 const matches=[...nav.matchAll(/\{ to: "([^"]+)", label: "([^"]+)"/g)];
 assert.deepEqual(matches.map(x=>x[2]),['Asosiy','Sartaroshlar','Ilhom','Bronlar','Profil']);
 assert.deepEqual(matches.map(x=>x[1]),[
  '/user','/user/explore?type=barbers','/user/social','/user/bookings','/user/profile']);
});
