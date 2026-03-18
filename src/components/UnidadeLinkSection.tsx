import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";
import {
  LinkFormData,
  emptyLinkData,
  CONFIG_REDE_OPTIONS,
  TIPO_LINK_OPTIONS,
} from "@/lib/operadoras";

interface Operadora {
  id: number;
  nome: string;
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
  generatedHostname,
}: UnidadeLinkSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground">LINKS DE INTERNET</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Código + Abreviação (Prefixo Hostname)</Label>
          <Input
            value={hostnamePrefix}
            onChange={(e) => onHostnamePrefixChange(e.target.value.toUpperCase())}
            placeholder="Ex: 200ACL"
          />
        </div>
        <div>
          <Label>Hostname Zabbix (auto)</Label>
          <Input
            value={generatedHostname}
            readOnly
            className="bg-muted text-muted-foreground cursor-not-allowed"
            placeholder="Preencha o prefixo e os dados do link"
          />
        </div>
      </div>

      <SingleLinkForm
        linkNumber={1}
        data={link1}
        onChange={onLink1Change}
        operadoras={operadoras}
      />

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
        <SingleLinkForm
          linkNumber={2}
          data={link2}
          onChange={(d) => onLink2Change(d)}
          onRemove={() => onLink2Change(null)}
          operadoras={operadoras}
        />
      )}
    </div>
  );
}
