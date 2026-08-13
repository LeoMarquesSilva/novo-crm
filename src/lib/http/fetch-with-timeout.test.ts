import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { fetchWithTimeout } from "./fetch-with-timeout";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("fetchWithTimeout", () => {
  it("cancela uma requisição real que ultrapassa o prazo", async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("tarde demais");
      }, 250);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Servidor de teste sem porta TCP.");
    }

    await expect(
      fetchWithTimeout(
        `http://127.0.0.1:${address.port}/slow`,
        { cache: "no-store" },
        25,
      ),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("preserva o cancelamento fornecido pelo chamador", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelado pelo chamador"));

    await expect(
      fetchWithTimeout("data:text/plain,ok", { signal: controller.signal }),
    ).rejects.toThrow("cancelado pelo chamador");
  });
});
