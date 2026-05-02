import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Paper-language button. Variants use the sketchbook tokens directly so
// every button reads as ink-on-paper. The press microshift (translateY 1px)
// is preserved from shadcn — feels tactile against the paper background.

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding font-sans font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Vermillion ink stamp — primary CTA.
        default:
          "bg-vermillion text-[#fdf6e8] hover:bg-vermillion-dark focus-visible:ring-vermillion/40",
        // Paper card with ink hairline border.
        outline:
          "border-ink-soft/40 text-ink hover:bg-manila-soft/60 hover:border-ink-soft/60 aria-expanded:bg-manila-soft aria-expanded:text-ink",
        // Manila-soft fill; for "secondary" calls to action.
        secondary:
          "bg-manila-soft text-ink hover:bg-manila/80 aria-expanded:bg-manila aria-expanded:text-ink",
        // No fill until hover; lifts paper-edge tint.
        ghost:
          "text-ink hover:bg-manila-soft/60 aria-expanded:bg-manila-soft/80 aria-expanded:text-ink",
        // Restrained destructive — vermillion-dark text on a soft tinted fill.
        destructive:
          "bg-vermillion-soft/70 text-vermillion-dark hover:bg-vermillion-soft focus-visible:ring-vermillion/30 dark:bg-vermillion-soft/40 dark:text-[#f3c8be] dark:hover:bg-vermillion-soft/60",
        // Inline link — vermillion underline on hover.
        link: "text-vermillion underline-offset-4 hover:underline",
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
