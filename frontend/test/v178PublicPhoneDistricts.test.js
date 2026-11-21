import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
async function loadModule(url){
  let source=await readFile(url,'utf8');
  for(const match of [...source.matchAll(/from\s+["']([^"']+)["']/g)]){
    const child=await loadModule(new URL(match[1],url));
    source=source.replace(match[0],`from "${child}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const {publicBarberPhoneHrefV178}=await import(await loadModule(new URL('../src/pages/user/barber/publicPhoneV178.js',import.meta.url)));
const {publishedDistrictSuggestions,selectResults}=await import(await loadModule(new URL('../src/pages/user/explore/catalog.js',import.meta.url)));
const profiles=[
 {id:1,first_name:'Ali',address:'Toshkent, Yunusobod tumani, 8-mavze'},
 {id:2,first_name:'Vali',address:'Toshkent, Yunusobod tumani, 19-mavze'},
 {id:3,first_name:'Said',address:'Toshkent, Shayxontohur tumani'},
 {id:4,first_name:'Zafar',address:'Toshkent shahar',location:{lat:41.3,lng:69.2}},
 {id:5,first_name:'Nigora',address:null},
];
const catalog={barbers:profiles,salons:[],services:[]};
test('#159: only safe international number creates tel link',()=>{
 assert.equal(publicBarberPhoneHrefV178('+998901234567'),'tel:+998901234567');
 for(const phone of ['tel:+998901234567','javascript:alert(1)','+9989012\" onclick="x','998901234567','+100','+998901234567#foo',null,23]){
  assert.equal(publicBarberPhoneHrefV178(phone),null);
 }
});
test('#164: suggestions are deduplicated only from real published address segments',()=>{
 assert.deepEqual(new Set(publishedDistrictSuggestions(catalog)),new Set(['Shayxontohur tumani','Yunusobod tumani']));
 assert.deepEqual(publishedDistrictSuggestions({barbers:profiles.map(p=>({id:p.id,address:null,location:p.location}))}),[]);
 assert.equal(publishedDistrictSuggestions(catalog,1).length,1);
});
test('#164: district selection applies to actual address, not name or estimated coordinates',()=>{
 const ids=query=>selectResults(catalog,'barbers',new URLSearchParams({area:query}),null).map(x=>x.id);
 assert.deepEqual(ids('Yunusobod tumani'),[1,2]);
 assert.deepEqual(ids('Shayxontohur tumani'),[3]);
 assert.deepEqual(ids('shahar'),[4]);
 assert.deepEqual(ids('Farg‘ona tumani'),[]);
});
test('#159/#164: UI does not add phone to profile share or fabricate area from location',async()=>{
 const view=await readFile(new URL('../src/pages/user/barber/BarberPublicProfile.jsx',import.meta.url),'utf8');
 const share=await readFile(new URL('../src/pages/user/barber/publicShare.js',import.meta.url),'utf8');
 const explore=await readFile(new URL('../src/pages/user/Explore.jsx',import.meta.url),'utf8');
 assert.match(view,/publicBarberPhoneHrefV178\(barber.phone\)/);
 assert.match(view,/href=\{barberPhoneHref\}/);
 assert.doesNotMatch(share,/barber\.phone/);
 assert.match(explore,/publishedDistrictSuggestions\(catalog\)/);
 assert.match(explore,/<datalist id="ex-public-districts-v178">/);
});
