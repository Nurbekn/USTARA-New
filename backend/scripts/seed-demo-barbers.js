/** Local development only. Never use on a public/shared/production database. */
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
require('dotenv').config();
const db = require('../db');
const data = [
  ['Demo', 'Aziz', 'Fade / taper', 'Toshkent, Amir Temur xiyoboni',41.3111,69.2797],
  ['Demo', 'Javohir', 'Classic / crop', 'Toshkent, Chilonzor',41.2750,69.2030],
  ['Demo', 'Sardor', 'Modern styling', 'Toshkent, Yunusobod',41.3600,69.2890],
  ['Demo', 'Kamron', 'Soqol va soch', 'Toshkent, Mirzo Ulug‘bek',41.3250,69.3320],
];
async function run() {
  if (process.env.NODE_ENV !== 'development' || process.env.USTARA_ENABLE_DEMO_SEED !== 'YES_I_UNDERSTAND'
      || !['127.0.0.1','localhost','::1'].includes(process.env.DB_HOST || '')) {
    throw new Error('Demo akkauntlar faqat NODE_ENV=development, lokal DB_HOST va USTARA_ENABLE_DEMO_SEED=YES_I_UNDERSTAND bilan yaratiladi.');
  }
  const client = await db.connect();
  const credentials = [];
  try {
    await client.query('BEGIN');
    for (const [first,last,specialty,address,lat,lng] of data) {
      const phone = `+99800000000${credentials.length + 1}`;
      const password = `Demo-${crypto.randomBytes(12).toString('base64url')}9a`;
      const hash = await bcrypt.hash(password, 10);
      const account = await client.query("INSERT INTO users(phone,password,role) VALUES($1,$2,'barber') RETURNING id",[phone,hash]);
      const barber = await client.query("INSERT INTO barbers(user_id,first_name,last_name,specialty,verification_status,address,latitude,longitude) VALUES($1,$2,$3,'barber','approved',$4,$5,$6) RETURNING id",[account.rows[0].id,first,last,address,lat,lng]);
      await client.query('INSERT INTO services(barber_id,name,price,duration_minutes) VALUES($1,$2,$3,$4)',[barber.rows[0].id, specialty, 45000, 40]);
      credentials.push({name:`${first} ${last}`,phone,password});
    }
    await client.query('COMMIT');
    console.log('\nFAQAT LOCAL DEMO BAZA — parollarni maxfiy saqlang!');
    for (const item of credentials) console.log(`${item.name}: ${item.phone} / ${item.password}`);
  } catch (error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { client.release(); await db.end(); }
}
run().catch(error => { console.error('Demo seed to‘xtadi:',error.message);process.exitCode=1;db.end().catch(()=>{}); });
