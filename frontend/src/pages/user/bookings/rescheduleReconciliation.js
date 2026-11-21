// A PATCH request can commit even when the browser never receives its reply.
// Never send another PATCH from the same outdated booking snapshot until the
// customer has fetched the authoritative current booking state.
export function requiresRescheduleReconciliation(error) {
  return error?.code === 'booking_confirmation_unknown'
    || error?.code === 'booking_changed'
    || error?.code === 'session_changed'
    || error?.status === 0
    || error?.status === 401;
}
