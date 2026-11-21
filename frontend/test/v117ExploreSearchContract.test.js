import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

async function loadModule(url) {
  let code=(await readFile(url,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
  for(const found of [...code.matchAll(/(from\s+|import\()["']([^"']+)["']/g)]) {
    const dependency=await loadModule(new URL(found[2],url));
    code=code.replace(found[0],`${found[1]}"${dependency}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const { loadExploreCatalog, normalizeCatalog, selectResults }= await import(
  await loadModule(new URL('../src/pages/user/explore/catalog.js',import.meta.url)));
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const barbers=[
  {id:51,first_name:'Malika',last_name:'Oʻrinova',salonName:'Meros Salon',specialty:'Rang ustasi',address:'Toshkent, Chilonzor tumani',services:[{id:81,name:'Soch ranglash',minPrice:50000,maxPrice:50000,barberIds:[51]}],serviceIds:[81]},
  {id:52,first_name:'Akmal',last_name:'Aliyev',salonName:'Samar',specialty:'Soch ustasi',address:'Samarqand, Registon ko‘chasi',services:[{id:82,name:'Fade',minPrice:30000,maxPrice:30000,barberIds:[52]}],serviceIds:[82]},
  {id:53,first_name:'Bekzod',last_name:'Olimov',salonName:null,specialty:'Fade',address:null,services:[],serviceIds:[]},
];
test('#16/#164: actual public catalog GET supports intersecting words, service, district and price without guessing',async()=>{
  globalThis.fetch=async (url,options)=>{
    assert.equal(new URL(url).pathname,'/api/barbers');
    assert.equal(new Headers(options.headers).get('Authorization'),null);
    return new Response(JSON.stringify(barbers));
  };
  const catalog=normalizeCatalog(await loadExploreCatalog());
  const ids=filters=>selectResults(catalog,'barbers',new URLSearchParams(filters),null).map(b=>b.id);
  assert.deepEqual(ids('q=malika+rang&area=chilonzor&service=81&min=45000&max=60000'),[51]);
  assert.deepEqual(ids('q=akmal+fade&area=registon'),[52]);
  assert.deepEqual(ids('q=chilonzor&area=registon'),[]);
  assert.deepEqual(ids('area=registon&service=81'),[]);
  assert.deepEqual(ids('area=chilonzor&available=1'),[]);
  assert.deepEqual(ids('area=chilonzor&region=Toshkent'),[]); // Region was not returned by API.
});
test('#16/#164: missing address cannot be inferred; normalized apostrophe matches provided names',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify(barbers));
  const catalog=normalizeCatalog(await loadExploreCatalog());
  const search=q=>selectResults(catalog,'barbers',new URLSearchParams(q),null).map(x=>x.id);
  assert.deepEqual(search('q=O%27rinova'),[51]);
  assert.deepEqual(search('area=chilonzor'),[51]);
  assert.deepEqual(search('area=bekzod'),[]);
  assert.deepEqual(search('q=bekzod'),[53]);
});
