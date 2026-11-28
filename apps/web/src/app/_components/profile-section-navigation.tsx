"use client";

import type { ReactNode } from "react";
import { useFragmentBackFocus } from "./use-fragment-back-focus";

export function ProfileSectionNavigation({ className, children }: { className: string; children: ReactNode }) {
  const nav = useFragmentBackFocus<HTMLElement>();

  return <nav aria-label="Profile sections" className={className} ref={nav}>{children}</nav>;
}
