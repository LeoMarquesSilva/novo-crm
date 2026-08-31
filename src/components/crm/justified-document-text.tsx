import { cn } from "@/lib/utils";

type Props = {
  text: string;
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
export function JustifiedDocumentText({ text, className, paragraphClassName }: Props) {
  const paragraphs = splitJustifiedParagraphs(text);
  if (paragraphs.length === 0) return null;

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
          {paragraph}
        </p>
      ))}
    </div>
  );
}
