import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

export type CrmAppUserRowProps = {
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  /** Tamanho do avatar em px (classe Tailwind h/w) */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Linha padrão ao citar utilizador interno do CRM (nome + e-mail + foto).
 * Reutilizar em listagens admin, integrações, etc.
 */
export function CrmAppUserRow({
  fullName,
  email,
  avatarUrl,
  size = "sm",
  className,
}: CrmAppUserRowProps) {
  const dim = size === "md" ? "h-9 w-9" : "h-8 w-8";
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className ?? ""}`}>
      <Avatar className={`${dim} shrink-0`}>
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt="" className="object-cover" />
        ) : null}
        <AvatarFallback className="text-[10px] font-medium">{initials(fullName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className={`font-medium text-foreground truncate ${textSize}`}>{fullName || email}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">{email}</p>
      </div>
    </div>
  );
}
