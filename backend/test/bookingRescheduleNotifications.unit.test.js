'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBookingNotifier } = require('../services/telegramBookingNotifications');
const BOOKING = { id: 20, booking_time: '2030-01-07T05:00:00.000Z', duration_minutes: 30,
  chat_id: '123456', first_name: 'Ali', last_name: 'Vali', service_name: 'Current name', total_price: '50000.00' };
test('rescheduled barber Telegram message contains changed time, service snapshot, no approval buttons', async () => {
  const queries=[], sends=[];
  const pool={ async query(sql, params) {
    queries.push({sql,params});
    if(sql.includes('JOIN barber_telegram_links')) return {rows:[BOOKING],rowCount:1};
    if(sql.includes('to_regclass')) return {rows:[{ready:true}],rowCount:1};
    if(sql.includes('FROM booking_services')) return {rows:[{service_name:'Original booking name'}],rowCount:1};
    throw new Error(sql);
  } };
  const notify=createBookingNotifier({pool,api:async(method,payload)=>{sends.push({method,payload});}});
  assert.deepEqual(await notify(20,'rescheduled'),{sent:true});
  assert.deepEqual(queries[0].params,[20,'rescheduled']);
  assert.equal(sends[0].method,'sendMessage');
  assert.match(sends[0].payload.text,/Bron vaqti yoki xizmatlari o‘zgardi/);
  assert.match(sends[0].payload.text,/Original booking name/);
  assert.equal(sends[0].payload.reply_markup,undefined);
  assert.equal(sends[0].payload.protect_content,true);
});
test('reschedule notification delivery failure remains best effort', async () => {
  const logger={error(){}};
  const pool={async query(){return {rows:[BOOKING],rowCount:1};}};
  const notify=createBookingNotifier({pool,api:async()=>{throw new Error('offline');},logger});
  assert.deepEqual(await notify(20,'rescheduled'),{sent:false,reason:'delivery_failed'});
});
