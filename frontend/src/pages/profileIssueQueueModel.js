// v129 / #83 #49: safe admin report queue navigation and review receipts.
export const PROFILE_REPORT_PAGE_SIZE = 100;
export const PROFILE_REPORT_MAX_PAGE = 100;
export const PROFILE_REPORT_STATUSES = Object.freeze([
  ['pending','Ko‘rib chiqilmagan'],
  ['resolved','Ko‘rib chiqilgan'],
  ['dismissed','Asossiz deb yopilgan'],
  ['all','Hammasi'],
]);
export function profileReportsEndpoint(status, page) {
  if (!PROFILE_REPORT_STATUSES.some(([value]) => value === status)
      || !Number.isInteger(page) || page < 1 || page > PROFILE_REPORT_MAX_PAGE) return null;
  return `profile-reports?status=${status}&page=${page}`;
}
export function confirmedProfileReview(reply, id, status) {
  return ['resolved','dismissed'].includes(status)
    && /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) && Number(id)>0
    && reply !== null && typeof reply === 'object' && !Array.isArray(reply)
    && String(reply.id) === String(id) && reply.status === status;
}

// v130: one look-ahead row is allowed by the API; never display the sentinel.
export function isProfileReportPage(payload) {
  return Array.isArray(payload) && payload.length <= PROFILE_REPORT_PAGE_SIZE + 1
    && payload.every(row => row && typeof row === 'object' && !Array.isArray(row)
      && /^\d+$/.test(String(row.id)) && Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0
      && /^\d+$/.test(String(row.barber_id)) && Number.isSafeInteger(Number(row.barber_id)) && Number(row.barber_id) > 0
      && ['address','hours','services','media','other'].includes(row.reason)
      && ['pending','resolved','dismissed'].includes(row.status)
      && typeof row.details === 'string');
}
export function visibleProfileReports(rows) {
  return isProfileReportPage(rows) ? rows.slice(0, PROFILE_REPORT_PAGE_SIZE) : [];
}
export function hasMoreProfileReports(rows) {
  return isProfileReportPage(rows) && rows.length === PROFILE_REPORT_PAGE_SIZE + 1;
}
