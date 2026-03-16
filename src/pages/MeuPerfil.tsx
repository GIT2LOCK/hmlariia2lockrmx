import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/contexts/UserContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "lucide-react";

const MeuPerfil = () => {
  const { user } = useUser();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Meu Perfil</h2>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Informações Pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="text-lg">{user.nome[0]}{user.sobrenome?.[0] || ""}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{user.nome} {user.sobrenome}</p>
              <p className="text-muted-foreground">{user.email}</p>
              <p className="text-sm text-muted-foreground">Perfil: {user.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MeuPerfil;
