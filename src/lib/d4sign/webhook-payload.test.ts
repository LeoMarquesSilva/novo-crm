import { describe, expect, it } from "vitest";

import { applyWebhookToSigners, parseD4SignWebhookBody, readD4SignWebhookRequest } from "./webhook-payload";

const UUID = "01a0ef04-8caf-7391-b038-dd25014749cd";

describe("readD4SignWebhookRequest", () => {
  it("lê o JSON do Webhook 2.0 com a lista de signatários", async () => {
    const event = await readD4SignWebhookRequest(
      new Request("https://x/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: UUID,
          type_post: "1",
          message: "Finished document",
          event_datetime: "2026-10-01T12:00:00Z",
          document_name: "2026 09 29 CONTRATO X pdf",
          signers: [
            { uuid: "s1", email: "a@x.com", name: "Ana", signed_at: "2026-10-01T11:00:00Z", identification_number: "123" },
            { uuid: "s2", email: null },
          ],
        }),
      }),
    );
    expect(event).toMatchObject({
      version: 2,
      uuid: UUID,
      typePost: "1",
      eventAt: "2026-10-01T12:00:00.000Z",
      documentName: "2026 09 29 CONTRATO X pdf",
      signers: [{ email: "a@x.com", name: "Ana", signed_at: "2026-10-01T11:00:00.000Z", identification_number: "123" }],
    });
  });

  it("lê o form-data do Webhook 1.0", async () => {
    const form = new FormData();
    form.set("uuid", UUID);
    form.set("type_post", "4");
    form.set("email", "b@x.com");
    const event = await readD4SignWebhookRequest(new Request("https://x/webhook", { method: "POST", body: form }));
    expect(event).toMatchObject({ version: 1, uuid: UUID, typePost: "4", signerEmail: "b@x.com", signers: null });
  });

  it("lê form urlencoded", async () => {
    const event = await readD4SignWebhookRequest(
      new Request("https://x/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `uuid=${UUID}&type_post=3&message=Cancelled`,
      }),
    );
    expect(event).toMatchObject({ version: 1, typePost: "3" });
  });

  it("recusa corpo sem uuid ou type_post", async () => {
    expect(parseD4SignWebhookBody({ type_post: "1" }, 2)).toBeNull();
    expect(
      await readD4SignWebhookRequest(new Request("https://x", { method: "POST", body: "{nao json" , headers: { "Content-Type": "application/json" } })),
    ).toBeNull();
  });

  it("pega o signatário do tipo 4 e a mensagem de cancelamento", () => {
    expect(
      parseD4SignWebhookBody({ uuid: UUID, type_post: 4, signer: { email: "c@x.com" } }, 2)?.signerEmail,
    ).toBe("c@x.com");
    expect(
      parseD4SignWebhookBody({ uuid: UUID, type_post: "3", cancellation_message: "Erro no valor" }, 2)
        ?.cancellationMessage,
    ).toBe("Erro no valor");
  });
});

describe("applyWebhookToSigners", () => {
  const NOW = "2026-10-01T15:00:00.000Z";
  const base = { version: 2 as const, uuid: UUID, message: null, documentName: null, signers: null, cancellationMessage: null, errorDetails: null, raw: {} };

  it("tipo 4 marca quem assinou e acrescenta quem não estava na lista", () => {
    const current = [{ email: "Socio@bp.com", key_signer: "k1", signed: false, signed_at: null, role: "CONTRATADA" }];
    const signed = applyWebhookToSigners(current, { ...base, typePost: "4", signerEmail: "socio@bp.com", eventAt: "2026-10-01T10:00:00.000Z" }, NOW);
    expect(signed.signers[0]).toMatchObject({ key_signer: "k1", role: "CONTRATADA", signed: true, signed_at: "2026-10-01T10:00:00.000Z" });

    const added = applyWebhookToSigners([], { ...base, typePost: "4", signerEmail: "cliente@x.com", eventAt: null }, NOW);
    expect(added.signers).toEqual([{ email: "cliente@x.com", key_signer: null, signed: true, signed_at: NOW }]);
  });

  it("tipo 1 do 2.0 grava a lista completa e a data da última assinatura", () => {
    const result = applyWebhookToSigners(
      [{ email: "a@x.com", key_signer: "k", signed: false, signed_at: null }],
      {
        ...base,
        typePost: "1",
        signerEmail: null,
        eventAt: "2026-10-01T12:00:00.000Z",
        signers: [
          { email: "a@x.com", name: "Ana", signed_at: "2026-10-01T09:00:00.000Z", identification_number: "1" },
          { email: "b@x.com", name: "Bia", signed_at: "2026-10-01T11:00:00.000Z", identification_number: "2" },
        ],
      },
      NOW,
    );
    expect(result.signers).toHaveLength(2);
    expect(result.signers.every((s) => s.signed)).toBe(true);
    expect(result.signers[1]).toMatchObject({ email: "b@x.com", name: "Bia", user_document: "2" });
    expect(result.finalizedAt).toBe("2026-10-01T11:00:00.000Z");
  });

  it("tipo 2 grava o motivo do bounce", () => {
    const result = applyWebhookToSigners(
      [{ email: "a@x.com", signed: false, signed_at: null }],
      { ...base, typePost: "2", signerEmail: "a@x.com", eventAt: null, errorDetails: { category: "Bounce", reason: "mailbox full" } },
      NOW,
    );
    expect(result.signers[0].email_sent_status).toBe("Bounce: mailbox full");
  });
});
