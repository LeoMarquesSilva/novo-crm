"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Campo de senha com mostrar/ocultar e aviso de Caps Lock. */
export function PasswordInput({ id, value, onValueChange, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const capsLockId = `${id}-caps-lock`;

  function trackCapsLock(event: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={trackCapsLock}
          onKeyUp={trackCapsLock}
          onBlur={() => setCapsLock(false)}
          aria-describedby={cn(props["aria-describedby"], capsLock && capsLockId) || undefined}
          className={cn("h-11 pl-10 pr-11", className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-(--radius-v2-md) text-muted-foreground transition-colors hover:bg-neutral-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {capsLock ? (
        <p id={capsLockId} className="text-v2-caption text-warning-text" role="status">
          Caps Lock está ativado.
        </p>
      ) : null}
    </div>
  );
}
