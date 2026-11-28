"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { Search, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { EntityImage } from "@/components/ui/entity-image";
import { ProfileAvatarImage } from "@/components/ui/profile-avatar-image";
import { cn } from "@/lib/cn";
import { isClerkDevelopmentStarting } from "@/lib/clerk-startup-navigation";
import { restoreInitialInlineSearch } from "@/lib/initial-inline-search";
import { captureProductEvent } from "@/lib/posthog";
import { type SearchSuggestion, useSearchSuggestions } from "./use-search-suggestions";
import { searchHref, type SearchResultFilter } from "./search-view-state";
import styles from "./public-search-control.module.css";

type PublicSearchControlProps = {
  action?: string;
  className?: string;
  compact?: boolean | "mobile";
  defaultQuery?: string;
  filter?: SearchResultFilter;
  inputId?: string;
  iconSubmit?: boolean;
  placeholder?: string;
  surface?: "home" | "search";
  tone?: "default" | "inverse";
};

// URL query changes remount editing state, including selection and requests.
export function PublicSearchControl(props: PublicSearchControlProps) {
  return <SearchControl key={props.defaultQuery ?? ""} {...props} />;
}

export function EditPublicSearchLink({ inputId }: { inputId: string }) {
  return (
    <a
      className={cn(buttonVariants({ size: "sm", variant: "primary" }), "mt-1 min-h-11")}
      href={`#${inputId}`}
      onClick={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const input = document.getElementById(inputId);
        if (!(input instanceof HTMLInputElement)) return;
        event.preventDefault();
        input.focus({ preventScroll: true });
        input.setSelectionRange(0, input.value.length);
        requestAnimationFrame(() => {
          if (document.activeElement !== input) return;
          const viewport = window.visualViewport;
          const viewportTop = viewport?.offsetTop ?? 0;
          const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
          const headerBottom = document.querySelector("[data-site-header]")?.getBoundingClientRect().bottom ?? 0;
          const visibleTop = Math.max(viewportTop, headerBottom);
          const field = input.getBoundingClientRect();
          if (field.top < visibleTop || field.bottom > viewportBottom) {
            const fieldCenter = (field.top + field.bottom) / 2;
            const visibleCenter = (visibleTop + viewportBottom) / 2;
            window.scrollBy({ top: fieldCenter - visibleCenter, behavior: "instant" });
          }
        });
      }}
    >
      Edit search
    </a>
  );
}

function SearchControl({
  action = "/search", className, compact, defaultQuery, filter = "all", iconSubmit = false, inputId, placeholder = "Search people, communities, worlds, events...", surface = "search", tone = "inverse",
}: PublicSearchControlProps) {
  const posthog = usePostHog();
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const connectInput = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    if (!input) return;
    restoreInitialInlineSearch(input);
    // A server-rendered field can already contain edits when React attaches.
    setQuery(input.value);
    if (document.activeElement === input) setIsOpen(true);
  }, []);
  const listboxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const { activeIndex, reset, setActiveIndex, suggestions } = useSearchSuggestions(query, filter, {
    skipWhenEqualTo: defaultQuery,
  });
  const preview = suggestions.slice(0, 5);
  const expanded = isOpen && preview.length > 0;
  const selectedIndex = expanded && activeIndex < preview.length ? activeIndex : -1;
  const isInverse = tone === "inverse";
  const trimmedQuery = query.trim();
  const hasQueryDraft = Boolean(defaultQuery && trimmedQuery !== defaultQuery.trim());
  const hasPendingQuery = surface === "search" && hasQueryDraft && Boolean(trimmedQuery);
  const resultHref = (value: string) => searchHref({ query: value, filter }).replace(/^\/search/, action);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const listbox = listboxRef.current;
    const option = listbox?.children.item(selectedIndex);
    if (!listbox || !option || listbox.scrollHeight <= listbox.clientHeight) return;

    const bounds = listbox.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < bounds.top) listbox.scrollTop += row.top - bounds.top;
    else if (row.bottom > bounds.bottom) listbox.scrollTop += row.bottom - bounds.bottom;
  }, [selectedIndex]);

  function dismiss() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function captureSubmission(value: string) {
    if (value.trim()) captureProductEvent(posthog, "search_submitted", { surface, view_key: "standard" });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The browser can accept input before React hydrates the form.
    const field = new FormData(event.currentTarget).get("q");
    const submittedQuery = typeof field === "string" ? field : "";
    captureSubmission(submittedQuery);
    dismiss();
    const destination = resultHref(submittedQuery);
    // Clerk's development setup can replace history before an in-app navigation commits.
    if (isClerkDevelopmentStarting()) window.location.assign(destination);
    else router.push(destination);
  }

  function selectSuggestion(result: SearchSuggestion) {
    captureProductEvent(posthog, "search_result_clicked", {
      entity_type: result.entityType, profile_type: result.profileType, surface,
    });
    dismiss();
    reset();
    router.push(result.routePath);
  }

  return (
    <form
      action={action}
      className={cn("relative flex flex-col gap-3 sm:flex-row", compact && "flex-row gap-2 sm:gap-3", styles.searchForm, compact === "mobile" && styles.homeSearch, className)}
      data-search-draft={hasQueryDraft ? "" : undefined}
      method="get"
      onSubmit={onSubmit}
    >
      <div className="min-w-0 flex-1 sm:relative" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) dismiss();
      }}>
        <div className="relative">
          <input
            aria-activedescendant={selectedIndex >= 0 ? `${listboxId}-${selectedIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls={expanded ? listboxId : undefined}
            aria-expanded={expanded}
            aria-label="Search VRDex"
            autoComplete="off"
            className={cn(
              "w-full rounded-control border pr-12 pl-5 text-base outline-none focus-visible:ring-2",
              inputId && "scroll-mt-24",
              compact === true ? "min-h-11 py-2" : "min-h-14 py-3",
              compact === "mobile" && "max-sm:min-h-11 max-sm:py-2",
              compact && "max-sm:pr-11 max-sm:pl-3",
              isInverse
                ? "border-white/25 bg-white/16 text-white placeholder:text-white/62 focus:border-white/70 focus-visible:ring-white/25"
                : "border-border bg-surface text-foreground placeholder:text-muted focus:border-accent focus-visible:ring-accent/20",
            )}
            id={inputId}
            data-inline-search
            name="q"
            placeholder={placeholder}
            ref={connectInput}
            role="combobox"
            defaultValue={defaultQuery ?? ""}
            onChange={(event) => {
              if (event.currentTarget.value.trim() !== query.trim()) reset();
              else setActiveIndex(-1);
              setQuery(event.currentTarget.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              if (event.key === "Escape") {
                event.preventDefault();
                dismiss();
              } else if (event.key === "ArrowDown" && preview.length > 0) {
                event.preventDefault();
                setIsOpen(true);
                setActiveIndex((current) => (current + 1) % preview.length);
              } else if (event.key === "ArrowUp" && preview.length > 0) {
                event.preventDefault();
                setIsOpen(true);
                setActiveIndex((current) => current <= 0 ? preview.length - 1 : current - 1);
              } else if (event.key === "Enter" && selectedIndex >= 0 && preview[selectedIndex]) {
                event.preventDefault();
                selectSuggestion(preview[selectedIndex]);
              }
            }}
          />
          {query ? (
            <button
              aria-label="Clear search"
              className={cn("absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-control focus-visible:ring-2 focus-visible:ring-focus", isInverse ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground")}
              type="button"
              onClick={() => {
                reset();
                setQuery("");
                dismiss();
                const input = inputRef.current;
                if (input) {
                  input.value = "";
                  input.focus();
                }
              }}
            ><X aria-hidden="true" className="size-4" /></button>
          ) : null}
        </div>
        {expanded ? (
          <div className="absolute inset-x-0 z-30 mt-2 overflow-hidden rounded-card border border-border bg-surface-strong text-foreground shadow-panel">
            <div
              aria-label="Search suggestions"
              className="max-sm:max-h-[clamp(5rem,calc(100dvh-16rem),24rem)] max-sm:overflow-y-auto max-sm:overscroll-contain"
              id={listboxId}
              ref={listboxRef}
              role="listbox"
              tabIndex={-1}
            >
              {preview.map((result, index) => {
                const label = result.entityType === "profile"
                  ? result.profileType === "person" ? "Person" : "Community"
                  : result.entityType === "event" ? "Event" : "World";
                const trust = result.trustLabel === "community_submitted" ? "Community submitted"
                  : result.trustLabel === "unclaimed" ? "Unclaimed"
                  : result.trustLabel === "claimed_verified" ? "Verified profile" : null;
                const logoOnly = !result.profileImageUrl && Boolean(result.logoImageUrl);
                const imageUrl = result.profileImageUrl ?? result.imageUrl ?? result.logoImageUrl;
                return (
                  <button
                    aria-selected={selectedIndex === index}
                    className={cn("grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] content-center items-center gap-x-2 px-4 py-2.5 text-left hover:bg-surface-elevated sm:flex sm:gap-3", selectedIndex === index ? "bg-accent/15 shadow-[inset_3px_0_0_var(--accent)] hover:bg-accent/15" : undefined)}
                    id={`${listboxId}-${index}`}
                    key={`${result.entityType}:${result.slug}`}
                    role="option"
                    tabIndex={-1}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(result)}
                  >
                    <span className={cn("shrink-0", trust && "row-span-2")}>
                      {result.entityType === "profile" && !logoOnly ? (
                        <ProfileAvatarImage alt="" appearance={result.avatarAppearance} className="size-9 rounded-control" label={result.title} sizes="36px" src={imageUrl} />
                      ) : (
                        <EntityImage alt="" className="size-9 rounded-control border border-border-strong bg-surface text-foreground" imageClassName={logoOnly ? "object-contain" : undefined} label={result.title} sizes="36px" src={imageUrl} />
                      )}
                    </span>
                    <span className="contents sm:block sm:min-w-0 sm:flex-1">
                      <span className={cn("line-clamp-2 wrap-anywhere font-medium sm:block sm:truncate", trust && "col-span-2")}>{result.title}</span>
                      {trust ? <span className="col-start-2 row-start-2 block text-xs font-medium text-foreground/85 sm:truncate">{trust}</span> : null}
                    </span>
                    <span className={cn("col-start-3 shrink-0 text-xs font-medium text-foreground/75", trust ? "row-start-2" : "row-start-1")}>{label}</span>
                  </button>
                );
              })}
            </div>
            <Link
              className="block border-t border-border px-4 py-3 text-sm font-medium text-foreground underline underline-offset-4 hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus"
              href={resultHref(query)}
              onMouseDown={(event) => {
                // Keep the input focused until the link receives its click.
                if (event.button === 0) event.preventDefault();
              }}
              onClick={() => { captureSubmission(query); dismiss(); }}
            >
              View all results
            </Link>
          </div>
        ) : null}
      </div>
      {filter === "all" ? null : <input name="type" type="hidden" value={filter} />}
      <button
        className={cn(
          compact === true
            ? cn(
              buttonVariants({ size: "sm", variant: hasPendingQuery ? "primary" : "surface" }),
              "min-h-11 shrink-0",
              hasPendingQuery && "border border-transparent",
              iconSubmit ? "w-11 p-0" : "max-sm:w-11 max-sm:p-0 sm:px-4",
            )
            : cn(buttonVariants({ size: "lg", variant: isInverse ? "inversePrimary" : "primary" }), "min-h-14 font-semibold", iconSubmit ? "w-14 shrink-0 p-0" : "px-6"),
          compact === "mobile" && "max-sm:min-h-11 max-sm:w-11 max-sm:shrink-0 max-sm:p-0",
        )}
        type="submit"
      >
        {compact || iconSubmit ? <Search aria-hidden="true" className={cn("size-5", !iconSubmit && "sm:hidden")} /> : null}
        <span className={iconSubmit ? "sr-only" : compact ? "max-sm:sr-only" : undefined}>Search VRDex</span>
      </button>
    </form>
  );
}
