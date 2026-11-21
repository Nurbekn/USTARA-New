import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortPinnedCommentsV167} from '../src/pages/user/social/model.js';
test('#82 pin ordering prefers one pinned comment and does not mutate input',()=>{
 const comments=[{id:3,pinned:false},{id:9,pinned:true},{id:6,pinned:false}];
 assert.deepEqual(sortPinnedCommentsV167(comments).map(c=>c.id),[9,3,6]);
 assert.deepEqual(comments.map(c=>c.id),[3,9,6]);
 assert.deepEqual(sortPinnedCommentsV167(null),[]);
});
test('#82 UI permits pin only if current barber session matches post author; server authority remains mandatory',()=>{
 const ui=readFileSync(new URL('../src/pages/barber/components/PostReactions.jsx',import.meta.url),'utf8');
 const model=readFileSync(new URL('../src/pages/user/social/model.js',import.meta.url),'utf8');
 assert.match(ui,/await setSocialCommentPin\(postId, c\.id/);
 assert.match(ui,/setComments\(sortPinnedCommentsV167\(await loadPostComments/);
 assert.match(ui,/disabled={busy \|\| loading}/);
 assert.match(model,/session.role !== 'barber'/);
 assert.match(model,/response\?\.pinned!==pinned/);
});
