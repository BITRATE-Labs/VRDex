export function isClerkDevelopmentStarting() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) return false;
  const clerk = (window as Window & { Clerk?: { loaded: boolean } }).Clerk;
  return !clerk?.loaded;
}
