const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createUpdateHandler } = require('../telegram/handler');
const { BUTTONS } = require('../telegram/menu');

function makeHandler() {
  const sent = [];
  const handler = createUpdateHandler({
    username: 'ustara_test_bot',
    service: { async chatStatus(id) { assert.equal(id, 42); return true; } },
    api: async (method, body) => { assert.equal(method, 'sendMessage'); sent.push(body); },
  });
  const send = (text, chat = { id: 42, type: 'private' }) => handler({ message: {
    from: { id: 42, is_bot: false }, chat, text,
  } });
  return { sent, send };
}

test('menu and help expose useful buttons without requesting sensitive credentials', async () => {
  const { sent, send } = makeHandler();
  await send('/menu');
  assert.match(sent[0].text, /USTARA/);
  assert.equal(sent[0].reply_markup.keyboard.length, 3);
  assert.ok(sent[0].protect_content);
  assert.doesNotMatch(sent[0].text, /https:\/\/api.telegram/);
  await send(BUTTONS.help);
  assert.match(sent[1].text, /parol/);
});

test('menu routes phone change, bookings and status to existing safe workflows', async () => {
  const { sent, send } = makeHandler();
  await send(BUTTONS.phone);
  assert.match(sent[0].text, /Profil/);
  assert.doesNotMatch(sent[0].text, /tasdiqlandi/);
  await send(BUTTONS.bookings);
  assert.match(sent[1].text, /Bronlar/);
  await send(BUTTONS.status);
  assert.match(sent[2].text, /bog‘langan/);
});

test('group chat and another bot username cannot invoke private menu', async () => {
  const { sent, send } = makeHandler();
  await send('/menu', { id: -100, type: 'group' });
  await send('/menu@other_bot');
  assert.equal(sent.length, 0);
});

test('plain /start immediately shows menu without asking for contact', async () => {
  const { sent, send } = makeHandler();
  await send('/start');
  assert.match(sent[0].text, /USTARA yordamchi boti/);
  assert.ok(sent[0].reply_markup.keyboard);
  assert.notEqual(sent[0].reply_markup.keyboard[0][0].request_contact, true);
});

test('linked barber sees only server-selected near-term bookings, not other users', async () => {
  const sent = [];
  const handler = createUpdateHandler({
    username: 'ustara_test_bot',
    service: { chatUpcomingBookings: async (chatId) => {
      assert.equal(chatId, 42);
      return [{ id: 7, booking_time: '2026-11-19T10:00:00Z',
        service_name: 'Soch olish', status: 'confirmed' }];
    } },
    api: async (_method, body) => sent.push(body),
  });
  await handler({ message: { text: BUTTONS.bookings,
    chat: { id: 42, type: 'private' }, from: { id: 42, is_bot: false } } });
  assert.match(sent[0].text, /#7/);
  assert.match(sent[0].text, /Soch olish/);
  assert.doesNotMatch(sent[0].text, /telefon|parol|token/i);
});
