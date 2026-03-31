import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";

interface ImportUnidadesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface RowData {
  [key: string]: any;
}

const EXPECTED_COLUMNS_UNIDADE = [
  "empresa_nome_fantasia", "nome_unidade", "codigo_unidade", "hostname",
  "antiga_razao", "contato_nome", "telefone", "email", "email_regional",
  "logradouro", "numero", "complemento", "bairro", "cidade", "estado", "cep",
  "ddns", "observacoes",
];

const EXPECTED_COLUMNS_LINK1 = [
  "link1_operadora", "link1_tipo_link", "link1_config_rede", "link1_smart_sigma",
  "link1_pppoe_usuario", "link1_pppoe_senha",
  "link1_ip_estatico", "link1_mascara", "link1_gateway",
];

const EXPECTED_COLUMNS_CHAMADO1 = [
  "link1_chamado_designacao", "link1_chamado_cnpj",
  "link1_chamado_razao_social", "link1_chamado_telefone", "link1_chamado_email",
  "link1_chamado_numero_cliente", "link1_chamado_numero_contrato", "link1_chamado_observacoes",
];

const EXPECTED_COLUMNS_LINK2 = [
  "link2_operadora", "link2_tipo_link", "link2_config_rede", "link2_smart_sigma",
  "link2_pppoe_usuario", "link2_pppoe_senha",
  "link2_ip_estatico", "link2_mascara", "link2_gateway",
];

const EXPECTED_COLUMNS_CHAMADO2 = [
  "link2_chamado_designacao", "link2_chamado_cnpj",
  "link2_chamado_razao_social", "link2_chamado_telefone", "link2_chamado_email",
  "link2_chamado_numero_cliente", "link2_chamado_numero_contrato", "link2_chamado_observacoes",
];

const ALL_COLUMNS = [
  ...EXPECTED_COLUMNS_UNIDADE,
  ...EXPECTED_COLUMNS_LINK1,
  ...EXPECTED_COLUMNS_CHAMADO1,
  ...EXPECTED_COLUMNS_LINK2,
  ...EXPECTED_COLUMNS_CHAMADO2,
];

const generateTemplate = () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([ALL_COLUMNS]);
  
  // Set column widths
  ws["!cols"] = ALL_COLUMNS.map((col) => ({ wch: Math.max(col.length + 2, 15) }));
  
  XLSX.utils.book_append_sheet(wb, ws, "Unidades");
  XLSX.writeFile(wb, "modelo_importacao_unidades.xlsx");
};

export const ImportUnidadesModal = ({ open, onOpenChange, onSuccess }: ImportUnidadesModalProps) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);

  const reset = () => {
    setFile(null);
    setProgress(0);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
    }
  };

  const processImport = async () => {
    if (!file) return;
    setImporting(true);
    setProgress(0);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: RowData[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) {
        toast({ title: "Planilha vazia", variant: "destructive" });
        setImporting(false);
        return;
      }

      // Load empresas and operadoras for name matching
      const [{ data: empresas }, { data: operadoras }] = await Promise.all([
        supabase.from("empresas").select("id, nome_fantasia"),
        supabase.from("operadoras").select("id, nome"),
      ]);

      const empresaMap = new Map<string, number>();
      (empresas || []).forEach((e) => empresaMap.set(e.nome_fantasia.toLowerCase().trim(), e.id));

      const operadoraMap = new Map<string, number>();
      (operadoras || []).forEach((o) => operadoraMap.set(o.nome.toLowerCase().trim(), o.id));

      const errors: string[] = [];
      let success = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because header is row 1
        setProgress(Math.round(((i + 1) / rows.length) * 100));

        try {
          // Validate required fields
          const empresaNome = String(row.empresa_nome_fantasia || "").trim();
          const nomeUnidade = String(row.nome_unidade || "").trim().toUpperCase();

          if (!empresaNome || !nomeUnidade) {
            errors.push(`Linha ${rowNum}: empresa_nome_fantasia e nome_unidade são obrigatórios`);
            continue;
          }

          const empresaId = empresaMap.get(empresaNome.toLowerCase());
          if (!empresaId) {
            errors.push(`Linha ${rowNum}: Empresa "${empresaNome}" não encontrada`);
            continue;
          }

          // Validate link1 operadora (required)
          const link1Op = String(row.link1_operadora || "").trim();
          if (!link1Op) {
            errors.push(`Linha ${rowNum}: link1_operadora é obrigatório`);
            continue;
          }
          const link1OpId = operadoraMap.get(link1Op.toLowerCase());
          if (!link1OpId) {
            errors.push(`Linha ${rowNum}: Operadora "${link1Op}" não encontrada`);
            continue;
          }

          // Validate IP != Gateway for link1
          const l1Ip = String(row.link1_ip_estatico || "").trim();
          const l1Gw = String(row.link1_gateway || "").trim();
          if (l1Ip && l1Gw && l1Ip === l1Gw) {
            errors.push(`Linha ${rowNum}: Link 1 - IP não pode ser igual ao Gateway`);
            continue;
          }

          // Insert unidade
          const { data: inserted, error: uErr } = await supabase.from("unidades").insert({
            empresa_id: empresaId,
            nome_unidade: nomeUnidade,
            codigo_unidade: row.codigo_unidade || null,
            hostname: row.hostname || null,
            antiga_razao: row.antiga_razao || null,
            contato_nome: row.contato_nome || null,
            telefone: row.telefone || null,
            email: row.email || null,
            email_regional: row.email_regional || null,
            logradouro: row.logradouro || null,
            numero: row.numero ? String(row.numero) : null,
            complemento: row.complemento || null,
            bairro: row.bairro || null,
            cidade: row.cidade || null,
            estado: row.estado || null,
            cep: row.cep ? String(row.cep).replace(/\D/g, "").slice(0, 9) : null,
            ddns: row.ddns || null,
            observacoes: row.observacoes || null,
          }).select("id").single();

          if (uErr || !inserted) {
            errors.push(`Linha ${rowNum}: Erro ao inserir unidade - ${uErr?.message}`);
            continue;
          }

          const unitId = inserted.id;

          // Insert link 1
          const l1ConfigRede = String(row.link1_config_rede || "").trim();
          const { data: link1Inserted } = await supabase.from("links_internet").insert({
            unidade_id: unitId,
            operadora_id: link1OpId,
            tipo_link: row.link1_tipo_link || null,
            tipo_autenticacao: l1ConfigRede || null,
            smart_sigma: String(row.link1_smart_sigma).toLowerCase() === "sim" || row.link1_smart_sigma === true,
            pppoe_usuario: l1ConfigRede === "bridge_pppoe" ? (row.link1_pppoe_usuario || null) : null,
            pppoe_senha: l1ConfigRede === "bridge_pppoe" ? (row.link1_pppoe_senha || null) : null,
            ip_estatico: l1ConfigRede === "estatico" ? (l1Ip || null) : null,
            mascara: l1ConfigRede === "estatico" ? (row.link1_mascara || null) : null,
            gateway: l1ConfigRede === "estatico" ? (l1Gw || null) : null,
          }).select("id").single();

          // Insert chamado data for link 1
          if (link1Inserted) {
            const hasChamado1 = row.link1_chamado_designacao || row.link1_chamado_cnpj || row.link1_chamado_razao_social;
            if (hasChamado1) {
              await supabase.from("dados_abertura_chamado").insert({
                link_id: link1Inserted.id,
                designacao: row.link1_chamado_designacao || null,
                cnpj_abertura: row.link1_chamado_cnpj || null,
                razao_social_abertura: row.link1_chamado_razao_social || null,
                telefone_abertura: row.link1_chamado_telefone || null,
                email_abertura: row.link1_chamado_email || null,
                numero_cliente: row.link1_chamado_numero_cliente || null,
                numero_contrato: row.link1_chamado_numero_contrato || null,
                observacoes_abertura: row.link1_chamado_observacoes || null,
              });
            }
          }

          // Insert link 2 if present
          const link2Op = String(row.link2_operadora || "").trim();
          if (link2Op) {
            const link2OpId = operadoraMap.get(link2Op.toLowerCase());
            if (!link2OpId) {
              errors.push(`Linha ${rowNum}: Operadora Link 2 "${link2Op}" não encontrada (unidade criada sem link 2)`);
            } else {
              const l2Ip = String(row.link2_ip_estatico || "").trim();
              const l2Gw = String(row.link2_gateway || "").trim();
              if (l2Ip && l2Gw && l2Ip === l2Gw) {
                errors.push(`Linha ${rowNum}: Link 2 - IP não pode ser igual ao Gateway (unidade criada sem link 2)`);
              } else {
                const l2ConfigRede = String(row.link2_config_rede || "").trim();
                const { data: link2Inserted } = await supabase.from("links_internet").insert({
                  unidade_id: unitId,
                  operadora_id: link2OpId,
                  tipo_link: row.link2_tipo_link || null,
                  tipo_autenticacao: l2ConfigRede || null,
                  smart_sigma: String(row.link2_smart_sigma).toLowerCase() === "sim" || row.link2_smart_sigma === true,
                  pppoe_usuario: l2ConfigRede === "bridge_pppoe" ? (row.link2_pppoe_usuario || null) : null,
                  pppoe_senha: l2ConfigRede === "bridge_pppoe" ? (row.link2_pppoe_senha || null) : null,
                  ip_estatico: l2ConfigRede === "estatico" ? (l2Ip || null) : null,
                  mascara: l2ConfigRede === "estatico" ? (row.link2_mascara || null) : null,
                  gateway: l2ConfigRede === "estatico" ? (l2Gw || null) : null,
                }).select("id").single();

                if (link2Inserted) {
                  const hasChamado2 = row.link2_chamado_designacao || row.link2_chamado_cnpj || row.link2_chamado_razao_social;
                  if (hasChamado2) {
                    await supabase.from("dados_abertura_chamado").insert({
                      link_id: link2Inserted.id,
                      designacao: row.link2_chamado_designacao || null,
                      cnpj_abertura: row.link2_chamado_cnpj || null,
                      razao_social_abertura: row.link2_chamado_razao_social || null,
                      telefone_abertura: row.link2_chamado_telefone || null,
                      email_abertura: row.link2_chamado_email || null,
                      numero_cliente: row.link2_chamado_numero_cliente || null,
                      numero_contrato: row.link2_chamado_numero_contrato || null,
                      observacoes_abertura: row.link2_chamado_observacoes || null,
                    });
                  }
                }
              }
            }
          }

          success++;
        } catch (err: any) {
          errors.push(`Linha ${rowNum}: ${err.message}`);
        }
      }

      setResult({ success, errors });
      if (success > 0) onSuccess();
    } catch (err: any) {
      toast({ title: "Erro ao processar planilha", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar Unidades via Planilha
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" className="w-full gap-2" onClick={generateTemplate}>
            <Download className="h-4 w-4" /> Baixar Modelo da Planilha
          </Button>

          <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Selecione o arquivo .xlsx preenchido</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="block mx-auto text-sm"
            />
            {file && <p className="text-sm font-medium">{file.name}</p>}
          </div>

          {importing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Importando... {progress}%</p>
            </div>
          )}

          {result && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>{result.success} unidade(s) importada(s) com sucesso</span>
              </div>
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{result.errors.length} erro(s):</span>
                  </div>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive pl-6">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }} disabled={importing}>
            Fechar
          </Button>
          <Button onClick={processImport} disabled={!file || importing} className="gap-2">
            {importing ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
