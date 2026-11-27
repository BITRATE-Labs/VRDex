import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ProfileEditForm } from "../../_components/profile-edit-form";
import { ProfilePrivateRecord } from "../../_components/profile-private-record";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { fetchPublicProfileSuggestionName } from "@/convex/server";
import { PROFILE_SUGGESTION_LABEL, PROFILE_SUGGESTION_QUERY } from "@/lib/auth-copy";
import { protectedRouteSignInPath } from "@/lib/protected-route-redirect";

export const dynamic = "force-dynamic";

type ProfileEditPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    intent?: string | string[];
    section?: string | string[];
  }>;
};

// One route for both profile kinds, because the slug already decides which one it
// is. The `/p/` and `/c/` editors this replaced each passed their route's type down
// so the queries could refuse a mismatch -- `/p/<community-slug>/edit` resolved the
// community and then sent the writer back to a `/p/` path that 404s. With profiles
// served from the root there is no route-claimed type left to disagree with the
// record, so the type is simply read off the profile and both queries are called
// without one.
export default async function ProfileEditPage({ params, searchParams }: ProfileEditPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const profilePath = `/${slug}`;
  const editPath = `${profilePath}/edit`;
  const mediaContributionFocus = query.section === "media";
  const suggestionPath = `${editPath}${PROFILE_SUGGESTION_QUERY}`;
  const suggestionName = query.intent === "suggest" && query.section === undefined
    ? await fetchPublicProfileSuggestionName(suggestionPath)
    : undefined;
  const returnTo = suggestionName
    ? suggestionPath
    : `${editPath}${mediaContributionFocus ? "?section=media#media-contributions" : ""}`;

  // Match middleware's Clerk setup so fixture and unconfigured builds retain the editor gate.
  if (suggestionName && process.env.NEXT_PUBLIC_CONVEX_URL && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const { isAuthenticated } = await auth();
    if (!isAuthenticated) redirect(protectedRouteSignInPath(returnTo));
  }
  const mediaContributionsEnabled =
    process.env.VRDEX_PROFILE_MEDIA_SUBMISSIONS_ENABLED === "true" ||
    process.env.VRDEX_ENABLE_PLAYWRIGHT_FIXTURES === "true";

  return (
    <PageShell>
      <PageContainer max="3xl">

        <section className="border-t border-border pt-8 sm:pt-10">
          <h1 className="text-3xl leading-tight font-semibold sm:text-4xl">
            {suggestionName ? PROFILE_SUGGESTION_LABEL : "Edit profile"}
          </h1>
          {suggestionName ? <p className="mt-2 text-sm text-muted [overflow-wrap:anywhere]">{suggestionName}</p> : null}

          <div className="mt-8">
            <ProfileEditForm
              mediaKitGalleryEnabled={process.env.VRDEX_PROFILE_MEDIA_KIT_ENABLED === "true" || process.env.VRDEX_ENABLE_PLAYWRIGHT_FIXTURES === "true"}
              mediaContributionFocus={mediaContributionFocus}
              mediaContributionsEnabled={mediaContributionsEnabled}
              profilePath={profilePath}
              returnTo={returnTo}
              slug={slug}
            />
          </div>
        </section>

        {/*
          The record's other mount is the public profile page, which `notFound()`s
          before rendering when a profile is draft-private, opted out, or suppressed
          -- so the owners whose record has no public page at all, accepted concierge
          handoffs among them, were the ones who could not reach it. This route does
          not gate on publication state and is already the owner's, so it reaches
          exactly them. Renders nothing for anyone the query refuses.
        */}
        <ProfilePrivateRecord profilePath={profilePath} slug={slug} />
      </PageContainer>
    </PageShell>
  );
}
