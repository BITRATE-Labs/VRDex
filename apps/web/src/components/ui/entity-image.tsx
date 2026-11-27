"use client";

import Image from "next/image";
import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { safeImageUrl } from "@/lib/safe-image";

function initialsFor(label: string): string {
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "VR"
  );
}

function EntityImageContent({
  alt,
  fallback,
  ...imageProps
}: Pick<ComponentPropsWithoutRef<typeof Image>, "alt" | "className" | "priority" | "sizes" | "src"> & {
  fallback: ReactNode;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");

  if (status === "failed") return fallback;

  return (
    <>
      {status === "loading" ? <span aria-hidden="true">{fallback}</span> : null}
      <Image
        {...imageProps}
        alt={alt}
        className={cn(imageProps.className, status === "loading" && "opacity-0")}
        fill
        unoptimized
        onError={() => setStatus("failed")}
        onLoad={() => setStatus("loaded")}
      />
    </>
  );
}

export function EntityImage({
  alt,
  className,
  fallback,
  imageClassName,
  label,
  priority,
  sizes,
  src,
  ...props
}: Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  alt?: string;
  className?: string;
  fallback?: ReactNode;
  imageClassName?: string;
  label: string;
  priority?: boolean;
  sizes?: string;
  src?: string | null;
}) {
  const imageUrl = safeImageUrl(src ?? undefined);
  const fallbackContent = fallback ?? initialsFor(label);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-strong text-sm font-semibold text-muted",
        className,
      )}
      {...props}
      aria-hidden={alt === "" ? true : props["aria-hidden"]}
    >
      {imageUrl ? (
        <EntityImageContent
          alt={alt ?? label}
          className={cn("object-cover", imageClassName)}
          fallback={fallbackContent}
          key={imageUrl}
          priority={priority}
          sizes={sizes}
          src={imageUrl}
        />
      ) : (
        fallbackContent
      )}
    </span>
  );
}
