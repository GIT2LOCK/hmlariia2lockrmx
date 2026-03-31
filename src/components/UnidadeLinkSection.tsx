import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";
import {
  LinkFormData,
  ChamadoFormData,
  emptyLinkData,
  CONFIG_REDE_OPTIONS,
  TIPO_LINK_OPTIONS,
} from "@/lib/operadoras";

interface Operadora {
  id: number;
  nome: string;
  telefone?: string | null;
}

interface UnidadeLinkSectionProps {
  hostnamePrefix: string;
  onHostnamePrefixChange: (v: string) => void;
  link1: LinkFormData;
  onLink1Change: (data: LinkFormData) => void;
  link2: LinkFormData | null;
  onLink2Change: (data: LinkFormData | null) => void;
  operadoras: Operadora[];
  hostname1: string;
  hostname2: string;
  ddns: string;
  onDdnsChange: (v: string) => void;
}

function SingleLinkForm({
  linkNumber,
  data,
  onChange,
  onRemove,
  operadoras,
}: {
  linkNumber: 1 | 2;
  data: LinkFormData;
  onChange: (d: LinkFormData) => void;
  onRemove?: () => void;
  operadoras: Operadora[];
}) {
  const selectedOp = operadoras.find((op) => String(op.id) === data.operadora_id);
  const opNome = selectedOp?.nome || "Operadora";
  const opTelefone = selectedOp?.telefone || "";

  const updateChamado = (partial: Partial<ChamadoFormData>) => {
    onChange({ ...data, chamado: { ...data.chamado, ...partial } });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          Link {linkNumber} {linkNumber === 1 ? "(Obrigatório)" : "(Opcional)"}
        </span>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-destructive gap-1">
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <Label>Operadora {linkNumber === 1 ? "*" : ""}</Label>
          <Select value={data.operadora_id} onValueChange={(v) => onChange({ ...data, operadora_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {operadoras.map((op) => (
                <SelectItem key={op.id} value={String(op.id)}>{op.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Configuração de Rede</Label>
          <Select value={data.config_rede} onValueChange={(v) => onChange({ ...data, config_rede: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {CONFIG_REDE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo de Link</Label>
          <Select value={data.tipo_link} onValueChange={(v) => onChange({ ...data, tipo_link: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {TIPO_LINK_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Checkbox
            checked={data.smart_sigma}
            onCheckedChange={(v) => onChange({ ...data, smart_sigma: v === true })}
          />
          <Label className="cursor-pointer">SmartSigma</Label>
        </div>
      </div>

      {/* PPPoE fields */}
      {data.config_rede === "bridge_pppoe" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <Label>Usuário PPPoE</Label>
            <Input
              value={data.pppoe_usuario}
              onChange={(e) => onChange({ ...data, pppoe_usuario: e.target.value })}
              placeholder="Usuário PPPoE"
            />
          </div>
          <div>
            <Label>Senha PPPoE</Label>
            <Input
              value={data.pppoe_senha}
              onChange={(e) => onChange({ ...data, pppoe_senha: e.target.value })}
              placeholder="Senha PPPoE"
            />
          </div>
        </div>
      )}

      {/* Estático fields */}
      {data.config_rede === "estatico" && (
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>IP</Label>
              <Input
                value={data.ip_estatico}
                onChange={(e) => onChange({ ...data, ip_estatico: e.target.value })}
                placeholder="Ex: 192.168.1.100"
                className={data.ip_estatico && data.gateway && data.ip_estatico.trim() === data.gateway.trim() ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </div>
            <div>
              <Label>Máscara</Label>
              <Input
                value={data.mascara}
                onChange={(e) => onChange({ ...data, mascara: e.target.value })}
                placeholder="Ex: 255.255.255.0"
              />
            </div>
            <div>
              <Label>Gateway</Label>
              <Input
                value={data.gateway}
                onChange={(e) => onChange({ ...data, gateway: e.target.value })}
                placeholder="Ex: 192.168.1.1"
                className={data.ip_estatico && data.gateway && data.ip_estatico.trim() === data.gateway.trim() ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </div>
          </div>
          {data.ip_estatico && data.gateway && data.ip_estatico.trim() === data.gateway.trim() && (
            <p className="text-sm text-destructive font-medium">O IP não pode ser igual ao Gateway.</p>
          )}
        </div>
      )}

      {/* DDNS - not available for estático */}
      {data.config_rede !== "estatico" && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              checked={data.ddns_enabled}
              onCheckedChange={(v) => onChange({ ...data, ddns_enabled: v === true, ddns: v ? data.ddns : "" })}
            />
            <Label className="cursor-pointer">DDNS</Label>
          </div>
          {data.ddns_enabled && (
            <div className="pt-1">
              <Label>Endereço DDNS</Label>
              <Input
                value={data.ddns}
                onChange={(e) => onChange({ ...data, ddns: e.target.value })}
                placeholder="Ex: unidade.ddns.net"
                className="max-w-sm"
              />
            </div>
          )}
        </>
      )}

      {/* Dados para abertura de chamado */}
      {data.operadora_id && (
        <>
          <Separator className="my-3" />
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground">
              DADOS PARA ABERTURA DE CHAMADO — {opNome}
            </h4>

            {opTelefone && (
              <div className="text-sm">
                <span className="text-muted-foreground">Telefone da Operadora:</span>{" "}
                <span className="font-medium text-foreground">{opTelefone}</span>
              </div>
            )}

            {data.smart_sigma ? (
              /* SmartSigma: only CNPJ */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>CNPJ *</Label>
                  <Input
                    value={data.chamado.cnpj_abertura}
                    onChange={(e) => updateChamado({ cnpj_abertura: e.target.value })}
                    placeholder="CNPJ para abertura de chamado"
                  />
                </div>
              </div>
            ) : (
              /* Non-SmartSigma: select Designação ou CNPJ, then Código */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Identificador</Label>
                  <Select
                    value={data.chamado.identificador_tipo}
                    onValueChange={(v) => updateChamado({ identificador_tipo: v as any, designacao: "", cnpj_abertura: "" })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="designacao">Designação</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {data.chamado.identificador_tipo === "designacao" && (
                  <div>
                    <Label>Designação</Label>
                    <Input
                      value={data.chamado.designacao}
                      onChange={(e) => updateChamado({ designacao: e.target.value })}
                      placeholder="Designação do circuito"
                    />
                  </div>
                )}
                {data.chamado.identificador_tipo === "cnpj" && (
                  <div>
                    <Label>CNPJ</Label>
                    <Input
                      value={data.chamado.cnpj_abertura}
                      onChange={(e) => updateChamado({ cnpj_abertura: e.target.value })}
                      placeholder="CNPJ para abertura"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function UnidadeLinkSection({
  hostnamePrefix,
  onHostnamePrefixChange,
  link1,
  onLink1Change,
  link2,
  onLink2Change,
  operadoras,
  hostname1,
  hostname2,
}: UnidadeLinkSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground">LINKS DE INTERNET</h3>

      <div>
        <Label>Código + Abreviação (Prefixo Hostname)</Label>
        <Input
          value={hostnamePrefix}
          onChange={(e) => onHostnamePrefixChange(e.target.value.toUpperCase())}
          placeholder="Ex: 200ACL"
          className="max-w-xs"
        />
      </div>

      <SingleLinkForm
        linkNumber={1}
        data={link1}
        onChange={onLink1Change}
        operadoras={operadoras}
      />
      {hostname1 && (
        <div>
          <Label className="text-xs text-muted-foreground">Hostname Zabbix - Link 1</Label>
          <Input value={hostname1} readOnly className="bg-muted text-muted-foreground cursor-not-allowed max-w-sm font-mono text-sm" />
        </div>
      )}

      {link2 === null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => onLink2Change(emptyLinkData)}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar Link 2
        </Button>
      ) : (
        <>
          <SingleLinkForm
            linkNumber={2}
            data={link2}
            onChange={(d) => onLink2Change(d)}
            onRemove={() => onLink2Change(null)}
            operadoras={operadoras}
          />
          {hostname2 && (
            <div>
              <Label className="text-xs text-muted-foreground">Hostname Zabbix - Link 2</Label>
              <Input value={hostname2} readOnly className="bg-muted text-muted-foreground cursor-not-allowed max-w-sm font-mono text-sm" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
