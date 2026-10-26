import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-md px-1.5 py-[1px] text-[11.5px] font-medium leading-5 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-[color-mix(in_srgb,var(--color-muted)_12%,transparent)] text-ink-2",
      navy: "bg-navy-soft text-navy",
      ok: "bg-ok-soft text-ok",
      warn: "bg-warn-soft text-warn",
      bad: "bg-bad-soft text-bad",
      teal: "bg-teal-soft text-teal",
      outline: "border border-rule text-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}
