import type { ReactNode } from "react";
import { HomeLiveNow } from "./home-live-now";
import type { LiveEntry } from "../../../../../convex/eventLive";
import styles from "./home-browse.module.css";
import { HomeBrowseProvider } from "./home-browse-provider";
import { HomeDiscovery } from "./discovery/home-discovery";
import { HomeSchedule } from "./timeline/home-schedule";

import { PublicSearchControl } from "./public-search-control";
import { PageContainer, PageShell } from "@/components/ui/page-shell";

export function HomeSearchPage({ initialLiveEntries = [], beforeSchedule }: { initialLiveEntries?: LiveEntry[]; beforeSchedule?: ReactNode } = {}) {
  return (
    <PageShell>
      <PageContainer className={styles.home} max="7xl">
        <header className={styles.searchRow}>
          <h1 className={styles.searchHeading}>DJs, clubs &amp; events</h1>
          <PublicSearchControl action="/search" surface="home" tone="default" />
        </header>
        <HomeBrowseProvider>
          {beforeSchedule ?? <HomeLiveNow initialEntries={initialLiveEntries} />}
          <HomeSchedule />
          <HomeDiscovery />
        </HomeBrowseProvider>
      </PageContainer>
    </PageShell>
  );
}
