import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Paper-language button. Variants are expressed entirely through shadcn
// semantic tokens (primary / secondary / accent / destructive / ring) so
// the editor chrome and the rest of the app share one palette. The press
// microshift (translateY 1px) is preserved from shadcn — feels tactile
// against the paper background.

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding font-sans font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Vermillion ink stamp — primary CTA.
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring/40",
        // Paper card with ink hairline border. Hover is a neutral surface
        // tint; aria-expanded (popup is open) becomes the brand accent.
        outline:
          "border-input text-foreground hover:bg-accent hover:border-foreground/30 aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        // Neutral fill secondary action; brand only when its popup is open.
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        // No fill until hover; quiet neutral tint, brand only when open.
        ghost:
          "text-foreground hover:bg-accent aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        // Restrained destructive — destructive text on a soft accent fill.
        destructive:
          "bg-accent/70 text-destructive hover:bg-accent focus-visible:ring-ring/30 dark:bg-accent/40 dark:text-accent-foreground dark:hover:bg-accent/60",
        // Inline link — primary underline on hover.
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 text-xs/relaxed has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-5 gap-1 rounded-sm px-2 text-[0.625rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-7 gap-1 px-2.5 text-xs/relaxed has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-10 gap-2 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-10 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
