import Image from "next/image";
import Link from "next/link";
import styles from "./site-header.module.css";

import { buttonVariants } from "@/components/ui/button";
import { NavUtilities } from "@/components/ui/nav-utilities";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-12">
      <a
        className={buttonVariants({ className: "mt-2 min-h-11 w-fit not-focus:sr-only focus:flex", variant: "primary" })}
        href="#main-content"
      >
        Skip to content
      </a>
      <nav aria-label="Primary navigation" className="relative mx-auto flex min-h-16 max-w-none flex-wrap items-center gap-x-1.5 gap-y-3 py-2 min-[360px]:gap-x-3 text-sm">
        <Link className="inline-flex min-h-11 shrink-0 items-center rounded-control py-1 sm:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent" href="/">
          <Image alt="VRDex" className={`${styles.dark} h-auto w-24 min-[360px]:w-32`} height={132} priority src="/brand/vrdex-wordmark.svg" unoptimized width={469} />
          <Image alt="VRDex" className={`${styles.light} h-auto w-24 min-[360px]:w-32`} height={132} priority src="/brand/vrdex-wordmark-light.svg" unoptimized width={469} />
        </Link>
        <div className={`${styles.discoveryLinks} hidden items-center gap-3 sm:flex`}>
          <Link className={buttonVariants({ variant: "ghost" })} href="/discovery">Discovery</Link>
          <Link className={buttonVariants({ variant: "secondary" })} href="/submit">Add profile</Link>
        </div>
        <NavUtilities />
      </nav>
    </header>
  );
}
