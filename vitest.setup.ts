import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest não expõe globals (jest-like) por padrão, então o auto-cleanup do
// Testing Library (que depende de detectar um `afterEach` global) não se
// registra sozinho — sem isso, cada teste de componente deixaria sua árvore
// montada no `document.body`, poluindo os testes seguintes.
afterEach(() => {
  cleanup();
});
