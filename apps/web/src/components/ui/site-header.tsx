import Image from "next/image";
import Link from "next/link";
import styles from "./site-header.module.css";

import { buttonVariants } from "@/components/ui/button";
import { NavUtilities } from "@/components/ui/nav-utilities";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-12">
      <nav aria-label="Primary navigation" className="mx-auto flex min-h-16 max-w-none flex-wrap items-center gap-3 py-2 text-sm">
        <Link className="inline-flex shrink-0 items-center rounded-control py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent" href="/">
          <Image alt="VRDex" className={`${styles.dark} h-auto w-32`} height={132} priority src="/brand/vrdex-wordmark.svg" unoptimized width={469} />
          <Image alt="VRDex" className={`${styles.light} h-auto w-32`} height={132} priority src="/brand/vrdex-wordmark-light.svg" unoptimized width={469} />
        </Link>
        <div className="order-last flex w-full items-center gap-3 sm:order-none sm:w-auto">
          <Link className={buttonVariants({ variant: "ghost" })} href="/discovery">Discovery</Link>
          <Link className={buttonVariants({ variant: "secondary" })} href="/submit">Add profile</Link>
        </div>
        <NavUtilities />
      </nav>
    </header>
  );
}
