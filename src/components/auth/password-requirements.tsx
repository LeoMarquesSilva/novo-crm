import { Check, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

// Mesmas regras de `adminInitialPasswordSchema` (validadas de novo no servidor).
const RULES = [
  { label: "12 caracteres ou mais", test: (v: string) => v.length >= 12 },
  { label: "Uma letra maiúscula", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Uma letra minúscula", test: (v: string) => /[a-z]/.test(v) },
  { label: "Um número", test: (v: string) => /[0-9]/.test(v) },
];

export function passwordMeetsRules(value: string) {
  return RULES.every((rule) => rule.test(value));
}

/** Checklist ao vivo das regras da senha nova, mais a conferência da confirmação. */
export function PasswordRequirements({ password, confirm }: { password: string; confirm: string }) {
  const items = [
    ...RULES.map((rule) => ({ label: rule.label, ok: rule.test(password) })),
    { label: "Confirmação igual à senha", ok: confirm.length > 0 && confirm === password },
  ];

  return (
    <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Requisitos da senha">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "flex items-center gap-2 text-v2-caption transition-colors",
            item.ok ? "text-success-text" : "text-muted-foreground",
          )}
        >
          {item.ok ? (
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span>
            {item.label}
            <span className="sr-only">{item.ok ? " — atendido" : " — pendente"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
