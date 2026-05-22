"use client";

import { useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { insertPropostaPlaceholderInText } from "@/lib/crm/proposta-placeholder-labels";
import { cn } from "@/lib/utils";
import {
  TemplatePlaceholderInsertBar,
  type TemplatePlaceholderKind,
} from "./template-placeholder-insert-bar";

type Props = {
  kind: TemplatePlaceholderKind;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  minHeightClass?: string;
  placeholder?: string;
};

export function TemplateTextareaField({
  kind,
  value,
  onChange,
  disabled,
  className,
  minHeightClass = "min-h-[100px]",
  placeholder,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertPlaceholder = useCallback(
    (key: string) => {
      const el = textareaRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const { text: next, cursor } = insertPropostaPlaceholderInText(value, key, start, end);
      onChange(next);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(cursor, cursor);
      });
    },
    [onChange, value],
  );

  return (
    <div className="space-y-2">
      <TemplatePlaceholderInsertBar kind={kind} disabled={disabled} onInsert={insertPlaceholder} />
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "resize-y border-primary-dark/15 bg-white font-mono text-[12px] leading-relaxed",
          minHeightClass,
          className,
        )}
      />
    </div>
  );
}
