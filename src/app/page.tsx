import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-3xl">CRM Jurídico - Projeto Base</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            Estrutura inicial criada do zero com Next.js 16, shadcn/ui e módulos
            separados para domínio CRM.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Entrar no CRM
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/crm/leads"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Ir para pipeline
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
