// Recebe e-mails do N8N e cria/atualiza tickets
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decode as b64decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SLA_ATENDIMENTO: Record<string, number> = { CRITICO: 15, ALTO: 30, MEDIO: 120, BAIXO: 480 };
const SLA_SOLUCAO: Record<string, number> = { CRITICO: 240, ALTO: 480, MEDIO: 1440, BAIXO: 4320 };
const PAUSED = ["AGUARDANDO_CLIENTE", "AGUARDANDO_OPERADORA", "AGUARDANDO_TERCEIRO", "AGENDADO", "TRIAGEM"];

// Detecta auto-reply para evitar loops
function isAutoReply(headers: Record<string, string> = {}, subject = ""): boolean {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (h["x-auto-response-suppress"]) return true;
  if (h["precedence"] && ["bulk", "auto_reply", "junk"].includes(h["precedence"])) return true;
  if (h["x-autoreply"] === "yes" || h["x-autorespond"]) return true;
  const s = subject.toLowerCase();
  if (/^(auto[- ]?reply|out of office|automatic reply|resposta autom[aá]tica|f[eé]rias|ausente)/i.test(s)) return true;
  return false;
}

function extractTicketId(subject: string): number | null {
  const m = subject.match(/\[Ticket\s*#(\d+)\]/i);
  return m ? Number(m[1]) : null;
}

function normalizeSubject(s: string): string {
  return (s || "")
    .replace(/\[Ticket\s*#\d+\]/gi, "")
    .replace(/^(\s*(re|res|fwd?|enc|encaminhado|i:)\s*:\s*)+/gi, "")
    .trim()
    .toLowerCase();
}

const OPEN_STATUSES = ["NOVO", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE", "AGUARDANDO_OPERADORA", "AGUARDANDO_TERCEIRO", "AGENDADO", "TRIAGEM"];

function isHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

function cleanBody(body: string): string {
  if (!body) return "";
  // Se for HTML, preserva integralmente (sanitização ocorre no frontend)
  if (isHtml(body)) return body.trim();
  // remove citações (linhas começando com >) e separadores comuns para texto puro
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  for (const ln of lines) {
    if (/^(>|Em .* escreveu:|On .* wrote:|De:|From:|-{3,}\s*Mensagem original)/i.test(ln.trim())) break;
    out.push(ln);
  }
  return out.join("\n").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("EMAIL_INGEST_TOKEN");
  const provided = req.headers.get("x-api-token") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const payload = await req.json();
    const from: string = (payload.from || "").trim();
    const subject: string = (payload.subject || "").trim();
    const body: string = payload.body || payload.text || payload.html || "";
    const headers = payload.headers || {};
    const attachments: Array<{ filename: string; content: string; contentType?: string }> = payload.attachments || [];

    if (!from) return json({ error: "from obrigatório" }, 400);

    // Validar email
    const emailMatch = from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (!emailMatch) return json({ error: "from inválido" }, 400);
    const email = emailMatch[0].toLowerCase();
    const domain = email.split("@")[1];

    // Anti-loop / auto-reply
    if (isAutoReply(headers, subject)) {
      console.log("[ingest] auto-reply ignorado:", subject);
      return json({ ok: true, ignored: "auto-reply" });
    }
    // SPAM básico
    const spamScore = headers["x-spam-score"] || headers["X-Spam-Score"];
    if (spamScore && Number(spamScore) >= 5) {
      return json({ ok: true, ignored: "spam" });
    }

    const cleanedBody = cleanBody(body);
    let ticketId = extractTicketId(subject);

    // Headers normalizados (lowercase)
    const hLower: Record<string, string> = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])
    );

    // Tenta achar ticket aberto pelo In-Reply-To/References (Message-ID original do envio do sistema)
    // ou pelo assunto normalizado + remetente.
    if (!ticketId) {
      const refIds = `${hLower["in-reply-to"] || ""} ${hLower["references"] || ""}`;
      const refMatches = Array.from(refIds.matchAll(/ticket[-_]?(\d+)@/gi)).map((m) => Number(m[1]));
      for (const tid of refMatches) {
        const { data: t } = await supabase.from("tickets").select("id,status").eq("id", tid).maybeSingle();
        if (t && OPEN_STATUSES.includes(t.status)) { ticketId = t.id; break; }
      }
    }
    if (!ticketId) {
      const norm = normalizeSubject(subject);
      if (norm) {
        const { data: candidates } = await supabase
          .from("tickets")
          .select("id,titulo,status,solicitante_email,criado_em")
          .ilike("solicitante_email", email)
          .in("status", OPEN_STATUSES)
          .order("criado_em", { ascending: false })
          .limit(20);
        const match = (candidates || []).find((t) => normalizeSubject(t.titulo || "") === norm);
        if (match) ticketId = match.id;
      }
    }

    let ticket: any = null;

    // Resolve nome amigável do remetente (contatos -> usuarios)
    let resolvedSenderName: string | null = null;
    {
      const { data: c1 } = await supabase
        .from("contatos").select("nome").ilike("email", email).limit(1).maybeSingle();
      if (c1?.nome) resolvedSenderName = c1.nome;
      if (!resolvedSenderName) {
        const { data: u1 } = await supabase
          .from("usuarios").select("nome").ilike("email", email).limit(1).maybeSingle();
        if (u1?.nome) resolvedSenderName = u1.nome;
      }
    }
    const authorDisplay = resolvedSenderName ? `${resolvedSenderName} <${email}>` : from;

    if (ticketId) {
      // ATUALIZAÇÃO
      const { data: cur } = await supabase.from("tickets").select("*").eq("id", ticketId).maybeSingle();
      if (!cur) return json({ error: "Ticket não encontrado" }, 404);
      ticket = cur;

      // Comentário público
      await supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        conteudo: cleanedBody || "(sem conteúdo)",
        tipo: "CLIENTE",
        autor_nome: authorDisplay,
      });

      // Reabrir / mover status
      const update: Record<string, unknown> = {};
      const now = new Date().toISOString();
      if (cur.status === "RESOLVIDO" || cur.status === "FECHADO") {
        update.status = "EM_ATENDIMENTO";
        update.data_solucao = null;
        update.data_fechamento = null;
      } else if (cur.status === "AGUARDANDO_CLIENTE") {
        update.status = "EM_ATENDIMENTO";
        // retomar SLA
        if (cur.sla_pausa_inicio) {
          update.sla_pausa_total_segundos = (cur.sla_pausa_total_segundos || 0) +
            Math.round((Date.now() - new Date(cur.sla_pausa_inicio).getTime()) / 1000);
          update.sla_pausa_inicio = null;
        }
      }
      if (Object.keys(update).length) {
        await supabase.from("tickets").update(update).eq("id", ticketId);
        await supabase.from("ticket_history").insert({
          ticket_id: ticketId, campo: "status",
          valor_anterior: cur.status, valor_novo: update.status,
          autor_nome: `email:${email}`,
          observacao: "Atualizado via e-mail",
        });
      }
    } else {
      // CRIAÇÃO
      // Tenta identificar o solicitante: contatos -> usuarios
      let empresa_id: number | null = null;
      let unidade_id: number | null = null;
      let solicitante_nome: string | null = null;
      let solicitante_telefone: string | null = null;

      // 1) contatos (cobre 'pessoa' e 'responsavel' — coluna tipo é enum)
      const { data: contato } = await supabase
        .from("contatos")
        .select("empresa_id, unidade_id, nome, telefone")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (contato) {
        empresa_id = contato.empresa_id ?? null;
        unidade_id = contato.unidade_id ?? null;
        solicitante_nome = contato.nome ?? null;
        solicitante_telefone = contato.telefone ?? null;
      }

      // 2) usuarios (fallback)
      if (!solicitante_nome) {
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("nome, telefone")
          .ilike("email", email)
          .limit(1)
          .maybeSingle();
        if (usuario) {
          solicitante_nome = usuario.nome ?? null;
          solicitante_telefone = solicitante_telefone || usuario.telefone || null;
        }
      }

      // Categoria padrão "Internet"
      let categoria_id: number | null = null;
      const { data: cat } = await supabase
        .from("ticket_categorias").select("id").ilike("nome", "Internet").limit(1).maybeSingle();
      if (cat) categoria_id = cat.id;

      const titulo = subject || `E-mail de ${email}`;
      const prioridade = "MEDIO";
      const { data: created, error: cErr } = await supabase.from("tickets").insert({
        titulo: titulo.slice(0, 255),
        descricao: cleanedBody || null,
        prioridade,
        status: "NOVO",
        origem: "EMAIL",
        empresa_id,
        unidade_id,
        categoria_id,
        solicitante_nome: solicitante_nome || from,
        solicitante_email: email,
        solicitante_telefone,
        sla_atendimento_minutos: SLA_ATENDIMENTO[prioridade],
        sla_solucao_minutos: SLA_SOLUCAO[prioridade],
      }).select("*").maybeSingle();
      if (cErr || !created) return json({ error: cErr?.message || "Erro ao criar" }, 500);
      ticket = created;

      // Primeiro comentário com o body
      await supabase.from("ticket_comments").insert({
        ticket_id: created.id,
        conteudo: cleanedBody || "(sem conteúdo)",
        tipo: "CLIENTE",
        autor_nome: authorDisplay,
      });
      await supabase.from("ticket_history").insert({
        ticket_id: created.id, campo: "criacao",
        valor_anterior: null, valor_novo: "EMAIL",
        autor_nome: `email:${email}`,
        observacao: `Criado via e-mail (domínio: ${domain})`,
      });
    }

    // Anexos — armazena, e mapeia Content-ID -> URL pública para reescrever cid: no HTML
    const cidMap: Record<string, string> = {};
    for (const att of attachments as Array<any>) {
      if (!att?.content || !att?.filename) continue;
      try {
        const bytes = b64decode(att.content);
        if (bytes.byteLength > 10 * 1024 * 1024) {
          console.log("[ingest] anexo > 10MB ignorado:", att.filename);
          continue;
        }
        const safe = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${ticket.id}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage.from("ticket-attachments")
          .upload(path, bytes, { contentType: att.contentType || "application/octet-stream" });
        if (!upErr) {
          await supabase.from("ticket_attachments").insert({
            ticket_id: ticket.id,
            storage_path: path,
            file_name: att.filename,
            mime_type: att.contentType || null,
            tamanho_bytes: bytes.byteLength,
            autor_nome: `email:${email}`,
          });
          // gera URL assinada longa para uso inline em <img src="cid:...">
          const cid = String(att.cid || att.contentId || att.content_id || "").replace(/^<|>$/g, "");
          if (cid) {
            const { data: signed } = await supabase.storage.from("ticket-attachments")
              .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 anos
            if (signed?.signedUrl) cidMap[cid.toLowerCase()] = signed.signedUrl;
          }
        }
      } catch (e) {
        console.error("anexo erro:", e);
      }
    }

    // Reescreve src="cid:XYZ" no descricao/comments do ticket
    if (Object.keys(cidMap).length > 0) {
      const rewrite = (html: string | null): string | null => {
        if (!html) return html;
        return html.replace(/src=(["'])cid:([^"'>\s]+)\1/gi, (m, q, id) => {
          const url = cidMap[String(id).toLowerCase()];
          return url ? `src=${q}${url}${q}` : m;
        });
      };
      // descrição (apenas em criação) e último comentário (em ambos os fluxos)
      const newDesc = rewrite(ticket.descricao);
      if (newDesc && newDesc !== ticket.descricao) {
        await supabase.from("tickets").update({ descricao: newDesc }).eq("id", ticket.id);
      }
      // atualiza último comentário criado neste request
      const { data: lastC } = await supabase.from("ticket_comments")
        .select("id, conteudo").eq("ticket_id", ticket.id)
        .order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (lastC) {
        const newC = rewrite(lastC.conteudo);
        if (newC && newC !== lastC.conteudo) {
          await supabase.from("ticket_comments").update({ conteudo: newC }).eq("id", lastC.id);
        }
      }
    }

    return json({ ok: true, ticket_id: ticket.id, codigo: ticket.codigo });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
