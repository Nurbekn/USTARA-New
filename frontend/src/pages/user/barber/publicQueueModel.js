// Public queue numbers are short-lived, approximate aggregates, never a promise of a slot.
// Validate before display: stale/offline, wrong barber and malformed server payload
// must not become convincing but false queue information.
export const PUBLIC_QUEUE_MAX_AGE_MS = 90_000;
export const PUBLIC_QUEUE_MAX_FUTURE_MS = 60_000;
const MAX_INT4 = 2_147_483_647;
const isId = value => Number.isInteger(value) && value > 0 && value <= MAX_INT4;
const validMinutes = value => Number.isSafeInteger(value) && value >= 0
  && value <= 1_440 && value % 5 === 0;

export function parsePublicQueueSummary(raw, expectedBarberId, now = Date.now()) {
  const id = Number(expectedBarberId);
  if (!isId(id) || String(id) !== String(expectedBarberId)) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.barber_id !== id || !Number.isInteger(raw.waiting_count)
      || raw.waiting_count < 0 || raw.waiting_count > MAX_INT4
      || typeof raw.currently_called !== 'boolean' || typeof raw.day_closed !== 'boolean') return null;
  // ISO UTC timestamp is issued by our API. Noncanonical strings and future/stale
  // responses are treated as unavailable, not as live results.
  if (typeof raw.as_of !== 'string'
      || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw.as_of)) return null;
  const timestamp = Date.parse(raw.as_of);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== raw.as_of
      || !Number.isFinite(now) || now - timestamp > PUBLIC_QUEUE_MAX_AGE_MS
      || timestamp - now > PUBLIC_QUEUE_MAX_FUTURE_MS) return null;
  const eta = raw.new_arrival_estimate;
  if (raw.day_closed && eta !== null) return null;
  if (eta !== null && (!eta || typeof eta !== 'object' || Array.isArray(eta)
      || eta.approximate !== true || !validMinutes(eta.min_minutes)
      || !validMinutes(eta.max_minutes) || eta.max_minutes < eta.min_minutes)) return null;
  // Whitelist only public fields, even if an older server includes ticket or phone data.
  return {
    barber_id: id,
    waiting_count: raw.waiting_count,
    currently_called: raw.currently_called,
    day_closed: raw.day_closed,
    new_arrival_estimate: eta === null ? null : {
      min_minutes: eta.min_minutes,
      max_minutes: eta.max_minutes,
      approximate: true,
    },
    as_of: raw.as_of,
  };
}

// One outstanding refresh per view. Older responses (even if a fake transport
// ignores AbortSignal) cannot overwrite a newer refresh or a different profile.
export function createPublicQueueRequestRunner(load, report, now = () => Date.now()) {
  let latest = 0;
  let stopped = false;
  let controller = null;
  async function refresh(barberId) {
    if (stopped) return;
    const generation = ++latest;
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    try {
      const payload = await load(barberId, requestController.signal);
      if (stopped || generation !== latest || requestController.signal.aborted) return;
      const value = parsePublicQueueSummary(payload, barberId, now());
      report(value ? { barberId, status: 'ready', value }
        : { barberId, status: 'error', value: null });
    } catch {
      if (!stopped && generation === latest && !requestController.signal.aborted)
        report({ barberId, status: 'error', value: null });
    }
  }
  function stop() {
    stopped = true;
    latest++;
    controller?.abort();
  }
  return { refresh, stop };
}
