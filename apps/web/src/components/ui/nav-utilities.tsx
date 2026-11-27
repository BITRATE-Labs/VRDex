"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect, useId, useRef, useState } from "react";

import { api } from "@convex-generated-api";
import { searchHref } from "@/app/_components/search-view-state";
import {
  type SearchSuggestion,
  useSearchSuggestions,
} from "@/app/_components/use-search-suggestions";
import { buttonVariants } from "@/components/ui/button";
import { EntityImage } from "@/components/ui/entity-image";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/cn";
import { captureProductEvent } from "@/lib/posthog";
import styles from "./site-header.module.css";

const convexEnabled = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

/**
 * One height for every nav control, including the loading placeholder.
 *
 * The account control resolved from a 40px skeleton to a 42px chip, which moved
 * the nav border and every route below it once auth settled. Sizing by content
 * is what let that happen, so these are sized by the row instead.
 */
const NAV_CONTROL_HEIGHT = "h-11 py-0 sm:h-10";
const MOBILE_ACCOUNT_WIDTH = "max-sm:w-20";
type HeaderPanel = "search" | "menu";

function NavSearchPanel({ id, onClose }: { id: string; onClose: (restoreFocus?: boolean) => void }) {
  const posthog = usePostHog();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const { activeIndex, setActiveIndex, suggestions } = useSearchSuggestions(query, "all");

  function selectSuggestion(result: SearchSuggestion) {
    captureProductEvent(posthog, "search_result_clicked", {
      entity_type: result.entityType,
      profile_type: result.profileType,
      surface: "nav",
    });
    onClose();
    router.push(result.routePath);
  }

  return (
    <form
      action="/search"
      className={cn(styles.mobilePanel, "sm:order-first sm:min-w-0")}
      id={id}
      onSubmit={(event) => {
        event.preventDefault();
        if (!query.trim()) return;
        onClose();
        router.push(searchHref({ query }));
      }}
    >
      <input
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={suggestions.length > 0 ? listboxId : undefined}
        aria-expanded={suggestions.length > 0}
        aria-label="Search VRDex"
        autoFocus
        className="h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3 text-sm text-foreground opacity-100 outline-none placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 sm:h-10 sm:w-64 sm:transition-[width,opacity] sm:duration-200 sm:starting:w-0 sm:starting:opacity-0"
        enterKeyHint="search"
        name="q"
        placeholder="Search..."
        role="combobox"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose(true);
            return;
          }
          if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % suggestions.length);
            return;
          }
          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            setActiveIndex((current) => current <= 0 ? suggestions.length - 1 : current - 1);
            return;
          }
          if (event.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
            event.preventDefault();
            selectSuggestion(suggestions[activeIndex]);
          }
        }}
      />
      {suggestions.length > 0 ? (
        <div
          className="mt-2 grid overflow-y-auto rounded-card border border-border bg-surface-strong sm:absolute sm:inset-x-0 sm:top-full sm:z-50 sm:max-h-[calc(100dvh-10rem)] sm:shadow-panel"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((result, index) => (
            <button
              aria-selected={activeIndex === index}
              className={cn(
                "grid min-h-11 gap-1 px-4 py-3 text-left hover:bg-surface-elevated",
                activeIndex === index && "bg-surface-elevated",
              )}
              id={`${listboxId}-${index}`}
              key={`${result.entityType}:${result.slug}`}
              ref={activeIndex === index ? (element) => element?.scrollIntoView({ block: "nearest" }) : undefined}
              role="option"
              tabIndex={-1}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(result)}
            >
              <span className="font-medium">{result.title}</span>
              <span className="text-xs text-muted">{result.subtitle ?? result.entityType}</span>
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}

function NavSearch({ isOpen, onOpen, onClose }: { isOpen: boolean; onOpen: () => void; onClose: () => void }) {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function close(restoreFocus = false) {
    if (restoreFocus) toggleRef.current?.focus();
    onClose();
  }

  return (
    <div
      className={cn("flex min-w-0 items-center", styles.quickSearch)}
      data-header-panel="search"
      ref={containerRef}
      onBlur={(event) => {
        if (!isOpen || event.currentTarget.contains(event.relatedTarget)) return;
        if (event.relatedTarget) {
          close();
          return;
        }
        // A touch suggestion can blur the input before its click.
        const panel = document.getElementById(panelId);
        window.setTimeout(() => {
          if (panel?.isConnected && !containerRef.current?.contains(document.activeElement)) close();
        }, 100);
      }}
    >
      <button
        aria-controls={isOpen ? panelId : undefined}
        aria-expanded={isOpen}
        aria-label="Search"
        className={cn(buttonVariants({ variant: "ghost" }), "size-11 shrink-0 p-0 sm:size-10")}
        ref={toggleRef}
        title="Search"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => isOpen ? close(true) : onOpen()}
      >
        <Search aria-hidden="true" className="size-4" />
      </button>
      {isOpen ? <NavSearchPanel id={panelId} onClose={close} /> : null}
    </div>
  );
}

function SignedOutControl() {
  return (
    <Link className={cn(buttonVariants({ variant: "secondary" }), NAV_CONTROL_HEIGHT, MOBILE_ACCOUNT_WIDTH, "whitespace-normal leading-tight")} href="/sign-in">
      Sign in
    </Link>
  );
}

function ConnectedAccountControl({ showMyEvents }: { showMyEvents: boolean }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.accounts.viewer, isAuthenticated ? {} : "skip");

  if (isLoading) {
    return (
      <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center sm:w-24", NAV_CONTROL_HEIGHT, MOBILE_ACCOUNT_WIDTH)}>
        <span className="h-2 w-9 rounded bg-muted/30" />
      </span>
    );
  }

  if (!isAuthenticated) {
    return <SignedOutControl />;
  }

  const label = viewer?.user.name ?? viewer?.user.email ?? "Account";

  return (
    <>
    {showMyEvents ? <Link className={cn(buttonVariants({ variant: "ghost" }), NAV_CONTROL_HEIGHT, "hidden sm:inline-flex")} href="/account/events">My events</Link> : null}
    <Link
      aria-label="Account"
      className={cn(buttonVariants({ variant: "secondary" }), NAV_CONTROL_HEIGHT, MOBILE_ACCOUNT_WIDTH, "gap-2 px-1.5 sm:pr-3")}
      href="/account"
    >
      <EntityImage alt="" className="size-7 rounded-control" label={label} sizes="28px" src={viewer?.user.image} />
      <span className="hidden sm:inline">Account</span>
    </Link>
    </>
  );
}

function AccountControl({ mode, showMyEvents }: { mode: "auto" | "signed-out"; showMyEvents: boolean }) {
  return mode === "auto" && convexEnabled ? <ConnectedAccountControl showMyEvents={showMyEvents} /> : <SignedOutControl />;
}

const menuItem = cn(buttonVariants({ variant: "ghost" }), "min-h-11 w-full justify-start whitespace-normal text-left");

function MobileMyEvents({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { isAuthenticated } = useConvexAuth();
  const href = "/account/events";

  return isAuthenticated ? <Link className={menuItem} href={href} onNavigate={() => onNavigate(href)}>My events</Link> : null;
}

function HeaderControls({ accountMode, pathname, showMyEvents }: { accountMode: "auto" | "signed-out"; pathname: string; showMyEvents: boolean }) {
  const [panel, setPanel] = useState<HeaderPanel | null>(null);
  const menuId = useId();
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!panel) return;

    function handleOutsidePress(event: PointerEvent) {
      if (event.target instanceof Element && !event.target.closest(`[data-header-panel="${panel}"]`)) setPanel(null);
    }

    const desktop = window.matchMedia("(min-width: 40rem)");
    function closePanel() { setPanel(null); }

    document.addEventListener("pointerdown", handleOutsidePress);
    desktop.addEventListener("change", closePanel);
    window.addEventListener("popstate", closePanel);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePress);
      desktop.removeEventListener("change", closePanel);
      window.removeEventListener("popstate", closePanel);
    };
  }, [panel]);

  function closeMenu() { setPanel((current) => current === "menu" ? null : current); }

  function navigateFromMenu(href: string) {
    if (href === pathname) menuToggleRef.current?.focus();
    closeMenu();
  }

  return (
    <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 sm:relative sm:flex-nowrap">
      <NavSearch
        isOpen={panel === "search"}
        onOpen={() => setPanel("search")}
        onClose={() => setPanel((current) => current === "search" ? null : current)}
      />
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle className="hidden size-10 p-0 sm:inline-flex" />
        <AccountControl mode={accountMode} showMyEvents={showMyEvents} />
      </div>
      <div
        className={cn("sm:hidden", styles.menu)}
        data-header-panel="menu"
        onBlur={(event) => {
          const menu = event.currentTarget;
          if (panel !== "menu" || menu.contains(event.relatedTarget)) return;
          if (event.relatedTarget) {
            closeMenu();
            return;
          }
          // A touch link can blur the trigger before its click.
          const openPanel = document.getElementById(menuId);
          window.setTimeout(() => {
            if (openPanel?.isConnected && !menu.contains(document.activeElement)) closeMenu();
          }, 100);
        }}
        onKeyDown={(event) => {
          if (panel !== "menu" || event.key !== "Escape") return;
          event.preventDefault();
          menuToggleRef.current?.focus();
          closeMenu();
        }}
      >
        <button
          aria-controls={panel === "menu" ? menuId : undefined}
          aria-expanded={panel === "menu"}
          className={cn(buttonVariants({ variant: "ghost" }), "size-11 p-0")}
          ref={menuToggleRef}
          type="button"
          onClick={(event) => {
            if (panel === "menu") {
              closeMenu();
            } else {
              event.currentTarget.focus();
              setPanel("menu");
            }
          }}
        >
          Menu
        </button>
        {panel === "menu" ? (
          <div className={styles.mobilePanel} id={menuId}>
            <Link className={menuItem} href="/discovery" onNavigate={() => navigateFromMenu("/discovery")}>Discovery</Link>
            <Link className={menuItem} href="/submit" onNavigate={() => navigateFromMenu("/submit")}>Add profile</Link>
            {showMyEvents && accountMode === "auto" && convexEnabled ? <MobileMyEvents onNavigate={navigateFromMenu} /> : null}
            <ThemeToggle className="min-h-11 min-w-11 justify-start gap-2 px-4 after:content-['Theme']" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NavUtilities({ accountMode = "auto", showMyEvents = true }: { accountMode?: "auto" | "signed-out"; showMyEvents?: boolean }) {
  const pathname = usePathname();

  return <HeaderControls key={pathname} accountMode={accountMode} pathname={pathname} showMyEvents={showMyEvents} />;
}
