import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shopGalleryUiV173} from '../src/pages/shops/shopGalleryLocaleV173.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const page=fs.readFileSync(path.join(root,'src/pages/shops/ShopPublicV172.jsx'),'utf8');
test('#171 author credit is on each public gallery card, separate from caption',()=>{
 assert.match(page,/item.authorName &&/);
 assert.match(page,/galleryUi.author/);
 assert.match(page,/item.caption &&/);
 assert.match(page,/ownerBarberId/);
 assert.doesNotMatch(page,/dangerouslySetInnerHTML/);
});
test('#171 author text is translated in all three languages',()=>{
 assert.equal(shopGalleryUiV173.uz.author,'Muallif');
 assert.equal(shopGalleryUiV173.ru.author,'Автор');
 assert.equal(shopGalleryUiV173.en.author,'Author');
});
