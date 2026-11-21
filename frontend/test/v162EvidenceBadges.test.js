import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BADGE_TYPES_V162,badgeLabelsV162,publicBadgesV162} from '../src/pages/user/barber/badgeModelV162.js';
import {BADGE_TYPES,badgeAdminCopyV162,checkedAdminBadgePageV162} from '../src/pages/adminBadgeModelV162.js';
test('badge categories are stable and have translations in all three languages',()=>{
 assert.deepEqual(BADGE_TYPES,BADGE_TYPES_V162);
 for(const language of ['uz','ru','en'])for(const type of BADGE_TYPES){
  assert.ok(badgeLabelsV162(language)[type]);assert.ok(badgeAdminCopyV162(language).labels[BADGE_TYPES.indexOf(type)]);
 }
});
test('public badge API cannot spoof type, repeat or redirect another barber id',()=>{
 assert.deepEqual(publicBadgesV162({barberId:31,badges:['portfolio_checked','identity_checked']},31),
  ['identity_checked','portfolio_checked']);
 for(const bad of [{barberId:31,badges:['vip']},{barberId:31,badges:['identity_checked','identity_checked']},
  {barberId:32,badges:[]},{barberId:31,badges:'none'},{}])assert.throws(()=>publicBadgesV162(bad,31));
});
test('admin badge page refuses malformed records and arbitrary states',()=>{
 const good={page:1,hasNext:false,barbers:[{id:31,verification_status:'approved',badges:[{type:'identity_checked',state:'active',revision:1}]}]};
 assert.equal(checkedAdminBadgePageV162(good),true);
 for(const bad of [{...good,barbers:[{...good.barbers[0],badges:[{type:'vip',state:'active',revision:1}]}]},
  {...good,barbers:[{...good.barbers[0],badges:[{type:'identity_checked',state:'super',revision:1}]}]},
  {...good,page:101},{...good,hasNext:'false'}])assert.equal(checkedAdminBadgePageV162(bad),false);
});
