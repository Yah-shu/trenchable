import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Plinth buttons.
 *   primary   → the coral raised button (plinth-btn with a face); the one bold action on a view
 *   danger    → the same raised button in the "bad" colours
 *   outline   → a flat button with a 2px ink edge (the pl-pill look)
 *   ghost     → a borderless text button that turns paper on hover
 *   underline → an ink text link
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        underline: "rounded-none px-0.5 text-ink underline decoration-ink/35 decoration-2 underline-offset-4 hover:decoration-ink",
        primary: "",
        danger: "",
        ghost: "rounded-[8px] text-ink hover:bg-paper",
        outline: "rounded-[10px] border-2 border-ink bg-canvas text-ink hover:bg-paper",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-[13px]",
        lg: "h-11 px-5 text-sm",
        icon: "size-8 p-0",
        inline: "h-auto",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

type Size = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

/** Raised (plinth) buttons size themselves through the face, so they skip the flat size classes. */
const RAISED_SIZE: Record<Size, string> = {
  sm: "plinth-btn--xs",
  md: "plinth-btn--sm",
  lg: "",
  icon: "plinth-btn--xs",
  inline: "plinth-btn--xs",
};

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, children, ...props }: ButtonProps) {
  const raised = variant === "primary" || variant === "danger";

  if (!raised) {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size }), variant === "underline" && "h-auto", className)} {...props}>
        {children}
      </Comp>
    );
  }

  const classes = cn(
    "plinth-btn disabled:pointer-events-none",
    variant === "danger" && "plinth-btn--bad",
    RAISED_SIZE[size ?? "md"],
    className,
  );
  const face = (inner: React.ReactNode) => (
    <span className={cn("plinth-btn__face whitespace-nowrap", size === "icon" && "!px-[0.6em]")}>{inner}</span>
  );

  // asChild: the face goes inside the child element (e.g. a <Link>) so it keeps its own tag.
  if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return (
      <Slot.Root className={classes} {...props}>
        {React.cloneElement(children, undefined, face(children.props.children))}
      </Slot.Root>
    );
  }

  return (
    <button className={classes} {...props}>
      {face(children)}
    </button>
  );
}

export { buttonVariants };
