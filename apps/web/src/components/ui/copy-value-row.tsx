"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function CopyValueRow({
  className,
  compact = false,
  actionOnly = false,
  children,
  label,
  value,
}: {
  className?: string;
  compact?: boolean;
  actionOnly?: boolean;
  children?: ReactNode;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  if (actionOnly) {
    const statusIcon = copied ? <Check aria-hidden="true" className="size-4 shrink-0" /> : <Copy aria-hidden="true" className="size-4 shrink-0" />;
    return (
      <button
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "gap-2", className)}
        type="button"
        onClick={() => void copyValue()}
      >
        {children ?? statusIcon}
        {children ? statusIcon : <span className="min-w-0 truncate">{copied ? `${label} copied` : `Copy ${label}`}</span>}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "grid min-w-0 gap-1 border-t border-border py-3 first:border-t-0",
        compact ? "w-fit max-w-full" : undefined,
        className,
      )}
    >
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <code
          className={cn(
            "min-w-0 break-all font-mono text-xs leading-5 text-foreground sm:text-sm",
            compact ? "flex-initial" : "flex-1",
          )}
          title={value}
        >
          {value}
        </code>
        <button
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "size-9 shrink-0 p-0")}
          title={copied ? `${label} copied` : `Copy ${label}`}
          type="button"
          onClick={() => void copyValue()}
        >
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </div>
  );
}
