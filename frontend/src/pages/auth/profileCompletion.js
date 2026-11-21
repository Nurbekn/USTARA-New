import { normalizeProfilePart, profilePartError } from "../../utils/profileIdentity.js";

export function profileForSession(session, barberProfile) {
  if (!session) return {};
  const profile = session.role === "barber" && hasProfileName(barberProfile)
    ? barberProfile : session.profile || {};
  return { ...profile,
    firstName: normalizeProfilePart(profile.firstName ?? profile.first_name),
    lastName: normalizeProfilePart(profile.lastName ?? profile.last_name),
  };
}

export function hasProfileName(profile) {
  return !profilePartError(profile?.firstName ?? profile?.first_name)
    && !profilePartError(profile?.lastName ?? profile?.last_name);
}
