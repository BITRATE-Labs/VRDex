"use client";

import type { ReactNode } from "react";
import { useFragmentBackFocus } from "./use-fragment-back-focus";
import { useProfileWorldReturn } from "./use-profile-world-return";

export function ProfileSectionNavigation({ className, children }: { className: string; children: ReactNode }) {
  const nav = useFragmentBackFocus<HTMLElement>({ focusAfterNativeHash: true });
  useProfileWorldReturn(nav);

  return <nav aria-label="Profile sections" className={className} ref={nav}>{children}</nav>;
}
