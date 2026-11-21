const { BarberProfileError, normalizeBarberProfilePatch, createBarberProfileService } = require('./barberProfile');
const invalid = message => new BarberProfileError(400, message, 'invalid_setup');
function setupHours(value) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) throw invalid('Kamida bitta ish kunini tanlang.');
  const seen = new Set();
  return value.map(day => {
    if (!day || !Number.isInteger(day.day_of_week) || day.day_of_week < 0 || day.day_of_week > 6
      || seen.has(day.day_of_week) || typeof day.start_time !== 'string' || typeof day.end_time !== 'string' || !time.test(day.start_time) || !time.test(day.end_time) || day.start_time >= day.end_time) throw invalid('Ish kuni yoki vaqti noto‘g‘ri.');
    seen.add(day.day_of_week);
    return { day_of_week: day.day_of_week, start_time: day.start_time, end_time: day.end_time };
  });
}
function createBarberSetupService(pool) {
  return async (body, actor) => {
    if (actor?.role !== 'barber' || !Number.isInteger(actor.id) || !Number.isInteger(actor.profileId)) throw new BarberProfileError(403, 'Faqat sartarosh o‘z profilini sozlay oladi.', 'forbidden');
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['address', 'location', 'working_hours'].includes(key))) throw invalid('Sozlash ma’lumotlari noto‘g‘ri.');
    const hours = setupHours(body.working_hours);
    const patch = normalizeBarberProfilePatch({ address: body.address ?? null, location: body.location ?? null });
    const client = await pool.connect();let broken = false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      // Jadval va bron yozuvchilari bilan bir xil lock tartibi.
      await client.query('SELECT pg_advisory_xact_lock($1)', [actor.profileId]);
      const selected = await client.query(`SELECT b.verification_status,COALESCE(v.version,0) AS version
        FROM barbers b JOIN users u ON u.id=b.user_id
        LEFT JOIN account_session_versions v ON v.user_id=u.id
        WHERE b.id=$1 AND u.id=$2 AND u.role='barber' FOR UPDATE OF b,u`, [actor.profileId, actor.id]);
      const current = selected.rows[0];
      if (!current || current.version !== (actor.sessionVersion ?? 0)) throw new BarberProfileError(401, 'Sessiya yaroqsiz. Qayta kiring.', 'invalid_session');
      if (!['pending', 'approved'].includes(current.verification_status)) throw new BarberProfileError(403, 'Profil holati bu amalni bajarishga ruxsat bermaydi.', 'setup_forbidden');
      const barber = await createBarberProfileService(client).update(actor.profileId, actor.id, patch);
      if (!barber) throw new BarberProfileError(404, 'Sartarosh profili topilmadi.', 'not_found');
      await client.query('DELETE FROM barber_working_hours WHERE barber_id=$1', [actor.profileId]);
      for (const day of hours) await client.query('INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,$2,$3,$4)', [actor.profileId, day.day_of_week, day.start_time, day.end_time]);
      await client.query('COMMIT');
      return { barber, working_hours: hours };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { broken = true; }
      throw error;
    } finally { client.release(broken); }
  };
}
module.exports = { createBarberSetupService, setupHours };
