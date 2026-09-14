"use client";

import { useEffect } from "react";

type ScrollStyleSnapshot = {
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingRight: string;
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
};

let activeLocks = 0;
let styleSnapshot: ScrollStyleSnapshot | null = null;

export function acquireBodyScrollLock(): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => undefined;

  if (activeLocks === 0) {
    const body = document.body;
    const html = document.documentElement;
    styleSnapshot = {
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
      bodyPaddingRight: body.style.paddingRight,
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
    };

    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
  }

  activeLocks += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks > 0 || !styleSnapshot) return;

    const body = document.body;
    const html = document.documentElement;
    body.style.overflow = styleSnapshot.bodyOverflow;
    body.style.overscrollBehavior = styleSnapshot.bodyOverscrollBehavior;
    body.style.paddingRight = styleSnapshot.bodyPaddingRight;
    html.style.overflow = styleSnapshot.htmlOverflow;
    html.style.overscrollBehavior = styleSnapshot.htmlOverscrollBehavior;
    styleSnapshot = null;
  };
}

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquireBodyScrollLock();
  }, [active]);
}
