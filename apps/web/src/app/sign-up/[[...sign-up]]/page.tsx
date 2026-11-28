import { SignUp } from "@clerk/nextjs";

import {
  AuthPageShell,
  AuthUnavailableNotice,
} from "@/components/auth-page-shell";
import { suggestionAppearance } from "@/components/clerk-auth-appearance";
import styles from "@/components/clerk-auth-controls.module.css";
import { fetchPublicProfileSuggestionName } from "@/convex/server";
import { contributionLabel, PROFILE_SUGGESTION_LABEL } from "@/lib/auth-copy";
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
  const suggestionName = await fetchPublicProfileSuggestionName(returnTo);
  const journeyLabel = suggestionName ? PROFILE_SUGGESTION_LABEL : contributionLabel(returnTo);
  const journeyHeading = configured || suggestionName ? journeyLabel : undefined;

  return (
    <AuthPageShell
      compact={configured}
      condensed={configured && Boolean(suggestionName)}
      headingId="sign-up-heading"
      integrated={configured && Boolean(suggestionName)}
      subtitle={suggestionName ?? (journeyHeading ? undefined : (journeyLabel ?? "Create a VRDex account to claim a profile and publish events."))}
      title={journeyHeading ?? "Create account"}
      visuallyHiddenTitle={configured && !journeyHeading}
    >
      {configured ? (
        <SignUp
          appearance={suggestionName ? suggestionAppearance : {
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
