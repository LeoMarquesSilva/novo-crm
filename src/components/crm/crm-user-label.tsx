import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFromFullName } from "@/lib/crm/resolve-app-user-display";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  xs: {
    avatar: "h-5 w-5",
    fallback: "text-[8px]",
    name: "text-[11px]",
    prefix: "text-[10px]",
    sub: "text-[10px]",
    gap: "gap-1.5",
  },
  sm: {
    avatar: "h-7 w-7",
    fallback: "text-[10px]",
    name: "text-xs",
    prefix: "text-[10px]",
    sub: "text-[10px]",
    gap: "gap-2",
  },
  md: {
    avatar: "h-8 w-8",
    fallback: "text-[10px]",
    name: "text-sm",
    prefix: "text-xs",
    sub: "text-[11px]",
    gap: "gap-2.5",
  },
} as const;

export type CrmUserLabelSize = keyof typeof SIZE_STYLES;

export type CrmUserLabelProps = {
  name: string;
  avatarUrl?: string | null;
  size?: CrmUserLabelSize;
  /** Texto antes do nome (ex.: "Aberto por") — inline ou acima, conforme `variant`. */
  prefix?: string;
  sublabel?: string;
  variant?: "inline" | "stacked";
  className?: string;
  nameClassName?: string;
};

function initialsFromDisplayName(name: string): string {
  const clean = name.replace(/@.*/, "").trim();
  return initialsFromFullName(clean || name || "?");
}

export function CrmUserLabel({
  name,
  avatarUrl,
  size = "sm",
  prefix,
  sublabel,
  variant = "stacked",
  className,
  nameClassName,
}: CrmUserLabelProps) {
  const s = SIZE_STYLES[size];
  const displayName = name.trim() || "—";

  const avatar = (
    <Avatar
      className={cn(s.avatar, "shrink-0 border border-border/80 bg-background shadow-sm")}
    >
      {avatarUrl?.trim() ? (
        <AvatarImage src={avatarUrl.trim()} alt="" className="object-cover" />
      ) : null}
      <AvatarFallback className={cn("font-bold text-primary-dark", s.fallback)}>
        {initialsFromDisplayName(displayName)}
      </AvatarFallback>
    </Avatar>
  );

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex min-w-0 max-w-full items-center", s.gap, className)}>
        {prefix ? (
          <span className={cn("shrink-0 text-muted-foreground", s.prefix)}>{prefix}</span>
        ) : null}
        {avatar}
        <span className={cn("truncate font-semibold text-primary-dark", s.name, nameClassName)}>
          {displayName}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center", s.gap, className)}>
      {avatar}
      <span className="min-w-0">
        {prefix ? (
          <span className={cn("block text-muted-foreground", s.prefix)}>{prefix}</span>
        ) : null}
        <span className={cn("block truncate font-semibold text-primary-dark", s.name, nameClassName)}>
          {displayName}
        </span>
        {sublabel ? (
          <span className={cn("block truncate text-muted-foreground", s.sub)}>{sublabel}</span>
        ) : null}
      </span>
    </span>
  );
}
