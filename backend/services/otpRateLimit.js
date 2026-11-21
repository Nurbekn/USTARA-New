const crypto = require('node:crypto');
const { fail } = require('../utils/registration');

function createOtpRateLimit({ pool, env = process.env }) {
  return async function consume(scope, identity, maximum, seconds) {
    if (typeof env.OTP_HMAC_KEY !== 'string' || Buffer.byteLength(env.OTP_HMAC_KEY) < 32) {
      throw fail(503, 'Tasdiqlash xizmati sozlanmagan.', 'otp_unavailable');
    }
    const key = crypto.createHmac('sha256', env.OTP_HMAC_KEY)
      .update(JSON.stringify(['otp-rate', scope, String(identity)])).digest('hex');
    // A single UPSERT serializes concurrent callers across API/worker instances.
    const result = await pool.query(`INSERT INTO otp_request_limits(scope,key_hash,window_started_at,request_count)
      VALUES($1,$2,clock_timestamp(),1) ON CONFLICT(scope,key_hash) DO UPDATE SET
      request_count=CASE WHEN otp_request_limits.window_started_at<=clock_timestamp()-$3*INTERVAL '1 second'
        THEN 1 ELSE LEAST(otp_request_limits.request_count+1,$4+1) END,
      window_started_at=CASE WHEN otp_request_limits.window_started_at<=clock_timestamp()-$3*INTERVAL '1 second'
        THEN clock_timestamp() ELSE otp_request_limits.window_started_at END
      RETURNING request_count`, [scope, key, seconds, maximum]);
    return result.rows[0].request_count <= maximum;
  };
}
module.exports = { createOtpRateLimit };
