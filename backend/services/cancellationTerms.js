// Compare the exact public terms previewed by the customer with the terms
// held under the barber's database row lock at booking creation time.
function checkExpectedCancellationPolicy(body, barberRow) {
  if (!body || !Object.hasOwn(body, 'expected_cancellation_policy')) return { ok: true };
  const expected = body.expected_cancellation_policy;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)
      || !Object.hasOwn(expected, 'cutoff_minutes')
      || Object.keys(expected).some(k => !['cutoff_minutes','text'].includes(k))) {
    return { ok: false, status: 400, code: 'invalid_cancellation_policy', message: 'Ko‘rsatilgan bekor qilish qoidasi noto‘g‘ri.' };
  }
  const cutoff = expected.cutoff_minutes;
  const text = expected.text == null ? null : expected.text;
  if ((cutoff !== null && (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 10080))
      || (text !== null && (typeof text !== 'string' || text.length > 280))) {
    return { ok: false, status: 400, code: 'invalid_cancellation_policy', message: 'Ko‘rsatilgan bekor qilish qoidasi noto‘g‘ri.' };
  }
  const currentCutoff = barberRow.cancellation_cutoff_minutes ?? null;
  const currentText = barberRow.cancellation_policy_text || null;
  if (cutoff !== currentCutoff || (text || null) !== currentText) {
    return { ok: false, status: 409, code: 'cancellation_policy_changed', message: 'Sartaroshning bekor qilish qoidasi o‘zgardi. Qayta ko‘rib tasdiqlang.' };
  }
  return { ok: true };
}
module.exports = { checkExpectedCancellationPolicy };
