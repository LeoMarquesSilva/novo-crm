import { cn } from "@/lib/utils";

type Props = {
  text: string;
  /** Subtipo em negrito, na mesma linha do primeiro parágrafo (`Subtipo: texto`). */
  leadPrefix?: string | null;
  className?: string;
  paragraphClassName?: string;
};

/** Quebra blocos do template em parágrafos/linhas para justificação no preview. */
export function splitJustifiedParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  return normalized
    .split(/\n\n+/)
    .flatMap((block) => {
      const trimmed = block.trim();
      if (!trimmed) return [];
      if (!trimmed.includes("\n")) return [trimmed];
      return trimmed
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    });
}

/**
 * Texto corrido justificado (preview de proposta / catálogo).
 * `white-space: pre-wrap` impede `text-align: justify` na maioria dos browsers.
 */
export function JustifiedDocumentText({
  text,
  leadPrefix,
  className,
  paragraphClassName,
}: Props) {
  const paragraphs = splitJustifiedParagraphs(text);
  if (paragraphs.length === 0) return null;
  const prefix = leadPrefix?.trim() ?? "";

  return (
    <div className={cn(paragraphs.length > 1 ? "space-y-3" : undefined, className)}>
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          lang="pt-BR"
          className={cn(
            "text-justify [text-align-last:left] [text-justify:inter-word]",
            paragraphClassName,
          )}
        >
          {index === 0 && prefix ? (
            <>
              <span className="font-extrabold text-[#0d2031]">{prefix}:</span> {paragraph}
            </>
          ) : (
            paragraph
          )}
        </p>
      ))}
    </div>
  );
}
