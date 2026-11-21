// Public profile tabs remain bookmarkable without changing the booking draft query.
// Unknown tab values are ignored rather than interpreted as routes or actions.
export const PUBLIC_PROFILE_TABS = Object.freeze(["posts", "services", "hours", "reviews"]);

export function publicProfileTab(search = "") {
  const tab = new URLSearchParams(search).get("tab");
  return PUBLIC_PROFILE_TABS.includes(tab) ? tab : "services";
}

export function publicProfileTabLink(search = "", tab) {
  if (!PUBLIC_PROFILE_TABS.includes(tab)) throw new RangeError("Unknown public profile tab");
  const params = new URLSearchParams(search);
  params.set("tab", tab);
  return { search: `?${params}`, hash: "#bpv-content" };
}

export function publicPostAriaLabel(post) {
  const isVideo = post?.media?.[0]?.type === "video";
  const caption = typeof post?.caption === "string" ? post.caption.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  return `${isVideo ? "Videoni" : "Postni"} ochish${caption ? `: ${caption}` : ""}`;
}
