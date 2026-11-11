import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

import { cn } from "@/lib/cn";

// `pl-3.5` rather than `pl-4`: 16px sat far enough off the border to read as an
// indent. Shared by all three controls so a select and the input beside it still
// line up.
// `w-full min-w-0` is load-bearing, not decoration. A grid item defaults to
// `min-width: auto`, so a control wide enough at its intrinsic minimum — a
// select is as wide as its longest option, and these have sentence-length ones —
// sizes its track past the container instead of shrinking. On a phone that ran
// every field off the right edge of its card and under the edge of the screen.
const fieldControlClassName =
  "w-full min-w-0 rounded-control border border-border bg-surface-strong pl-3.5 pr-4 py-3 font-normal outline-none transition placeholder:text-muted/65 focus:border-accent focus-visible:ring-2 focus-visible:ring-focus";

export function Field({ children, className }: { children: ReactNode; className?: string }) {
  // Same reason: the label is itself the grid item in most of these layouts, so
  // it has to be allowed to shrink before the control inside it can.
  return (
    <label className={cn("grid min-w-0 gap-2 text-sm font-medium", className)}>{children}</label>
  );
}

export function FieldText({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("text-xs leading-5 text-muted", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">) {
  return <input className={cn(fieldControlClassName, className)} {...props} />;
}

// `ref` added explicitly rather than by switching to `ComponentProps`, which
// resolves `onChange` differently and loses event inference at every other call
// site. React 19 passes `ref` as an ordinary prop; the profile switcher needs
// one so focus can be moved to it when the profile it names disappears.
export function Select({
  className,
  style,
  ...props
}: ComponentPropsWithoutRef<"select"> & { ref?: Ref<HTMLSelectElement> }) {
  return <select className={cn(fieldControlClassName, "pr-10", className)} style={{
    appearance: "none",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%238795a5' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    backgroundPosition: "right 12px center",
    backgroundSize: "16px 16px",
    backgroundRepeat: "no-repeat",
    ...style,
  }} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn(fieldControlClassName, className)} {...props} />;
}

/**
 * A checkbox and its label as one control.
 *
 * Not `Field`: that stacks its children in a grid, which puts a checkbox above
 * its own text. These read across.
 */
export function CheckboxField({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"input"> & { children: ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-control border border-border bg-surface-strong px-3 py-2 text-sm font-normal transition hover:border-border-strong has-checked:border-accent",
        className,
      )}
    >
      <input
        className="size-4 accent-accent focus-visible:ring-2 focus-visible:ring-focus"
        type="checkbox"
        {...props}
      />
      {children}
    </label>
  );
}
