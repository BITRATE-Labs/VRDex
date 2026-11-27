import { SignIn } from "@clerk/nextjs";

import {
  AuthPageShell,
  AuthUnavailableNotice,
} from "@/components/auth-page-shell";
import styles from "@/components/clerk-auth-controls.module.css";
import { fetchPublicProfileShareCardBySlug } from "@/convex/server";
import { cn } from "@/lib/cn";
import { validateSignInReturnTo } from "@/lib/safe-return-to";
import { validateSlugFormat } from "../../../../../../convex/_globalSlugs";

function contributionLabel(returnTo: string) {
  const pathname = returnTo.split(/[?#]/, 1)[0] ?? "";

  if (pathname === "/submit") return "Add profile";
  if (pathname === "/events/new") return "Add event";
  if (/^\/claim\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) return "Claim profile";
  if (/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/edit$/.test(pathname)) return "Edit profile";
}

async function contributionIdentity(returnTo: string) {
  const { pathname, searchParams } = new URL(returnTo, "https://return-to.vrdex.invalid");
  const claimSlug = /^\/claim\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(pathname)?.[1];
  const communities = searchParams.getAll("community");
  const communitySlug = pathname === "/events/new" && !searchParams.has("draft") && communities.length === 1
    ? communities[0]
    : undefined;
  const slug = claimSlug ?? communitySlug;
  if (!slug || !validateSlugFormat(slug).ok) return undefined;

  const { profile } = await fetchPublicProfileShareCardBySlug(slug);
  if (!profile) return undefined;
  if (claimSlug) {
    return profile.trustLabel === "unclaimed" || profile.trustLabel === "community_submitted"
      ? profile.displayName
      : undefined;
  }
  return profile.profileType === "community" ? profile.displayName : undefined;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const params = await searchParams;
  // Still validated locally rather than handed to Clerk unchecked, so an
  // attacker-supplied `returnTo` cannot bounce a signed-in user off-site.
  const returnTo = validateSignInReturnTo(params.returnTo ?? params.redirectTo);
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const journeyLabel = contributionLabel(returnTo);
  const journeyHeading = configured ? journeyLabel : undefined;
  const subtitle = journeyHeading
    ? await contributionIdentity(returnTo)
    : (journeyLabel ?? "Manage your VRDex profile and events.");

  return (
    <AuthPageShell
      compact={Boolean(journeyLabel)}
      headingId="sign-in-heading"
      integrated={Boolean(journeyHeading)}
      subtitle={subtitle}
      title={journeyHeading ?? "Sign in"}
    >
      {configured ? (
        <SignIn
          appearance={journeyHeading ? {
            elements: {
              rootBox: styles.journeyRoot,
              cardBox: styles.journeyCardBox,
              card: styles.journeyCard,
              header: styles.journeyHeader,
              formFieldInput: cn(styles.input, styles.journeyTarget),
              socialButtonsBlockButton: cn(styles.socialButton, styles.journeyTarget),
              formButtonPrimary: styles.journeyTarget,
            },
            variables: {
              borderRadius: "var(--radius-control)",
              colorBackground: "var(--surface-strong)",
              colorForeground: "var(--foreground)",
              colorInput: "var(--background)",
              colorInputForeground: "var(--foreground)",
              colorMutedForeground: "var(--muted)",
              colorPrimary: "var(--accent)",
              colorPrimaryForeground: "var(--inverse)",
            },
          } : undefined}
          fallbackRedirectUrl={returnTo}
          signUpFallbackRedirectUrl={returnTo}
          signUpUrl="/sign-up"
        />
      ) : (
        <AuthUnavailableNotice />
      )}
    </AuthPageShell>
  );
}
