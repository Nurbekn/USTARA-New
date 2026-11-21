import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSocial, searchPosts, authorKey } from '../src/pages/user/social/model.js';

const post = {id: 1, author: {id: 7, role: 'barber', first_name: 'Ali', last_name: 'Valiyev'}, media: [{type:'image', url:'/api/media/1'}], serviceIds:[11], caption:'Fade kesim', kind:'standard', likedByMe:false, likeCount:0};
const catalog = { posts:[post], services:[{id:11,name:'Fade',category:'Soch olish'}], following:['barber:7'], savedPostIds:[], discover:{barbers:[], salons:[], trends:[]} };
test('social response normalization preserves real post and author', () => {const value=normalizeSocial(catalog);assert.equal(value.posts.length,1);assert.equal(authorKey(value.posts[0].author),'barber:7')});
test('search matches service, caption, and category', () => { const value=normalizeSocial(catalog);assert.equal(searchPosts(value.posts,value.services,'fade').length,1); assert.equal(searchPosts(value.posts,value.services,'','Soch olish').length,1);assert.equal(searchPosts(value.posts,value.services,'nonexistent').length,0); });
test('invalid/duplicate posts are rejected', () => {assert.throws(()=>normalizeSocial({...catalog,posts:[post,post]}),/Duplicate posts/);assert.throws(()=>normalizeSocial({...catalog,posts:[{id:2,author:{role:'barber'},media:'bad'}]}),/Invalid post/);});
test('customer post and unsupported media are excluded', () => {const value=normalizeSocial({...catalog,posts:[{...post, id:2, author:{role:'customer'}},{...post,media:[{type:'pdf',url:'x'},post.media[0]]}]});assert.equal(value.posts.length,1);assert.equal(value.posts[0].media.length,1);});
