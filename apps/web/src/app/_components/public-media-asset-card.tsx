"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicProfileMediaDetailsSchema, type PublicProfileMediaDetails, type PublicMediaActor } from "@vrdex/api-contracts";
import { MediaPreviewImage } from "./media-preview-image";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type PublicProfileAsset = PublicProfileMediaDetails["asset"];
type CardProps = { asset: PublicProfileAsset; label: string; featured?: boolean; compactOnMobile?: boolean };
export type PublicMediaDetailsState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "ready"; details: PublicProfileMediaDetails }
  | { kind: "unavailable" };

function safeCreditUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function publicDetailsSlug(asset: PublicProfileAsset): string | null {
  const match = asset.detailsUrl?.match(/^\/([^/#?]+)#media-(.+)$/);
  if (!match || match[2] !== asset.assetId) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}

function PublicActor({ actor }: { actor: PublicMediaActor | null }) {
  return actor ? <a className="break-words underline underline-offset-4" href={actor.profileUrl}>{actor.displayName}</a> : <span className="text-muted">Unavailable</span>;
}

function PublicEventTime({ at }: { at: number | null }) {
  if (at === null) return null;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return null;
  return <time className="text-xs text-muted" dateTime={date.toISOString()} suppressHydrationWarning>{date.toLocaleString()}</time>;
}

function MediaDetails({ state }: { state: PublicMediaDetailsState }) {
  switch (state.kind) {
    case "closed": return null;
    case "loading": return <p role="status" className="text-muted">Loading...</p>;
    case "unavailable": return <p role="status" className="text-muted">Unavailable</p>;
    case "ready": return <div className="grid gap-4">
      <dl className="grid gap-3">
        <div><dt className="text-xs text-muted">Uploaded by</dt><dd className="mt-1"><PublicActor actor={state.details.uploadedBy} /></dd></div>
        {state.details.credit ? <div><dt className="text-xs text-muted">Credit</dt><dd className="mt-1 whitespace-pre-wrap break-words">{state.details.credit}</dd></div> : null}
      </dl>
      <ol className="grid gap-3 border-t border-border pt-3">
        {state.details.history.map(event => <li className="grid gap-1" key={event.kind}>
          <span className="font-medium">{{ uploaded: "Uploaded", approved: "Approved", published: "Published" }[event.kind]}</span>
          <PublicActor actor={event.actor} />
          <PublicEventTime at={event.at} />
        </li>)}
      </ol>
    </div>;
  }
}

export function PublicMediaAssetCardView({ asset, label, featured = false, compactOnMobile = false, state, open, onOpenChange }: CardProps & {
  state: PublicMediaDetailsState;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const title = asset.label?.trim() || label;
  const creditUrl = safeCreditUrl(asset.creditUrl);
  const mimeType = asset.downloadMimeType ?? asset.mimeType;
  const byteSize = asset.downloadByteSize ?? asset.byteSize;
  const size = byteSize === undefined ? null : byteSize >= 1024 * 1024 ? `${(byteSize / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(byteSize / 1024))} KB`;
  const hasHistory = publicDetailsSlug(asset) !== null;
  const tiled = !featured;
  const compact = compactOnMobile && tiled;
  return <article id={`media-${asset.assetId}`} className={cn(
    "group grid min-w-0 scroll-mt-6 overflow-hidden rounded-card border border-border bg-surface-strong text-sm transition hover:-translate-y-0.5 hover:shadow-panel",
    featured && "lg:grid-cols-[18rem_minmax(0,1fr)]",
    tiled && "sm:row-span-4 sm:grid-rows-subgrid sm:gap-y-0 sm:pb-4",
    compact && "max-sm:grid-cols-[8.5rem_minmax(0,1fr)] max-sm:items-start",
  )}>
    <div className={cn(
      "relative bg-canvas-muted",
      featured ? "h-60 sm:h-72" : "aspect-[4/3]",
      compact && "max-sm:m-3 max-sm:aspect-square max-sm:overflow-hidden max-sm:rounded-control",
    )}>
      <MediaPreviewImage
        alt={asset.altText || title}
        className={cn("absolute inset-0 size-full object-contain", compact && "max-sm:[&:is(div)]:p-2 max-sm:[&_button]:mt-2")}
        src={asset.imageUrl ?? ""}
      />
    </div>
    <div className={cn("grid min-w-0 content-start p-4", tiled && "sm:contents", compact && "max-sm:contents")}>
      <div className={cn("grid min-w-0 gap-2", tiled && "sm:contents", compact && "max-sm:py-3 max-sm:pr-3")}>
        <div className={cn("contents", tiled && "sm:row-start-2 sm:grid sm:min-w-0 sm:content-start sm:gap-2 sm:px-4 sm:pt-4")}>
          <h3 className={cn("break-words font-medium", featured && "text-xl")}>{title}</h3>
          {asset.caption ? <p className="break-words leading-6 text-muted">{asset.caption}</p> : null}
        </div>
        <a aria-label={`Download ${title}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "mt-2 w-fit", tiled && "sm:row-start-3 sm:mx-4 sm:mt-4 sm:self-start")} download href={asset.downloadUrl}>Download</a>
      </div>
      {hasHistory || mimeType || size || creditUrl ? <details className={cn(
        "mt-5 min-w-0 border-t border-border pt-3",
        tiled && "sm:row-start-4 sm:mx-4 sm:self-start",
        compact && "max-sm:col-span-full max-sm:mx-3 max-sm:mt-0 max-sm:mb-3 max-sm:pt-2",
      )} open={open}>
        <summary onClick={onOpenChange ? event => { event.preventDefault(); onOpenChange(!open); } : undefined} className="cursor-pointer rounded-sm py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Details &amp; history</summary>
        {open ? <div className="grid gap-3 pt-4">
        <p className="text-xs text-muted">{[mimeType?.replace(/^image\//, "").replace("svg+xml", "svg").toUpperCase(), size].filter(Boolean).join(" / ")}</p>
        {creditUrl ? <a className="w-fit text-xs text-muted underline underline-offset-4" href={creditUrl}>View source</a> : null}
        {hasHistory ? <MediaDetails state={state} /> : null}
        </div> : null}
      </details> : null}
    </div>
  </article>;
}

function ConnectedPublicMediaAssetCard(props: CardProps) {
  const { asset } = props;
  const detailsSlug = publicDetailsSlug(asset);
  const [state, setState] = useState<PublicMediaDetailsState>({ kind: "closed" });
  const [open, setOpen] = useState(false);
  const requested = useRef(false);
  const load = useCallback(async () => {
    if (detailsSlug === null || !asset.assetId || requested.current) return;
    requested.current = true;
    setState({ kind: "loading" });
    try {
      const slug = detailsSlug;
      const response = await fetch(`/api/v0/profiles/${encodeURIComponent(slug)}/assets/${encodeURIComponent(asset.assetId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable");
      const details = PublicProfileMediaDetailsSchema.parse(await response.json());
      if (details.asset.assetId !== asset.assetId || details.profileSlug !== slug) throw new Error("Unavailable");
      setState({ kind: "ready", details });
    } catch { setState({ kind: "unavailable" }); }
  }, [asset.assetId, detailsSlug]);
  useEffect(() => {
    if (detailsSlug === null) return;
    const followAnchor = () => {
      if (window.location.hash === `#media-${asset.assetId}`) { setOpen(true); void load(); }
    };
    followAnchor();
    window.addEventListener("hashchange", followAnchor);
    return () => window.removeEventListener("hashchange", followAnchor);
  }, [asset.assetId, detailsSlug, load]);
  return <PublicMediaAssetCardView {...props} state={state} open={open} onOpenChange={expanded => {
    setOpen(expanded);
    if (expanded) void load();
  }} />;
}

export function PublicMediaAssetCard(props: CardProps) {
  return <ConnectedPublicMediaAssetCard key={`${props.asset.assetId}:${props.asset.detailsUrl ?? ""}`} {...props} />;
}
