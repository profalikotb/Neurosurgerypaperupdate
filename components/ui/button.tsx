import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

// shadcn/ui-style primitive (hand-authored; no CLI/registry dependency)
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-navy text-white hover:bg-navy-2 dark:text-[#0b1020]",
        outline: "border border-rule bg-surface text-ink hover:bg-navy-soft",
        ghost: "text-ink-2 hover:bg-navy-soft hover:text-ink",
        subtle: "bg-navy-soft text-navy hover:brightness-95",
        danger: "text-bad hover:bg-bad-soft",
      },
      size: { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5", lg: "h-11 px-5 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "outline", size: "md" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
