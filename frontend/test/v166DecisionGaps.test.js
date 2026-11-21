import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('v166 #80 existing saved posts do not constitute collaborative collections',()=>{
 const social=readFileSync(new URL('../src/pages/user/Social.jsx',import.meta.url),'utf8');
 const model=readFileSync(new URL('../src/pages/user/social/model.js',import.meta.url),'utf8');
 assert.match(social,/savedPostIds/);assert.match(model,/setSocialSave/);
 // Do not claim list-based saves offer collection membership or sharing ACLs.
 assert.doesNotMatch(social,/createCollection|inviteCollaborator|addCollectionMember/);
});
