"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { newLeadModalFieldClass } from "./index";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

type SearchablePickerProps<T> = {
  label: string;
  placeholder: string;
  disabled?: boolean;
  helperText?: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: T[];
  value: string;
  onChange: (id: string) => void;
  getOptionId: (option: T) => string;
  filterOption: (option: T, query: string) => boolean;
  renderTrigger: (selected: T | null) => ReactNode;
  renderOption: (option: T) => ReactNode;
};

export function SearchablePicker<T>({
  label,
  placeholder,
  disabled = false,
  helperText,
  searchPlaceholder,
  emptyMessage,
  options,
  value,
  onChange,
  getOptionId,
  filterOption,
  renderTrigger,
  renderOption,
}: SearchablePickerProps<T>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const selected = options.find((o) => getOptionId(o) === value) ?? null;
  const filtered = options.filter((o) => filterOption(o, query));

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 280);
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    const top = rect.bottom + 6;
    setPanelStyle({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const panel =
    open && panelStyle && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            data-new-lead-picker-panel=""
            className="fixed z-[100] overflow-hidden rounded-xl border border-[#dfe5ee] bg-white shadow-[0_16px_40px_rgba(16,31,46,0.16)] ring-1 ring-black/5"
            style={{
              top: panelStyle.top,
              left: panelStyle.left,
              width: panelStyle.width,
            }}
          >
            <div className="border-b border-[#eef1f5] p-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={cn(newLeadModalFieldClass, "h-10 pl-9")}
                  autoFocus
                />
              </div>
            </div>
            <div className="crm-scrollbar max-h-[min(280px,45dvh)] space-y-0.5 overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>
              ) : (
                filtered.map((option) => {
                  const id = getOptionId(option);
                  const isSelected = id === value;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-[#eef5ff] text-[#102033] ring-1 ring-[#bfd2f6]/60"
                          : "text-[#111827] hover:bg-[#f3f4f6]",
                      )}
                    >
                      {renderOption(option)}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-[#111827]">{label}</Label>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        className={cn(
          newLeadModalFieldClass,
          "!h-12 flex items-center justify-between gap-2 text-left font-normal shadow-none transition-colors hover:bg-[#fafafa]",
          open && "border-[#101f2e]/35 ring-[3px] ring-[#101f2e]/12",
        )}
      >
        <span className="min-w-0 flex-1">{selected ? renderTrigger(selected) : (
          <span className="text-[#6b7280]">{placeholder}</span>
        )}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#9ca3af] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {panel}
      {helperText ? <p className="text-xs leading-relaxed text-[#6b7280]">{helperText}</p> : null}
    </div>
  );
}

export type SystemUserOption = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
};

export function UserPickerField({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  options: SystemUserOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <SearchablePicker
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      searchPlaceholder="Pesquisar por nome ou e-mail…"
      emptyMessage="Nenhum usuário encontrado."
      options={options}
      value={value}
      onChange={onChange}
      getOptionId={(o) => o.id}
      filterOption={(o, q) =>
        `${o.name} ${o.email}`.toLowerCase().includes(q.toLowerCase())
      }
      renderTrigger={(user) => (
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <Avatar className="h-8 w-8 border border-[#e5e7eb]">
            <AvatarImage src={user.avatarUrl} alt="" className="object-cover" />
            <AvatarFallback className="text-[10px] font-bold">
              {initialsFromName(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate font-medium text-[#111827]">{user.name}</span>
        </span>
      )}
      renderOption={(user) => (
        <>
          <Avatar className="h-8 w-8 shrink-0 border border-[#e5e7eb]">
            <AvatarImage src={user.avatarUrl} alt="" className="object-cover" />
            <AvatarFallback className="text-[10px] font-bold">
              {initialsFromName(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-medium">{user.name}</span>
            <span className="block truncate text-xs text-[#6b7280]">{user.email}</span>
          </span>
        </>
      )}
    />
  );
}

export type ClientOption = {
  id: string;
  razao_social: string;
  documento: string;
};

export function ClientPickerField({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  helperText,
}: {
  label: string;
  placeholder: string;
  options: ClientOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <SearchablePicker
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      helperText={helperText}
      searchPlaceholder="Pesquisar por razão social ou documento…"
      emptyMessage="Nenhum cliente encontrado."
      options={options}
      value={value}
      onChange={onChange}
      getOptionId={(o) => o.id}
      filterOption={(o, q) =>
        `${o.razao_social} ${o.documento}`.toLowerCase().includes(q.toLowerCase())
      }
      renderTrigger={(client) => (
        <span className="flex min-w-0 flex-col items-start text-left">
          <span className="truncate font-medium text-[#111827]">{client.razao_social}</span>
          <span className="truncate text-xs text-[#6b7280]">{client.documento}</span>
        </span>
      )}
      renderOption={(client) => (
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{client.razao_social}</span>
          <span className="block truncate text-xs text-[#6b7280]">{client.documento}</span>
        </span>
      )}
    />
  );
}
