// Customer profile data is read and updated only through backend endpoints.
async function customerApi() {
  const [{ getSession }, { request }] = await Promise.all([
    import('../../auth/utils/session.js'), import('../../../api/client.js'),
  ]);
  const session = getSession();
  if (session?.role !== 'customer' || !session.token) {
    throw Object.assign(new Error('Customer hisobi orqali qayta tizimga kiring.'), { status: 401 });
  }
  return { session, request };
}
export async function loadCustomerProfile({ signal } = {}) {
  const { session, request } = await customerApi();
  const result = await request('GET', '/api/customers/me', { token: session.token, signal });
  const customer = result?.customer;
  if (!customer || !Number.isInteger(customer.id) || customer.id <= 0
    || customer.id !== session.profileId || customer.phone !== session.phone
    || ![customer.first_name, customer.last_name, customer.avatar_url, customer.address].every((value) => value == null || typeof value === 'string')
    || !(customer.latitude == null || Number.isFinite(customer.latitude))
    || !(customer.longitude == null || Number.isFinite(customer.longitude))
    || (customer.latitude == null) !== (customer.longitude == null)) {
    throw new Error('Serverdan customer profili olinmadi.');
  }
  return { ...customer, firstName: customer.first_name ?? '', lastName: customer.last_name ?? '',
    birthDate: '', avatar: null, avatarPhoto: customer.avatar_url || '',
    address: customer.address || '',
    location: Number.isFinite(customer.latitude) && Number.isFinite(customer.longitude)
      ? { lat: customer.latitude, lng: customer.longitude } : null };
}
export async function saveCustomerProfileToServer(profile, { signal } = {}) {
  const { session, request } = await customerApi();
  if (!Number.isInteger(profile?.id) || profile.id <= 0 || profile.id !== session.profileId) {
    throw Object.assign(new Error('Customer profil ID mos emas.'), { status: 403 });
  }
  const avatar = profile.avatarPhoto ?? profile.avatar_url ?? null;
  const result = await request('PUT', `/api/customers/${profile.id}`, {
    body: {
      first_name: profile.firstName, last_name: profile.lastName,
      avatar_url: avatar === '' ? null : avatar,
      address: profile.address ?? null,
      location: profile.location ?? null,
    }, token: session.token, signal,
  });
  if (result?.data?.id !== profile.id || typeof result.data.first_name !== 'string' || typeof result.data.last_name !== 'string') {
    throw new Error('Profilni yangilash javobi tasdiqlanmadi.');
  }
  try { return await loadCustomerProfile({ signal }); }
  catch (error) { error.profileSaved = true; throw error; }
}
