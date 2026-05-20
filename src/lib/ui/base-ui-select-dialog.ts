/**
 * Radix Dialog dismisses on "outside" pointer/focus. Base UI Select renders the list in a
 * portal, so interactions hit nodes that are not descendants of DialogContent — but they must
 * not close the dialog. Walk composedPath because the positioner wrapper has no data-slot.
 */
export function isInteractionFromBaseUiSelectLayer(event: Event): boolean {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    if (node === document.body || node === document.documentElement) break;

    const slot = node.getAttribute?.("data-slot") ?? "";
    if (
      slot === "select-content" ||
      slot === "select-trigger" ||
      slot === "select-item" ||
      slot === "select-scroll-up-button" ||
      slot === "select-scroll-down-button" ||
      slot === "select-group"
    ) {
      return true;
    }

    if (
      node.getAttribute("role") === "presentation" &&
      node.hasAttribute("data-side") &&
      node.querySelector?.("[data-slot='select-content']")
    ) {
      return true;
    }

    if (node.matches?.('[role="presentation"][data-base-ui-inert]')) {
      return true;
    }
  }
  return false;
}
