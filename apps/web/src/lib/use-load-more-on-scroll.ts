"use client";

import { useEffect, useRef } from "react";

export function useLoadMoreOnScroll(
  status: string,
  loadMore: (count: number) => void,
  count: number,
) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status !== "CanLoadMore" || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      loadMore(count);
    }, { rootMargin: "200px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [status, loadMore, count]);
  return sentinel;
}
