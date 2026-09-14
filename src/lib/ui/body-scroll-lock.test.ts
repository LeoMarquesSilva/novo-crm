// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { acquireBodyScrollLock } from "./body-scroll-lock";

describe("acquireBodyScrollLock", () => {
  afterEach(() => {
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  it("bloqueia a página e restaura os estilos anteriores", () => {
    document.body.style.overflow = "scroll";
    document.documentElement.style.overflow = "visible";

    const release = acquireBodyScrollLock();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    release();

    expect(document.body.style.overflow).toBe("scroll");
    expect(document.documentElement.style.overflow).toBe("visible");
  });

  it("mantém o bloqueio enquanto existir um modal aninhado", () => {
    const releaseParent = acquireBodyScrollLock();
    const releaseChild = acquireBodyScrollLock();

    releaseParent();
    expect(document.body.style.overflow).toBe("hidden");

    releaseChild();
    expect(document.body.style.overflow).toBe("");
  });

  it("ignora liberações repetidas da mesma aquisição", () => {
    const release = acquireBodyScrollLock();
    release();
    release();

    expect(document.body.style.overflow).toBe("");
  });
});
