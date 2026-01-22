import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/contexts/UserContext";
import { User, Mail, Phone, Lock, Save, Monitor, Shield } from "lucide-react";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import { DevicesTab } from "@/components/DevicesTab";
import { getStoredUser } from "@/services/authService";
import { supabase } from "@/integrations/supabase/client";

const formatPhoneMask = (value: string): string => {
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, "");
  
  // Limita a 11 dígitos
  const limited = numbers.slice(0, 11);
  
  // Aplica a máscara (XX) X-XXXX-XXXX
  if (limited.length <= 2) {
    return limited.length ? `(${limited}` : "";
  } else if (limited.length <= 3) {
    return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
  } else if (limited.length <= 7) {
    return `(${limited.slice(0, 2)}) ${limited.slice(2, 3)}-${limited.slice(3)}`;
  } else {
    return `(${limited.slice(0, 2)}) ${limited.slice(2, 3)}-${limited.slice(3, 7)}-${limited.slice(7)}`;
  }
};

const MeuPerfil = () => {
  const { user } = useUser();
  const storedUser = getStoredUser();
  const [isEditing, setIsEditing] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [isLoading2FA, setIsLoading2FA] = useState(true);
  const [formData, setFormData] = useState({
    nome: user.nome,
    sobrenome: user.sobrenome,
    email: user.email,
    telefone: "(11) 9-9999-0000",
  });

  // Carregar status do 2FA do banco de dados
  useEffect(() => {
    const load2FAStatus = async () => {
      if (!storedUser?.id) {
        setIsLoading2FA(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from("tb_usuario")
          .select("totp_enabled")
          .eq("user_id", storedUser.id)
          .maybeSingle();
        
        if (data) {
          setIs2FAEnabled(data.totp_enabled || false);
        }
      } catch (err) {
        console.error("Erro ao carregar status 2FA:", err);
      } finally {
        setIsLoading2FA(false);
      }
    };
    
    load2FAStatus();
  }, [storedUser?.id]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneMask(e.target.value);
    setFormData({ ...formData, telefone: formatted });
  };

  const handleSave = () => {
    setIsEditing(false);
    // Aqui salvaria no backend
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Meu Perfil</h2>
        <p className="text-sm md:text-base text-muted-foreground">
          Gerencie suas informações pessoais e segurança
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="text-center p-4 md:p-6">
            <div className="flex justify-center mb-3 md:mb-4">
              <Avatar className="h-16 w-16 md:h-24 md:w-24">
                <AvatarImage src={user.avatar} alt={`${user.nome} ${user.sobrenome}`} />
                <AvatarFallback className="text-lg md:text-2xl">
                  {user.nome[0]}{user.sobrenome[0]}
                </AvatarFallback>
              </Avatar>
            </div>
            <CardTitle className="text-base md:text-lg">{user.nome} {user.sobrenome}</CardTitle>
            <CardDescription className="text-xs md:text-sm">{user.cargo}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            <div className="space-y-2 md:space-y-3 text-xs md:text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                <span>Perfil: {user.role}</span>
              </div>
            </div>

            <Separator className="my-3 md:my-4" />

            <Button variant="outline" className="w-full text-xs md:text-sm">
              Alterar foto
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <Tabs defaultValue="dados" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="dados" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm py-2 px-1 md:px-3">
                <User className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Dados Pessoais</span>
                <span className="sm:hidden">Dados</span>
              </TabsTrigger>
              <TabsTrigger value="seguranca" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm py-2 px-1 md:px-3">
                <Shield className="h-3 w-3 md:h-4 md:w-4" />
                <span>Segurança</span>
              </TabsTrigger>
              <TabsTrigger value="dispositivos" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm py-2 px-1 md:px-3">
                <Monitor className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Dispositivos</span>
                <span className="sm:hidden">Devices</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 md:p-6">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <User className="h-4 w-4 md:h-5 md:w-5" />
                      Dados Pessoais
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                      Atualize suas informações de contato
                    </CardDescription>
                  </div>
                  {!isEditing && (
                    <Button variant="outline" onClick={() => setIsEditing(true)} className="w-full sm:w-auto">
                      Editar
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6 pt-0 md:pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome" className="text-xs md:text-sm">Nome</Label>
                      <Input
                        id="nome"
                        value={formData.nome}
                        onChange={(e) =>
                          setFormData({ ...formData, nome: e.target.value })
                        }
                        disabled={!isEditing}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sobrenome" className="text-xs md:text-sm">Sobrenome</Label>
                      <Input
                        id="sobrenome"
                        value={formData.sobrenome}
                        onChange={(e) =>
                          setFormData({ ...formData, sobrenome: e.target.value })
                        }
                        disabled={!isEditing}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs md:text-sm">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      disabled={!isEditing}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone" className="text-xs md:text-sm">Telefone</Label>
                    <Input
                      id="telefone"
                      value={formData.telefone}
                      onChange={handlePhoneChange}
                      placeholder="(XX) X-XXXX-XXXX"
                      maxLength={17}
                      disabled={!isEditing}
                      className="text-sm"
                    />
                  </div>

                  {isEditing && (
                    <div className="flex flex-col sm:flex-row gap-2 pt-4">
                      <Button onClick={handleSave} className="w-full sm:w-auto">
                        <Save className="h-4 w-4 mr-2" />
                        Salvar
                      </Button>
                      <Button variant="outline" onClick={() => setIsEditing(false)} className="w-full sm:w-auto">
                        Cancelar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seguranca" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
              <Card>
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Lock className="h-4 w-4 md:h-5 md:w-5" />
                    Alterar Senha
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Atualize sua senha de acesso
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="senha-atual" className="text-xs md:text-sm">Senha Atual</Label>
                      <Input id="senha-atual" type="password" placeholder="••••••••" className="text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nova-senha" className="text-xs md:text-sm">Nova Senha</Label>
                      <Input id="nova-senha" type="password" placeholder="••••••••" className="text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmar-senha" className="text-xs md:text-sm">Confirmar Nova Senha</Label>
                      <Input id="confirmar-senha" type="password" placeholder="••••••••" className="text-sm" />
                    </div>
                  </div>
                  <Button className="mt-4 w-full sm:w-auto">Alterar Senha</Button>
                </CardContent>
              </Card>

              <TwoFactorSettings 
                userId={storedUser?.id || 0}
                isEnabled={is2FAEnabled}
                onStatusChange={setIs2FAEnabled}
              />
            </TabsContent>

            <TabsContent value="dispositivos" className="mt-6">
              <DevicesTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default MeuPerfil;
