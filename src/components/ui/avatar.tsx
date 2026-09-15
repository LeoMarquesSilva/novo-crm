"use client";

import type React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusVariants = cva("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white", {
  variants: {
    status: {
      online: "bg-success-text",
      busy: "bg-danger-text",
      away: "bg-warning-text",
      offline: "bg-neutral-400",
    },
  },
  defaultVariants: {
    status: "online",
  },
});

function Avatar({
  className,
  ...props
}: AvatarPrimitive.AvatarProps & React.ComponentPropsWithoutRef<"span">) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: AvatarPrimitive.AvatarImageProps & React.ComponentPropsWithoutRef<"img">) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("h-full w-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.AvatarFallbackProps & React.ComponentPropsWithoutRef<"span">) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-foreground",
        className
      )}
      {...props}
    />
  );
}

function AvatarStatus({
  className,
  status,
}: VariantProps<typeof statusVariants> & { className?: string }) {
  return <span data-slot="avatar-status" className={cn(statusVariants({ status }), className)} />;
}

export { Avatar, AvatarImage, AvatarFallback, AvatarStatus };
