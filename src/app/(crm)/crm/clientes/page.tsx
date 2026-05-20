import { Building2 } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dedupeClientesByDocument } from "@/lib/crm/dedupe-clientes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("id, razao_social, documento, email_principal, telefone_principal")
    .order("razao_social", { ascending: true });

  const clientes = dedupeClientesByDocument(data ?? []);

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Base comercial"
        title="Cadastro único de clientes"
        description="Consulte clientes consolidados, documentos, contatos principais e status de relacionamento."
        icon={Building2}
      />

      <Card className="p-6">
        <CardHeader>
          <CardTitle className="heading-lg">Clientes cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">Não foi possível carregar os clientes: {error.message}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão social</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhum cliente cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  clientes.map((cliente) => (
                    <TableRow key={cliente.id}>
                      <TableCell className="font-medium">{cliente.razao_social}</TableCell>
                      <TableCell>{cliente.documento}</TableCell>
                      <TableCell>{cliente.email_principal}</TableCell>
                      <TableCell>{cliente.telefone_principal ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Ativo</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
