// TODO: replace browser persistence with the customer profile API.
// Keep customer profiles separate by verified phone number in the local test flow.
const profileKey = (phone) => `ustara-customer-profile:${phone}`;

export function readCustomerProfile(phone) {
  if (!/^\+998\d{9}$/.test(phone || "")) return {};
  try {
    const saved = JSON.parse(localStorage.getItem(profileKey(phone)));
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

export function saveCustomerProfile(phone, profile) {
  if (!/^\+998\d{9}$/.test(phone || "")) throw new Error("Invalid customer phone");
  localStorage.setItem(profileKey(phone), JSON.stringify(profile));
}
