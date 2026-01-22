import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Webhook, Pencil, Trash2, CheckCircle, XCircle, Copy } from "lucide-react";

const mockWebhooks = [
  {
    id: 1,
    nome: "Notificação de Nova Demanda",
    url: "https://api.exemplo.com/webhook/demandas",
    evento: "demanda.criada",
    ativo: true,
    ultimoEnvio: "2024-02-08 14:30",
    status: "success",
  },
  {
    id: 2,
    nome: "Integração ERP",
    url: "https://erp.empresa.com/api/callback",
    evento: "demanda.concluida",
    ativo: true,
    ultimoEnvio: "2024-02-08 10:15",
    status: "success",
  },
  {
    id: 3,
    nome: "Slack Notifications",
    url: "https://hooks.slack.com/services/xxx",
    evento: "demanda.atribuida",
    ativo: false,
    ultimoEnvio: "2024-02-05 09:00",
    status: "error",
  },
  {
    id: 4,
    nome: "Sistema de Backup",
    url: "https://backup.interno.com/sync",
    evento: "empresa.criada",
    ativo: true,
    ultimoEnvio: null,
    status: null,
  },
];

const eventosDisponiveis = [
  { id: "demanda.criada", label: "Demanda Criada" },
  { id: "demanda.atribuida", label: "Demanda Atribuída" },
  { id: "demanda.concluida", label: "Demanda Concluída" },
  { id: "empresa.criada", label: "Empresa Criada" },
  { id: "pessoa.criada", label: "Pessoa Criada" },
  { id: "usuario.criado", label: "Usuário Criado" },
];

const WebhookConfig = () => {
  const [webhooks, setWebhooks] = useState(mockWebhooks);

  const toggleAtivo = (id: number) => {
    setWebhooks(
      webhooks.map((w) =>
        w.id === id ? { ...w, ativo: !w.ativo } : w
      )
    );
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Webhooks</h2>
          <p className="text-muted-foreground">
            Configure integrações e notificações automáticas
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Webhook
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Webhooks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{webhooks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Webhooks Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {webhooks.filter((w) => w.ativo).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Webhooks Inativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground">
              {webhooks.filter((w) => !w.ativo).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhooks Configurados
          </CardTitle>
          <CardDescription>
            Endpoints para integração com sistemas externos
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Último Envio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-medium">{webhook.nome}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate">
                        {webhook.url}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyUrl(webhook.url)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{webhook.evento}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {webhook.ultimoEnvio || "Nunca"}
                  </TableCell>
                  <TableCell>
                    {webhook.status === "success" && (
                      <Badge className="bg-green-100 text-green-700">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Sucesso
                      </Badge>
                    )}
                    {webhook.status === "error" && (
                      <Badge className="bg-red-100 text-red-700">
                        <XCircle className="h-3 w-3 mr-1" />
                        Erro
                      </Badge>
                    )}
                    {!webhook.status && (
                      <Badge variant="secondary">Aguardando</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={webhook.ativo}
                      onCheckedChange={() => toggleAtivo(webhook.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos Disponíveis</CardTitle>
          <CardDescription>
            Eventos que podem disparar webhooks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {eventosDisponiveis.map((evento) => (
              <div
                key={evento.id}
                className="p-3 rounded-lg bg-muted/50 text-center"
              >
                <code className="text-xs text-primary">{evento.id}</code>
                <p className="text-sm mt-1">{evento.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WebhookConfig;
