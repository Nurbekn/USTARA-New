'use strict';
// #84: no IP address, bearer token, OTP, or raw User-Agent is stored here.
const { randomBytes } = require('node:crypto');
const SESSION_ID = /^[0-9a-f]{32}$/;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function deviceLabel(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent.slice(0, 400) : '';
  const browser = /Firefox\//i.test(ua) ? 'Firefox' : /Edg\//i.test(ua) ? 'Edge'
    : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : 'Brauzer';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS X/i.test(ua) ? 'macOS'
      : /Linux/i.test(ua) ? 'Linux' : 'qurilma';
  return `${browser} · ${os}`;
}

async function createDeviceSession(client, userId, userAgent, id = randomBytes(16).toString('hex')) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !SESSION_ID.test(id)) throw new Error('Invalid device session');
  await client.query(`INSERT INTO account_device_sessions(session_id,user_id,device_label,expires_at)
    VALUES($1,$2,$3,clock_timestamp()+INTERVAL '7 days')`, [id, userId, deviceLabel(userAgent)]);
  return id;
}

function validSessionId(id) { return typeof id === 'string' && SESSION_ID.test(id); }
module.exports = { createDeviceSession, validSessionId, deviceLabel, SEVEN_DAYS };
