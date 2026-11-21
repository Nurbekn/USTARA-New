class BookingSelectionError extends Error {
  constructor(status, message, code = 'invalid_selection') { super(message);Object.assign(this,{status,code}); }
}
const fail=(status,message,code)=>new BookingSelectionError(status,message,code);
function serviceIds(value) {
 if(!Array.isArray(value)||!value.length||value.length>20||value.some(id=>!Number.isSafeInteger(id)||id<=0||id>2147483647)||new Set(value).size!==value.length) throw fail(400,'Kamida bitta xizmatni to‘g‘ri tanlang.');
 return value;
}
async function multiSchemaReady(pool) {
 const r=await pool.query("SELECT to_regclass('booking_services') IS NOT NULL AS ready");
 return r.rows[0]?.ready===true;
}
async function selectedServices(client,barberId,ids,lock=false) {
 const result=await client.query(`SELECT id,name,price,duration_minutes FROM services s
 WHERE barber_id=$1 AND id=ANY($2::integer[]) AND COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE)
 ORDER BY id ${lock?'FOR SHARE':''}`,[barberId,ids]);
 if(result.rowCount!==ids.length)throw fail(400,'Tanlangan xizmat mavjud emas yoki faol emas.','service_unavailable');
 const services=ids.map(id=>result.rows.find(s=>s.id===id));
 if(services.some(s=>!Number.isInteger(Number(s.duration_minutes)) || Number(s.duration_minutes)<=0 || Number(s.duration_minutes)%5!==0))
   throw fail(503,'Xizmat davomiyligi 5 daqiqalik qadamga mos emas.','invalid_service_duration');
 const duration=services.reduce((sum,s)=>sum+Number(s.duration_minutes),0);
 // Parse the database's NUMERIC decimal text without floating-point rounding.
 const parseCents = value => {
   if (typeof value !== 'string' && typeof value !== 'number') return null;
   const raw = String(value);
   if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(raw)) return null;
   const [whole, fraction = ''] = raw.split('.');
   const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
   return Number.isSafeInteger(result) && result > 0 ? result : null;
 };
 const amounts = services.map(s => parseCents(s.price));
 if (amounts.some(value => value === null)) throw fail(503,'Xizmat narxini tekshirib bo‘lmadi.','invalid_service_price');
 const cents = amounts.reduce((sum, amount) => sum + amount, 0);
 if(!Number.isSafeInteger(duration)||duration<=0||!Number.isSafeInteger(cents)||cents<=0)throw fail(503,'Xizmat ma’lumotlarini tekshirib bo‘lmadi.');
 return {services,duration,totalPrice:(cents/100).toFixed(2)};
}
// Only the server decides the actual price. The customer's last displayed
// server quote is used solely to reject an unexpected price change before
// committing the booking. Never trust it as the amount to insert.
function expectedPriceMatches(quoted, actual) {
 if (quoted === undefined || quoted === null) return true; // older API clients
 const normalized = value => {
   if ((typeof value !== 'string' && typeof value !== 'number') ||
       !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(value))) return null;
   const [whole, fraction = ''] = String(value).split('.');
   const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
   return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
 };
 const expectedCents = normalized(quoted);
 if (expectedCents === null) throw fail(400, 'Tasdiqlanadigan xizmat narxi noto‘g‘ri.', 'invalid_expected_price');
 return expectedCents === normalized(actual);
}
// A duration quote is a confirmation guard, not an authoritative duration.
// The server must always use the locked service rows as the actual duration.
function expectedDurationMatches(quoted, actual) {
 if (quoted === undefined || quoted === null) return true; // older clients
 if (!Number.isSafeInteger(quoted) || quoted <= 0 || quoted > 1200 || quoted % 5 !== 0)
   throw fail(400, 'Tasdiqlanadigan xizmat davomiyligi noto‘g‘ri.', 'invalid_expected_duration');
 return quoted === actual;
}
async function attachBookingServices(rows,pool) {
 if(!rows.length||!await multiSchemaReady(pool))return rows;
 const result=await pool.query('SELECT booking_id,service_id AS id,service_name AS name,price,duration_minutes FROM booking_services WHERE booking_id=ANY($1::integer[]) ORDER BY booking_id,position',[rows.map(r=>r.id)]);
 const byBooking = new Map();
 for (const { booking_id, ...service } of result.rows) {
   if (!byBooking.has(booking_id)) byBooking.set(booking_id, []);
   byBooking.get(booking_id).push(service);
 }
 // Legacy bookings have no snapshot: do not invent historical prices.
 // New bookings must always show the original service name, even if the
 // sartarosh changes the current catalog name later.
 return rows.map(row => {
   const services = byBooking.get(row.id) || [];
   return { ...row, services, ...(services.length ? { service_name: services[0].name } : {}) };
 });
}
module.exports={BookingSelectionError,serviceIds,selectedServices,multiSchemaReady,attachBookingServices,expectedPriceMatches,expectedDurationMatches,fail};
