"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Se a navegação não terminar (erro, redirect para a mesma URL), a barra some sozinha. */
const MAX_VISIBLE_MS = 15_000;
const TRICKLE_MS = 250;

/** `run` remonta a barra a cada navegação, para ela não encolher de 100% para 0 na frente do usuário. */
type ProgressState = { run: number; value: number; visible: boolean; startedOn: string | null };

/** Link interno que leva a outra página (ignora nova aba, download, âncora e cliques em botões dentro do link). */
function internalNavigationTarget(event: MouseEvent): URL | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (target?.closest("a, button, [role='button']") !== anchor) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // Rotas de API (PDF, download) não trocam a página.
  if (url.pathname.startsWith("/api/")) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return url;
}

function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [state, setState] = useState<ProgressState>({
    run: 0,
    value: 0,
    visible: false,
    startedOn: null,
  });
  const routeKeyRef = useRef(routeKey);
  const timersRef = useRef<{ trickle?: number; hide?: number; giveUp?: number }>({});

  useEffect(() => {
    routeKeyRef.current = routeKey;
  }, [routeKey]);

  useEffect(() => {
    const timers = timersRef.current;
    const clearTimers = () => {
      window.clearInterval(timers.trickle);
      window.clearTimeout(timers.hide);
      window.clearTimeout(timers.giveUp);
    };

    const onClick = (event: MouseEvent) => {
      if (!internalNavigationTarget(event)) return;
      clearTimers();
      setState((s) => ({ run: s.run + 1, value: 8, visible: true, startedOn: routeKeyRef.current }));
      timers.trickle = window.setInterval(() => {
        setState((s) => ({ ...s, value: s.value + (90 - s.value) * 0.12 }));
      }, TRICKLE_MS);
      timers.giveUp = window.setTimeout(() => {
        clearTimers();
        setState((s) => ({ ...s, visible: false, startedOn: null }));
      }, MAX_VISIBLE_MS);
    };

    // Captura: o `Link` do Next chama preventDefault e alguns itens param a propagação.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  // A URL mudou depois do clique: completa a barra e some.
  const finished = state.startedOn !== null && state.startedOn !== routeKey;

  useEffect(() => {
    if (!finished) return;
    const timers = timersRef.current;
    window.clearInterval(timers.trickle);
    window.clearTimeout(timers.giveUp);
    timers.hide = window.setTimeout(
      () => setState((s) => ({ ...s, value: 100, visible: false, startedOn: null })),
      240,
    );
  }, [finished]);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-(--z-floating) h-0.5 transition-opacity duration-(--motion-slow)",
        state.visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        key={state.run}
        className="h-full bg-interactive-600 transition-[width] duration-(--motion-default) ease-(--motion-ease) motion-reduce:transition-none"
        style={{ width: `${finished ? 100 : state.value}%` }}
      />
    </div>
  );
}

/**
 * Barra fina no topo enquanto a próxima página do CRM carrega. Começa no clique
 * de qualquer link interno e termina quando a URL muda — complementa os
 * `loading.tsx`, que só aparecem depois que o Next confirma a navegação.
 */
export function CrmNavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
