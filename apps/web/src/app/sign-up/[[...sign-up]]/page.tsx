import { SignUp } from "@clerk/nextjs";

import {
  AuthPageShell,
  AuthUnavailableNotice,
} from "@/components/auth-page-shell";
import styles from "@/components/clerk-auth-controls.module.css";
import { contributionLabel } from "@/lib/auth-copy";
import { authReturnLink, validateSignInReturnTo } from "@/lib/safe-return-to";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string | string[];
    returnTo?: string | string[];
    return_to?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const returnTo = validateSignInReturnTo(params.returnTo ?? params.redirectTo ?? params.return_to);
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const journeyLabel = contributionLabel(returnTo);
  const journeyHeading = configured ? journeyLabel : undefined;

  return (
    <AuthPageShell
      compact={configured}
      headingId="sign-up-heading"
      subtitle={journeyHeading ? undefined : (journeyLabel ?? "Create a VRDex account to claim a profile and publish events.")}
      title={journeyHeading ?? "Create account"}
      visuallyHiddenTitle={configured && !journeyHeading}
    >
      {configured ? (
        <SignUp
          appearance={{
            elements: {
              formFieldInput: styles.input,
              socialButtonsBlockButton: styles.socialButton,
            },
          }}
          fallbackRedirectUrl={returnTo}
          signInFallbackRedirectUrl={returnTo}
          signInUrl={authReturnLink("/sign-in", returnTo)}
        />
      ) : (
        <AuthUnavailableNotice />
      )}
    </AuthPageShell>
  );
}
