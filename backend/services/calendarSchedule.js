'use strict';
// All write paths and slot-read paths consult the SAME break rules in PostgreSQL.
// Every calendar timestamp is interpreted in the barber's Asia/Tashkent zone.
const FIT_SQL = `SELECT (
  local_booking >= local_booking::date + s.start_time AND
  local_booking + $3 * INTERVAL '1 minute' <= local_booking::date + s.end_time AND
  NOT EXISTS (SELECT 1 FROM ustara_effective_breaks($1,
    (local_booking)::date) br
    WHERE local_booking < local_booking::date + br.end_time
      AND local_booking + $3 * INTERVAL '1 minute' > local_booking::date + br.start_time)
) AS fits FROM ustara_effective_day_schedule($1,
  ($2::timestamptz AT TIME ZONE 'Asia/Tashkent')::date) s
CROSS JOIN (SELECT $2::timestamptz AT TIME ZONE 'Asia/Tashkent' AS local_booking) x`;
const DAY_SQL = `SELECT s.start_time,s.end_time,s.break_start,s.break_end,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'start',to_char(b.start_time,'HH24:MI'),
      'end',to_char(b.end_time,'HH24:MI')) ORDER BY b.start_time,b.end_time),'[]'::jsonb)
     FROM ustara_effective_breaks($1,$2::date) b) AS breaks,
  EXTRACT(EPOCH FROM ((clock_timestamp() AT TIME ZONE 'Asia/Tashkent')-$2::date))/60 AS now_minutes
  FROM ustara_effective_day_schedule($1,$2::date) s`;
const INVALID_BOOKING_SQL = `SELECT b.id FROM bookings b
  WHERE b.barber_id=$1 AND b.status IN ('pending','confirmed')
  AND b.booking_time + b.duration_minutes * INTERVAL '1 minute' > clock_timestamp()
  AND ($2::date[] IS NULL OR (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date = ANY($2::date[]))
  AND NOT EXISTS (
    SELECT 1 FROM ustara_effective_day_schedule(b.barber_id,
      (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date) s
    WHERE (b.booking_time AT TIME ZONE 'Asia/Tashkent') >=
      (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date + s.start_time
      AND ((b.booking_time + b.duration_minutes * INTERVAL '1 minute') AT TIME ZONE 'Asia/Tashkent') <=
        (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date + s.end_time
      AND NOT EXISTS (SELECT 1 FROM ustara_effective_breaks(b.barber_id,
          (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date) br
        WHERE (b.booking_time AT TIME ZONE 'Asia/Tashkent') <
          (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date + br.end_time
          AND ((b.booking_time + b.duration_minutes * INTERVAL '1 minute') AT TIME ZONE 'Asia/Tashkent') >
            (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date + br.start_time)
  ) LIMIT 1`;
function minutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    throw Error('Database calendar time invalid');
  }
  const [h,m] = value.split(':').map(Number);
  if(h > 23 || m > 59) throw Error('Database calendar time invalid');
  return h*60+m;
}
function withBreakBusy(existing, schedule) {
  if (!schedule) return existing;
  // v19: the DB returns the complete union of recurring, dated and legacy breaks.
  // Keep the v18 single-break fallback only for older test fixtures.
  const ranges = Array.isArray(schedule.breaks) ? schedule.breaks :
    schedule.break_start && schedule.break_end ? [{start:schedule.break_start,end:schedule.break_end}] : [];
  return [...existing,...ranges.map(({start,end})=>({start:minutes(start),end:minutes(end)}))];
}
async function fitsBooking(client, barberId, isoTime, duration) {
  const result = await client.query(FIT_SQL,[barberId,isoTime,duration]);
  return result.rows[0]?.fits === true;
}
async function dayHours(client,barberId,date){ return client.query(DAY_SQL,[barberId,date]); }
async function invalidActiveBooking(client,barberId,dates=null){
  const result = await client.query(INVALID_BOOKING_SQL,[barberId,dates]);
  return result.rows[0]?.id ?? null;
}
module.exports = { FIT_SQL,DAY_SQL,INVALID_BOOKING_SQL,minutes,withBreakBusy,fitsBooking,dayHours,invalidActiveBooking };
