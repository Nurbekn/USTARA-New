// A customer may leave until service actually begins.
// Server rechecks ownership, date and status under the barber transaction lock.
const selfExitStatuses = new Set(['waiting', 'called', 'arrived']);
export function canSelfExitQueue(status) {
  return typeof status === 'string' && selfExitStatuses.has(status);
}
