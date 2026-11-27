import { SignIn } from "@clerk/nextjs";

import {
  AuthPageShell,
  AuthUnavailableNotice,
} from "@/components/auth-page-shell";
import styles from "@/components/clerk-auth-controls.module.css";
import { validateSignInReturnTo } from "@/lib/safe-return-to";

function contributionLabel(returnTo: string) {
  const pathname = returnTo.split(/[?#]/, 1)[0] ?? "";

  if (pathname === "/submit") return "Add profile";
  if (pathname === "/events/new") return "Add event";
  if (/^\/claim\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) return "Claim profile";
  if (/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/edit$/.test(pathname)) return "Edit profile";
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

  return (
    <AuthPageShell
      compact={Boolean(journeyLabel)}
      headingId="sign-in-heading"
      subtitle={journeyHeading ? undefined : (journeyLabel ?? "Manage your VRDex profile and events.")}
      title={journeyHeading ?? "Sign in"}
    >
      {configured ? (
        <SignIn
          appearance={journeyHeading ? {
            elements: {
              formFieldInput: styles.input,
              socialButtonsBlockButton: styles.socialButton,
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
