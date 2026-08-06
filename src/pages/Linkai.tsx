import { Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Linkai() {
  return (
    <main className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Link2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Linkai</h1>
          <p className="text-sm text-muted-foreground">
            Módulo Linkai — em construção.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bem-vindo ao Linkai</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Este módulo já está registrado no sistema de permissões do Ariia. O
          acesso pode ser liberado por usuário na aba Usuários.
        </CardContent>
      </Card>
    </main>
  );
}
