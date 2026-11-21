// Validate the server's minimally scoped privacy-export contract. This is a UI
// guard, not a substitute for authorization enforced by the backend.
export function validatePrivacyExport(data, role) {
  if (!data || data.code !== 'privacy_export' || data.schemaVersion !== 1 ||
    data.account?.role !== role || !['customer','barber'].includes(role) ||
    !/^\+998\d{9}$/.test(data.account.phone) ||
    !Number.isInteger(data.profile?.id) || data.profile.id <= 0 ||
    !Array.isArray(data.bookings) || data.bookings.length > 5000) return false;
  return data.bookings.every(b => Number.isInteger(b.id) && b.id > 0 &&
    Number.isInteger(b.serviceId) && b.serviceId > 0 &&
    !('customerId' in b) && !('barberId' in b) && !('customerPhone' in b) &&
    typeof b.bookingTime === 'string' && typeof b.status === 'string');
}
