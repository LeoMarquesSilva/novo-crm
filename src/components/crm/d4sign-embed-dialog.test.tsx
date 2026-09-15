// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmbedSignDialog } from "./d4sign-embed-dialog";

describe("EmbedSignDialog", () => {
  it("ignores forged signature messages outside the configured D4Sign iframe", () => {
    const onSigned = vi.fn();
    const { getByTitle } = render(
      <EmbedSignDialog
        open
        onOpenChange={() => undefined}
        documentUuid="document-uuid"
        signerEmail="signer@example.com"
        onSigned={onSigned}
      />,
    );

    const iframe = getByTitle("Assinatura D4Sign") as HTMLIFrameElement;

    fireEvent(
      window,
      new MessageEvent("message", {
        data: "signed",
        origin: "https://evil.example",
        source: iframe.contentWindow,
      }),
    );
    fireEvent(
      window,
      new MessageEvent("message", {
        data: "signed",
        origin: "https://secure.d4sign.com.br",
        source: window,
      }),
    );

    expect(onSigned).not.toHaveBeenCalled();
  });

  it("accepts signature messages from the configured D4Sign iframe", () => {
    const onSigned = vi.fn();
    const { getByTitle } = render(
      <EmbedSignDialog
        open
        onOpenChange={() => undefined}
        documentUuid="document-uuid"
        signerEmail="signer@example.com"
        onSigned={onSigned}
      />,
    );

    const iframe = getByTitle("Assinatura D4Sign") as HTMLIFrameElement;
    fireEvent(
      window,
      new MessageEvent("message", {
        data: "signed",
        origin: "https://secure.d4sign.com.br",
        source: iframe.contentWindow,
      }),
    );

    expect(onSigned).toHaveBeenCalledOnce();
  });

  it("handles repeated valid signature messages only once per opening", () => {
    const onSigned = vi.fn();
    const { getByTitle } = render(
      <EmbedSignDialog
        open
        onOpenChange={() => undefined}
        documentUuid="document-uuid"
        signerEmail="signer@example.com"
        onSigned={onSigned}
      />,
    );

    const iframe = getByTitle("Assinatura D4Sign") as HTMLIFrameElement;
    const signedMessage = () =>
      new MessageEvent("message", {
        data: "signed",
        origin: "https://secure.d4sign.com.br",
        source: iframe.contentWindow,
      });

    fireEvent(window, signedMessage());
    fireEvent(window, signedMessage());

    expect(onSigned).toHaveBeenCalledOnce();
  });
});
