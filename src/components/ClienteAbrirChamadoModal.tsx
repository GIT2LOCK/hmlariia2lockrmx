import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Paperclip, X, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const CATEGORIAS_CLIENTE = [
  "Internet / Rede",
  "Wi-Fi",
  "Câmeras",
  "Computador / Notebook",
  "Sistema / Aplicação",
  "Impressora",
  "Telefonia",
  "Acesso / Login",
  "Equipamento sem funcionar",
  "Lentidão",
  "Outro",
];

const EQUIPAMENTOS_COMUNS = [
  "Roteador",
  "Switch",
  "Access Point / Wi-Fi",
  "Câmera",
  "DVR / NVR",
  "Computador / Notebook",
  "Impressora",
  "Telefone / Ramal",
  "Servidor",
];

const NAO_SEI = "__nao_sei__";

const IMPACTO_OPTIONS: Array<{
  value: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
  label: string;
  desc: string;
}> = [
  { value: "BAIXO", label: "Baixo", desc: "Consigo trabalhar normalmente" },
  { value: "MEDIO", label: "Médio", desc: "Está atrapalhando, mas ainda consigo trabalhar" },
  { value: "ALTO", label: "Alto", desc: "Está impedindo parte do trabalho" },
  { value: "CRITICO", label: "Crítico", desc: "Unidade parada ou serviço essencial fora" },
];

const schema = z.object({
  titulo: z.string().trim().min(3, "Informe um título com pelo menos 3 caracteres").max(180),
  categoria: z.string().min(1, "Selecione o tipo de problema"),
  descricao: z.string().trim().min(5, "Descreva o problema com mais detalhes").max(5000),
  impacto: z.enum(["BAIXO", "MEDIO", "ALTO", "CRITICO"]),
  unidade_id: z.string().optional(),
  equipamento: z.string().optional(),
  paraOutraPessoa: z.boolean(),
  pessoa_nome: z.string().trim().max(120).optional(),
  pessoa_email: z.string().trim().email("E-mail inválido").max(180).optional().or(z.literal("")),
  pessoa_telefone: z.string().trim().max(40).optional(),
});

export function ClienteAbrirChamadoModal({ open, onOpenChange, onSaved }: Props) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [unidades, setUnidades] = useState<Array<{ id: number; nome: string }>>([]);
  const [equipamentosUsados, setEquipamentosUsados] = useState<string[]>([]);
  const [categoriasMap, setCategoriasMap] = useState<Record<string, number>>({});
  const [responsaveisAll, setResponsaveisAll] = useState<Array<{ id: number; nome: string; email: string | null; unidade_id: number | null; cobre_empresa_inteira: boolean }>>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [form, setForm] = useState({
    titulo: "",
    categoria: "",
    descricao: "",
    impacto: "MEDIO" as "BAIXO" | "MEDIO" | "ALTO" | "CRITICO",
    unidade_id: "",
    equipamento: "",
    paraOutraPessoa: false,
    pessoa_nome: "",
    pessoa_email: "",
    pessoa_telefone: "",
  });

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setForm({
      titulo: "", categoria: "", descricao: "", impacto: "MEDIO",
      unidade_id: "", equipamento: "",
      paraOutraPessoa: false, pessoa_nome: "", pessoa_email: "", pessoa_telefone: "",
    });
    setPendingFiles([]);
  }, [open]);

  // Load unidades + equipamentos + categorias (scoped by empresa do usuário)
  useEffect(() => {
    if (!open || !user?.empresa_id) return;
    (async () => {
      const [un, ats, cats, resp] = await Promise.all([
        supabase
          .from("unidades")
          .select("id,nome_unidade")
          .eq("empresa_id", user.empresa_id!)
          .order("nome_unidade"),
        supabase
          .from("tickets")
          .select("ativo")
          .eq("empresa_id", user.empresa_id!)
          .not("ativo", "is", null)
          .limit(300),
        supabase
          .from("ticket_categorias")
          .select("id,nome")
          .is("parent_id", null),
        supabase
          .from("contatos")
          .select("id,nome,email,unidade_id,cobre_empresa_inteira")
          .eq("empresa_id", user.empresa_id!)
          .eq("tipo", "responsavel"),
      ]);
      setResponsaveisAll((resp.data || []) as any);
      const us = (un.data || []).map((u: any) => ({ id: u.id, nome: u.nome_unidade }));
      setUnidades(us);
      const distinct = Array.from(
        new Set(
          ((ats.data || []) as any[])
            .map((r) => (r.ativo || "").toString().trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt"));
      setEquipamentosUsados(distinct);
      const map: Record<string, number> = {};
      for (const c of (cats.data || []) as any[]) {
        map[(c.nome || "").toLowerCase()] = c.id;
      }
      setCategoriasMap(map);

      // se houver exatamente uma unidade, pré-seleciona
      if (us.length === 1) {
        setForm((f) => ({ ...f, unidade_id: String(us[0].id) }));
      }
    })();
  }, [open, user?.empresa_id]);

  const equipamentoOptions = useMemo(() => {
    const set = new Set<string>(EQUIPAMENTOS_COMUNS);
    for (const e of equipamentosUsados) set.add(e);
    return Array.from(set);
  }, [equipamentosUsados]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const valid: File[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        toast({ title: "Arquivo muito grande", description: `${f.name} excede 5MB`, variant: "destructive" });
        continue;
      }
      valid.push(f);
    }
    setPendingFiles((p) => [...p, ...valid]);
  };

  const uploadAttachments = async (tid: number) => {
    for (const file of pendingFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tid}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("ticket-attachments")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) {
        toast({ title: "Erro ao enviar anexo", description: `${file.name}: ${upErr.message}`, variant: "destructive" });
        continue;
      }
      await supabase.from("ticket_attachments").insert({
        ticket_id: tid,
        autor_id: user?.id ? Number(user.id) : null,
        autor_nome: user?.nome || null,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
      });
    }
  };

  const handleSubmit = async () => {
    if (!user?.empresa_id) {
      toast({
        title: "Conta sem empresa vinculada",
        description: "Entre em contato com o suporte da 2LOCK para vincular sua conta a uma empresa antes de abrir chamados.",
        variant: "destructive",
      });
      return;
    }

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast({ title: "Verifique os campos", description: first || "Dados inválidos", variant: "destructive" });
      return;
    }
    if (unidades.length > 1 && !form.unidade_id) {
      toast({ title: "Selecione onde está acontecendo", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const unidadeIdFinal =
        form.unidade_id ? Number(form.unidade_id) : (unidades.length === 1 ? unidades[0].id : null);

      const ativoFinal =
        !form.equipamento || form.equipamento === NAO_SEI ? null : form.equipamento;

      const categoriaId = categoriasMap[form.categoria.toLowerCase()] ?? null;

      const solicitanteNome = form.paraOutraPessoa
        ? form.pessoa_nome.trim() || user.nome
        : `${user.nome}${user.sobrenome ? " " + user.sobrenome : ""}`.trim();
      const solicitanteEmail = form.paraOutraPessoa
        ? (form.pessoa_email.trim() || user.email || null)
        : (user.email || null);
      const solicitanteTel = form.paraOutraPessoa
        ? (form.pessoa_telefone.trim() || null)
        : null;

      const payload: any = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        prioridade: form.impacto,
        // status / tipo_chamado / empresa_id / criado_por / tecnico / fila são forçados pelo trigger fn_ticket_cliente_guard
        status: "NOVO",
        tipo_chamado: "T",
        empresa_id: user.empresa_id,
        unidade_id: unidadeIdFinal,
        categoria_id: categoriaId,
        ativo: ativoFinal,
        origem: "MANUAL",
        solicitante_nome: solicitanteNome,
        solicitante_email: solicitanteEmail,
        solicitante_telefone: solicitanteTel,
        criado_por: user.id,
      };

      const sessionToken = localStorage.getItem("auth_token") || "";
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        "create-ticket-cliente",
        {
          body: payload,
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
      );
      const data = (fnData as any)?.ticket as { id: number; codigo: string } | undefined;
      const error = fnError
        ? { message: (fnError as any).message || "Falha ao abrir chamado" }
        : (fnData as any)?.error
        ? { message: (fnData as any).error }
        : null;

      if (error) {
        toast({ title: "Erro ao abrir chamado", description: error.message, variant: "destructive" });
        return;
      }


      if (data?.id) await uploadAttachments(data.id);

      toast({
        title: "Chamado aberto",
        description: data?.codigo ? `Seu chamado ${data.codigo} foi registrado.` : "Seu chamado foi registrado.",
      });
      onOpenChange(false);
      onSaved?.();
    } finally {
      setLoading(false);
    }
  };

  const mostraUnidade = unidades.length > 1;

  const responsaveisFixos = useMemo(() => {
    const unidId = form.unidade_id ? Number(form.unidade_id) : (unidades.length === 1 ? unidades[0].id : null);
    const list = responsaveisAll.filter((r) => r.cobre_empresa_inteira || (unidId && r.unidade_id === unidId));
    const seen = new Set<string>();
    const unidLabel = (id: number) => unidades.find((u) => u.id === id)?.nome || null;
    return list.filter((r) => {
      const key = (r.email || `id:${r.id}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      (r as any)._unidade_label = r.unidade_id ? unidLabel(r.unidade_id) : null;
      return true;
    });
  }, [responsaveisAll, form.unidade_id, unidades]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrir chamado</DialogTitle>
          <DialogDescription>
            Conte para a gente o que está acontecendo. Quanto mais detalhes, mais rápido conseguimos te ajudar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="ccm-titulo">Título do chamado <span className="text-destructive">*</span></Label>
            <Input
              id="ccm-titulo"
              value={form.titulo}
              maxLength={180}
              placeholder="Ex: Internet lenta na unidade Jundiaí"
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            />
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <Label>Qual o tipo de problema? <span className="text-destructive">*</span></Label>
            <Select
              value={form.categoria}
              onValueChange={(v) => setForm({ ...form, categoria: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione o tipo de problema" /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS_CLIENTE.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Escolha a opção que mais se parece com o problema. Se estiver em dúvida, selecione "Outro".
            </p>
          </div>

          {/* Unidade (condicional) */}
          {mostraUnidade && (
            <div className="space-y-1.5">
              <Label>Onde está acontecendo? <span className="text-destructive">*</span></Label>
              <Select
                value={form.unidade_id}
                onValueChange={(v) => setForm({ ...form, unidade_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Equipamento */}
          <div className="space-y-1.5">
            <Label>Equipamento afetado</Label>
            <Select
              value={form.equipamento}
              onValueChange={(v) => setForm({ ...form, equipamento: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione o equipamento, se souber" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NAO_SEI}>Não sei informar</SelectItem>
                {equipamentoOptions.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Caso não saiba qual equipamento está com problema, selecione "Não sei informar".
            </p>
          </div>

          {/* Impacto */}
          <div className="space-y-2">
            <Label>Qual o impacto do problema?</Label>
            <p className="text-xs text-muted-foreground">Informe o quanto esse problema está afetando o trabalho.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {IMPACTO_OPTIONS.map((opt) => {
                const active = form.impacto === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setForm({ ...form, impacto: opt.value })}
                    className={`text-left rounded-md border px-3 py-2 transition-colors ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="ccm-desc">Descreva o problema <span className="text-destructive">*</span></Label>
            <Textarea
              id="ccm-desc"
              rows={5}
              maxLength={5000}
              value={form.descricao}
              placeholder="Explique o que aconteceu, quando começou, quem foi afetado e se aparece alguma mensagem de erro."
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          {/* Anexos */}
          <div className="space-y-2">
            <Label>Anexos</Label>
            <p className="text-xs text-muted-foreground">
              Envie prints, fotos do equipamento ou mensagens de erro. Máx. 5MB por arquivo. Fotos e prints ajudam a resolver o chamado mais rápido.
            </p>
            <label className="flex items-center gap-2 border border-dashed rounded-md px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>Clique para selecionar arquivos</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
            </label>
            {pendingFiles.length > 0 && (
              <div className="space-y-1">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-primary/5 rounded px-2 py-1">
                    <span className="flex items-center gap-2 truncate">
                      <Paperclip className="h-3.5 w-3.5" />
                      {f.name} <span className="text-xs text-muted-foreground">({Math.round(f.size / 1024)} KB)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
                      className="text-destructive hover:opacity-70"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Para outra pessoa */}
          <div className="rounded-md border p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={form.paraOutraPessoa}
                onCheckedChange={(v) => setForm({ ...form, paraOutraPessoa: !!v })}
              />
              <span className="text-sm">Estou abrindo este chamado para outra pessoa</span>
            </label>
            {form.paraOutraPessoa && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Nome da pessoa afetada</Label>
                  <Input
                    value={form.pessoa_nome}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, pessoa_nome: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone ou ramal</Label>
                  <Input
                    value={form.pessoa_telefone}
                    maxLength={40}
                    onChange={(e) => setForm({ ...form, pessoa_telefone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={form.pessoa_email}
                    maxLength={180}
                    onChange={(e) => setForm({ ...form, pessoa_email: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Abrindo..." : "Abrir chamado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
