/**
 * Teste de envio do e-mail de notificação de lead (Outlook / Graph).
 * Uso (na pasta crm): npx tsx scripts/send-test-lead-email.ts
 *
 * Requer .env com Microsoft + OUTLOOK_FROM_EMAIL + Supabase service role.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", ".env") });

import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { sendLeadNotificationEmail } from "../src/modules/crm/application/services/send-lead-notification-email";
import type { NewLeadPayload } from "../src/modules/crm/application/services/new-lead-payload";

const TEST_EMAIL = "leonardo.marques@bismarchipires.com.br";

const payload: NewLeadPayload = {
  solicitante: "TESTANDO CRM NEW",
  email: TEST_EMAIL,
  cadastrado_por: TEST_EMAIL,
  due_diligence: "Nao",
  data_entrega_due: null,
  horario_entrega_due: null,
  empresas: [
    {
      tipo_documento: "CNPJ",
      razao_social: "TESTANDO CRM NEW",
      documento: "12.345.678/0001-99",
    },
  ],
  areas_analise: ["Cível"],
  local_reuniao: "Teste de envio automático",
  data_reuniao: null,
  horario_reuniao: null,
  tipo_de_lead: "Lead Digital",
  tipo_indicacao: null,
  nome_indicacao: null,
  contexto_comercial: null,
};

async function main() {
  const supabase = createSupabaseAdminClient();
  const result = await sendLeadNotificationEmail(supabase, payload, {
    recipientEmailsOverride: [TEST_EMAIL],
  });
  if (!result.ok) {
    console.error("Falha:", result.error);
    process.exit(1);
  }
  console.log("E-mail enviado com sucesso para", TEST_EMAIL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
