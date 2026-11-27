import { SignUp } from "@clerk/nextjs";

import {
  AuthPageShell,
  AuthUnavailableNotice,
} from "@/components/auth-page-shell";
import styles from "@/components/clerk-auth-controls.module.css";
import { validateSignInReturnTo } from "@/lib/safe-return-to";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const returnTo = validateSignInReturnTo(params.returnTo ?? params.redirectTo);
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <AuthPageShell
      compact={configured}
      headingId="sign-up-heading"
      subtitle="Create a VRDex account to claim a profile and publish events."
      title="Create account"
      visuallyHiddenTitle={configured}
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
          signInUrl="/sign-in"
        />
      ) : (
        <AuthUnavailableNotice />
      )}
    </AuthPageShell>
  );
}
