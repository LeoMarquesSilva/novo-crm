type PipelineFieldRef = { fieldCode: string; definitionId: string };

export async function applyClienteCadastroCpFieldsToLead(params: {
  leadId: string;
  cpFields: Record<string, string>;
  pipelineFields: readonly PipelineFieldRef[];
  request?: typeof fetch;
}): Promise<void> {
  const request = params.request ?? fetch;
  const base = `/api/crm/leads/${encodeURIComponent(params.leadId)}`;
  const tasks: Promise<void>[] = [];

  for (const [code, value] of Object.entries(params.cpFields)) {
    const def = params.pipelineFields.find((f) => f.fieldCode === code);
    if (!def) continue;
    tasks.push(
      (async () => {
        const res = await request(base, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pipelineField: { fieldDefinitionId: def.definitionId, value },
          }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || json?.ok !== true) {
          throw new Error(json?.error ?? `Falha ao salvar ${code}.`);
        }
      })(),
    );
  }

  await Promise.all(tasks);
}
