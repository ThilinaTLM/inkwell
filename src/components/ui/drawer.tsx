"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"

import { cn } from "@/lib/utils"

// Bottom-sheet / side-sheet primitive built on `@base-ui/react/drawer`.
// Mirrors the shape of `dialog.tsx` so it reads like the rest of the
// shadcn-style UI kit.
//
// `side` controls both the on-screen position and the swipe-to-dismiss
// direction. Bottom is the default for mobile sheets (matches how
// drawio's sketch hamburger feels). Right is used for sidebar-style
// chrome on tablet.

type DrawerSide = "bottom" | "left" | "right" | "top"

const SIDE_TO_SWIPE: Record<DrawerSide, "down" | "left" | "right" | "up"> = {
  bottom: "down",
  left: "left",
  right: "right",
  top: "up",
}

function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        // Same warm ink wash as the dialog overlay so stacked surfaces
        // feel coherent. Sole intentional literal oklch \u2014 see dialog.tsx
        // for the rationale.
        "fixed inset-0 isolate z-50 bg-[oklch(0.18_0.012_60_/_0.55)] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  )
}

interface DrawerContentProps extends DrawerPrimitive.Popup.Props {
  side?: DrawerSide
}

function DrawerContent({
  className,
  side = "bottom",
  children,
  ...props
}: DrawerContentProps) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Popup
        data-slot="drawer-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-2 bg-popover text-popover-foreground ring-1 ring-border outline-none shadow-[0_24px_60px_-20px_rgba(28,24,20,0.45)] duration-200",
          // Slide-in animation per side.
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)] data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom",
          side === "top" &&
            "inset-x-0 top-0 max-h-[85dvh] rounded-b-xl data-open:animate-in data-open:slide-in-from-top data-closed:animate-out data-closed:slide-out-to-top",
          side === "left" &&
            "inset-y-0 left-0 w-80 max-w-[85vw] rounded-r-xl data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left",
          side === "right" &&
            "inset-y-0 right-0 w-80 max-w-[85vw] rounded-l-xl data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right",
          className,
        )}
        {...props}
      >
        {children}
      </DrawerPrimitive.Popup>
    </DrawerPortal>
  )
}

// Convenience: pre-wired Root with `swipeDirection` derived from `side`.
// Use this when you want the standard "swipe to dismiss in the natural
// direction" behaviour. For full control, use `<Drawer>` directly.
function SideDrawer({
  side = "bottom",
  ...props
}: DrawerPrimitive.Root.Props & { side?: DrawerSide }) {
  return (
    <Drawer
      // base-ui's swipeDirection is the direction the *drawer moves* to
      // dismiss, which matches our side-to-direction map.
      swipeDirection={SIDE_TO_SWIPE[side]}
      {...props}
    />
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-1 px-5 pt-5", className)}
      {...props}
    />
  )
}

function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      className={cn("flex-1 overflow-y-auto px-1 pb-2", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "flex flex-col-reverse gap-2 px-5 pb-5 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-sans text-base font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  SideDrawer,
}
export type { DrawerSide }
