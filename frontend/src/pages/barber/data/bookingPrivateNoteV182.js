// #179 PRIVATE booking notes. Never share a note through a booking list,
// local/session storage, analytics, search, Telegram, or another account.
import {request} from '../../../api/client.js';
import {getSession} from '../../auth/utils/session.js';
import {validPrivateNote} from './bookingPrivateNoteRulesV182.js';
export {PRIVATE_NOTE_LIMIT_V182,normalizePrivateNote,validPrivateNote,privateBookingNoteTextV182,privateBookingNoteUiV182} from './bookingPrivateNoteRulesV182.js';
function parseNote(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.text !== 'string' || !Number.isInteger(value.revision) || value.revision < 0
    || ((value.revision===0) !== (value.text===''))
    || (value.text && !validPrivateNote(value.text))
    || (value.expiresAt!==null && (typeof value.expiresAt!=='string' || !Number.isFinite(Date.parse(value.expiresAt)))))
    throw Error('Serverdan qaydning tasdiqlangan holati olinmadi.');
  return {text:value.text,revision:value.revision,expiresAt:value.expiresAt};
}
export async function privateBookingNoteV182(bookingId,method='GET',note=null,{signal}={}) {
  if (!idOk(bookingId) || !['GET','PUT','DELETE'].includes(method)) throw Error('Bron yoki amal noto‘g‘ri.');
  const session=getSession();
  if (session?.role!=='barber' || !session?.token || !Number.isSafeInteger(session.profileId))
    throw Error('Sartarosh akkauntiga qayta kiring.');
  if (method==='PUT' && (!note || !validPrivateNote(note.text) || !Number.isInteger(note.expectedRevision) || note.expectedRevision<0))
    throw Error('1–500 belgili qayd kiriting.');
  if (method==='DELETE' && (!note || !Number.isInteger(note.expectedRevision) || note.expectedRevision<0))
    throw Error('Qayd versiyasi noto‘g‘ri.');
  const data = await request(method,`/api/bookings/${Number(bookingId)}/private-note`,{
    token:session.token,signal,...(method==='GET'?{}:{body:method==='PUT'?note:{expectedRevision:note.expectedRevision}}),
  });
  if (identity(getSession()) !== identity(session)) throw Error('Akkaunt almashdi. Qayta kiring.');
  return parseNote(data);
}
