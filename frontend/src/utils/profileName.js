import { normalizeProfilePart } from "./profileIdentity.js";
// API profiles use snake_case. Browser-only profile forms still use camelCase.
// A person's display label is always derived from the two fields.
export function profileName(profile) {
  return [profile?.first_name ?? profile?.firstName, profile?.last_name ?? profile?.lastName]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => normalizeProfilePart(value)).join(" ");
}

export function authorName(author) {
  return author?.role === "salon" ? author.name || "" : profileName(author);
}
