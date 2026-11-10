import { readCustomerProfile } from "../user/data/profile";

export function profileForSession(session, barberProfile) {
  if (!session) return {};
  return session.role === "customer" ? readCustomerProfile(session.phone) : barberProfile;
}

export function hasProfileName(profile) {
  return profile?.nameConfirmed === true && [profile?.firstName, profile?.lastName].every(
    (name) => typeof name === "string" && name.trim().length >= 2,
  );
}
