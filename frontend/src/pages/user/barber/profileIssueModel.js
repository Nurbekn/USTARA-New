export const PROFILE_ISSUE_REASONS = Object.freeze([
  ['address', 'Manzil yoki xarita'],
  ['hours', 'Ish vaqti'],
  ['services', 'Xizmat yoki narx'],
  ['media', 'Profil rasmi yoki ma’lumot'],
  ['other', 'Boshqa xato'],
]);

export function makeProfileIssuePayload(reason, rawDetails) {
  if (!PROFILE_ISSUE_REASONS.some(([key]) => key === reason) || typeof rawDetails !== 'string') return null;
  const details = rawDetails.trim();
  if (details.length < 10 || details.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(details)) return null;
  return {reason, details};
}

export function validReportBarberId(raw) {
  return Number.isSafeInteger(Number(raw)) && Number(raw) > 0 && /^\d+$/.test(String(raw));
}

// v130: only categories are exposed; a status response must contain no report text or identity.
export function parseMyPendingProfileIssues(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)
      || !Array.isArray(response.pendingReasons) || response.pendingReasons.length > PROFILE_ISSUE_REASONS.length)
    return null;
  const allowed = PROFILE_ISSUE_REASONS.map(([key]) => key);
  if (!response.pendingReasons.every(reason => typeof reason === 'string' && allowed.includes(reason))
      || new Set(response.pendingReasons).size !== response.pendingReasons.length) return null;
  return response.pendingReasons;
}

// v180: an unknown status is NOT permission to resend. Re-query the server first.
export function canSendProfileIssue({payload, pendingState, pendingReasons, reason, status, sending}) {
  return Boolean(payload) && pendingState === 'ready' && Array.isArray(pendingReasons)
    && !pendingReasons.includes(reason) && !sending && status !== 'sending' && status !== 'sent';
}
