"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect } from "react";

import { Button } from "@/components/ui/button";

export type ColorTheme = "dark" | "light";

const storageKey = "vrdex-theme";
let transitionTimeout: number | undefined;

function currentTheme(): ColorTheme {
  if (typeof document === "undefined") {
    return "dark";
  }

  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setDocumentTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function applyTheme(theme: ColorTheme) {
  setDocumentTheme(theme);
  window.localStorage.setItem(storageKey, theme);
}

function transitionToTheme(theme: ColorTheme) {
  const root = document.documentElement;

  root.dataset.themeTransition = "true";
  applyTheme(theme);

  if (transitionTimeout !== undefined) {
    window.clearTimeout(transitionTimeout);
  }

  transitionTimeout = window.setTimeout(() => {
    delete root.dataset.themeTransition;
    transitionTimeout = undefined;
  }, 700);
}

export function ThemeToggle({ className }: { className?: string }) {
  useLayoutEffect(() => {
    // A recovered Next.js 404 mounts the shell without executing its head script.
    const theme = document.documentElement.dataset.theme;
    if (theme === "light" || theme === "dark") return;

    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem(storageKey);
    } catch {
      // The document can still follow the browser when storage is unavailable.
    }
    setDocumentTheme(
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
    );
  }, []);

  return (
    <Button
      aria-label="Toggle color theme"
      className={className}
      size="md"
      title="Toggle color theme"
      type="button"
      variant="ghost"
      onClick={() => {
        const theme = currentTheme();
        const nextTheme = theme === "dark" ? "light" : "dark";
        transitionToTheme(nextTheme);
      }}
    >
      <Sun aria-hidden="true" className="theme-toggle__sun size-4" />
      <Moon aria-hidden="true" className="theme-toggle__moon size-4" />
    </Button>
  );
}
