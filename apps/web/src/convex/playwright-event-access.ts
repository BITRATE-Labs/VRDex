export const playwrightGuestEventSlugs = {
  watch: "playwright-afterglow-watch-room-guest",
  listed: "playwright-afterglow-harbor-sessions-guest",
  sparseDate: "playwright-date-only-sparse-guest",
  watchWithoutPoster: "playwright-watch-without-poster-guest",
};

export function isPlaywrightGuestEventFixture(slug: string): boolean {
  return Object.values(playwrightGuestEventSlugs).includes(slug);
}
