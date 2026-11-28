/**
 * Shown when this environment has no auth credentials. Deliberately says nothing
 * about which provider is missing or that the cause is configuration — a visitor
 * cannot act on either, and neither belongs in product copy.
 *
 * Worded to read correctly under both headings it appears beneath: `/sign-in`
 * says "Sign in" and `/sign-up` says "Create account".
 *
 * Lives here rather than beside the component because `public-routes.snapshots`
 * matches on it to skip the pixel comparison, and a Playwright worker should not
 * have to load a React component tree to read one string.
 */
export const AUTH_UNAVAILABLE_COPY = "Accounts are temporarily unavailable.";
export const PROFILE_SUGGESTION_LABEL = "Suggest an edit";
export const PROFILE_SUGGESTION_QUERY = "?intent=suggest";

export function contributionLabel(returnTo: string) {
  const pathname = returnTo.split(/[?#]/, 1)[0] ?? "";

  if (pathname === "/submit") return "Add profile";
  if (pathname === "/events/new") return "Add event";
  if (/^\/claim\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) return "Claim profile";
  if (/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/edit$/.test(pathname)) return "Edit profile";
}
