
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  serviceClient,
} from "../_shared/grafana.ts";
import {
  requireAriiaTalkAccess,
  authErrorResponse,
} from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ariia-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

/** Normaliza para o formato do WhatsApp (DDI + DDD + número). */
export function normalizePhone(v: unknown): string | null {
  let d = onlyDigits(v).replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 15) return null;
  return d;
}

function phoneVariants(d: string) {
  const set = new Set<string>([d]);
  if (d.startsWith("55") && d.length >= 12) set.add(d.slice(2));
  return [...set];
}

function safeTerm(v: unknown) {
  return String(v ?? "").replace(/[,()*%\\]/g, " ").trim().slice(0, 80);
}

const CONTACT_SELECT =
  "id, nome, telefone, email, tipo, categoria, empresa_id, unidade_id, empresas(nome_fantasia, cor), unidades(nome_unidade)";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    // Reutiliza a autenticação personalizada do Ariia.
    const caller = await requireAriiaTalkAccess(req);

    const db = serviceClient();

    const { data: user, error: userError } = await db
      .from("usuarios")
      .select("id, ativo")
      .eq("id", caller.id)
      .maybeSingle();

    if (userError || !user || user.ativo !== true) {
      return jsonResponse({ error: "user_inactive_or_not_found" }, 403);
    }

    const { data: allowedTabs, error: tabsError } = await db.rpc(
      "fn_user_allowed_tabs",
      { _usuario_id: caller.id },
    );

    if (tabsError) {
      console.error("[ariiatalk-conversas] Falha ao verificar permissões");
      return jsonResponse({ error: "permission_check_failed" }, 500);
    }

    if (
      !["ADMIN", "SUPERADMIN"].includes(caller.permissao) &&
      !(Array.isArray(allowedTabs) && allowedTabs.includes("ariiatalk"))
    ) {
      return jsonResponse({ error: "forbidden" }, 403);
    }


    if (req.method === "POST") {
      let body: Record<string, any>;

      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "invalid_json" }, 400);
      }

      if (body.action === "list_contacts") {
        const contacts: unknown[] = [];
        for (let offset = 0; ; offset += 1000) {
        const { data: page, error: contactsError } = await db
          .from("contatos")
          .select(CONTACT_SELECT)
          .in("tipo", ["responsavel", "pessoa", "contato"])
          .order("nome", { ascending: true }).order("id")
          .range(offset, offset + 999);

        if (contactsError) {
          console.error("[ariiatalk-conversas] Erro ao consultar contatos:", contactsError.message);
          return jsonResponse({ error: "contact_query_failed" }, 500);
        }

        contacts.push(...(page ?? []));
        if (!page || page.length < 1000) break;
        }
        return jsonResponse({ contacts });
      }

      if (body.action === "link_contact") {
        const conversationId = String(body.conversation_id ?? "").trim();
        const contactId = body.contact_id;

        if (!conversationId) {
          return jsonResponse({ error: "conversation_id_required" }, 400);
        }

        if (
          contactId !== null &&
          contactId !== undefined &&
          (!Number.isInteger(contactId) || contactId <= 0)
        ) {
          return jsonResponse({ error: "invalid_contact_id" }, 400);
        }

        const { data: conversation, error: conversationError } = await db
          .from("ariiatalk_conversas")
          .select("id")
          .eq("id", conversationId)
          .maybeSingle();

        if (conversationError || !conversation) {
          return jsonResponse({ error: "conversation_not_found" }, 404);
        }

        if (contactId !== null && contactId !== undefined) {
          const { data: contact, error: contactError } = await db
            .from("contatos")
            .select("id")
            .eq("id", contactId)
            .maybeSingle();

          if (contactError || !contact) {
            return jsonResponse({ error: "contact_not_found" }, 404);
          }
        }

        const { error: updateError } = await db
          .from("ariiatalk_conversas")
          .update({ contato_id: contactId ?? null })
          .eq("id", conversationId);

        if (updateError) {
          console.error("[ariiatalk-conversas] Erro ao associar contato:", updateError.message);
          return jsonResponse({ error: "contact_link_failed" }, 500);
        }

        return jsonResponse({ success: true, conversation_id: conversationId, contato_id: contactId ?? null });
      }


      if (body.action === "assign_conversation") {
        const conversationId = String(body.conversation_id ?? "").trim();
        if (!conversationId) return jsonResponse({ error: "conversation_id_required" }, 400);

        let targetId: number | null;
        if (typeof body.assign_to_me === "boolean") {
          targetId = body.assign_to_me ? caller.id : null;
        } else if (body.responsavel_id === null) {
          targetId = null;
        } else if (Number.isInteger(body.responsavel_id) && body.responsavel_id > 0) {
          targetId = body.responsavel_id;
        } else {
          return jsonResponse({ error: "responsavel_required" }, 400);
        }

        if (targetId !== null && targetId !== caller.id) {
          const { data: target } = await db
            .from("usuarios")
            .select("id, ativo, email, permissao")
            .eq("id", targetId)
            .maybeSingle();
          const email = String(target?.email ?? "").toLowerCase();
          if (!target || !target.ativo || !email.endsWith("@2lock.com.br") ||
              String(target.permissao ?? "").toUpperCase() === "CLIENTE") {
            return jsonResponse({ error: "invalid_responsavel" }, 400);
          }
        }

        const { data: conversation } = await db
          .from("ariiatalk_conversas").select("id, responsavel_id").eq("id", conversationId).maybeSingle();
        if (!conversation) return jsonResponse({ error: "conversation_not_found" }, 404);

        const now = new Date().toISOString();
        // Atribuição é interna: nada é enviado ao contato do WhatsApp.
        const { error: updateError } = await db
          .from("ariiatalk_conversas")
          .update({ responsavel_id: targetId, atribuido_por: caller.id, atribuido_em: now, atualizado_em: now })
          .eq("id", conversationId);
        if (updateError) {
          console.error("[ariiatalk-conversas] Erro ao atribuir conversa:", updateError.message);
          return jsonResponse({ error: "conversation_assignment_failed" }, 500);
        }

        await db.from("user_audit_log").insert({
          usuario_id: targetId ?? conversation.responsavel_id ?? caller.id,
          actor_usuario_id: caller.id,
          acao: targetId ? "ariiatalk_atribuir_conversa" : "ariiatalk_remover_atribuicao",
          detalhe: { conversa_id: conversationId, anterior: conversation.responsavel_id, novo: targetId },
        });

        return jsonResponse({ success: true, conversation_id: conversationId, responsavel_id: targetId });
      }

      if (body.action === "set_status") {
        const conversationId = String(body.conversation_id ?? "").trim();
        const status = body.status;
        if (!conversationId || !["open", "closed"].includes(status)) {
          return jsonResponse({ error: "invalid_status" }, 400);
        }
        const now = new Date().toISOString();
        const { error: updateError } = await db
          .from("ariiatalk_conversas")
          .update({
            status,
            encerrado_em: status === "closed" ? now : null,
            encerrado_por: status === "closed" ? caller.id : null,
            atualizado_em: now,
          })
          .eq("id", conversationId);
        if (updateError) return jsonResponse({ error: "status_update_failed" }, 500);
        return jsonResponse({ success: true });
      }

      if (body.action === "list_staff") {
        const { data: staff, error: staffError } = await db
          .from("usuarios")
          .select("id, nome, email, permissao")
          .eq("ativo", true)
          .ilike("email", "%@2lock.com.br")
          .order("nome");
        if (staffError) return jsonResponse({ error: "staff_query_failed" }, 500);
        return jsonResponse({
          staff: (staff ?? [])
            .filter((u) => String(u.permissao ?? "").toUpperCase() !== "CLIENTE")
            .map((u) => ({ id: u.id, nome: u.nome })),
        });
      }

      if (body.action === "list_empresas_unidades") {
        const [{ data: empresas }, { data: unidades }] = await Promise.all([
          db.from("empresas").select("id, nome_fantasia, cor").order("nome_fantasia"),
          db.from("unidades").select("id, nome_unidade, empresa_id").order("nome_unidade").limit(5000),
        ]);
        return jsonResponse({ empresas: empresas ?? [], unidades: unidades ?? [] });
      }

      if (body.action === "search") {
        const term = safeTerm(body.term);
        if (term.length < 2) return jsonResponse({ contacts: [], conversations: [] });
        const digits = onlyDigits(term);
        const variants = digits.length >= 4 ? phoneVariants(digits.replace(/^0+/, "")) : [];

        const contactOr = [`nome.ilike.%${term}%`, ...variants.map((v) => `telefone.ilike.%${v}%`)].join(",");
        const convOr = [`nome_contato.ilike.%${term}%`, ...variants.map((v) => `remote_jid.ilike.%${v}%`)].join(",");

        const [contactsRes, convRes] = await Promise.all([
          db.from("contatos").select(CONTACT_SELECT).or(contactOr).order("nome").limit(20),
          db.from("ariiatalk_conversas")
            .select("id, contato_id, nome_contato, remote_jid, status, responsavel_id, ultima_mensagem_em")
            .or(convOr).order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(20),
        ]);
        if (contactsRes.error || convRes.error) {
          console.error("[ariiatalk-conversas] Erro na pesquisa:", contactsRes.error ?? convRes.error);
          return jsonResponse({ error: "search_failed" }, 500);
        }

        // Também traz conversas dos contatos encontrados (vinculadas por contato_id).
        const contactIds = (contactsRes.data ?? []).map((c: any) => c.id);
        let linked: any[] = [];
        if (contactIds.length) {
          const { data } = await db.from("ariiatalk_conversas")
            .select("id, contato_id, nome_contato, remote_jid, status, responsavel_id, ultima_mensagem_em")
            .in("contato_id", contactIds);
          linked = data ?? [];
        }
        const convMap = new Map<string, any>();
        [...(convRes.data ?? []), ...linked].forEach((c) => convMap.set(c.id, c));
        return jsonResponse({ contacts: contactsRes.data ?? [], conversations: [...convMap.values()] });
      }

      if (body.action === "create_contact") {
        const nome = String(body.nome ?? "").trim().replace(/\s+/g, " ");
        const telefone = normalizePhone(body.telefone);
        const empresaId = body.empresa_id ? Number(body.empresa_id) : null;
        const unidadeId = body.unidade_id ? Number(body.unidade_id) : null;
        const categoria = String(body.categoria ?? "").trim().slice(0, 40) || null;

        if (nome.length < 2 || nome.length > 120) return jsonResponse({ error: "invalid_name" }, 400);
        if (!telefone) return jsonResponse({ error: "invalid_phone" }, 400);
        if ((empresaId !== null && !Number.isInteger(empresaId)) || (unidadeId !== null && !Number.isInteger(unidadeId))) {
          return jsonResponse({ error: "invalid_reference" }, 400);
        }

        let finalEmpresa = empresaId;
        if (unidadeId !== null) {
          const { data: un } = await db.from("unidades").select("id, empresa_id").eq("id", unidadeId).maybeSingle();
          if (!un) return jsonResponse({ error: "unidade_not_found" }, 400);
          if (empresaId !== null && un.empresa_id !== empresaId) return jsonResponse({ error: "unidade_outside_empresa" }, 400);
          finalEmpresa = un.empresa_id;
        }
        if (finalEmpresa !== null) {
          const { data: em } = await db.from("empresas").select("id").eq("id", finalEmpresa).maybeSingle();
          if (!em) return jsonResponse({ error: "empresa_not_found" }, 400);
        }

        const { data: dup } = await db.from("contatos").select(CONTACT_SELECT)
          .in("telefone", phoneVariants(telefone)).limit(1);
        if (dup && dup.length) return jsonResponse({ error: "duplicate_phone", contact: dup[0] }, 409);

        const { data: created, error: insertError } = await db.from("contatos")
          .insert({ nome, telefone, empresa_id: finalEmpresa, unidade_id: unidadeId, categoria, tipo: "contato" })
          .select(CONTACT_SELECT).single();
        if (insertError) {
          console.error("[ariiatalk-conversas] Erro ao criar contato:", insertError.message);
          return jsonResponse({ error: "contact_create_failed" }, 500);
        }
        return jsonResponse({ contact: created });
      }

      if (body.action === "start_conversation") {
        const contactId = Number(body.contact_id);
        if (!Number.isInteger(contactId) || contactId <= 0) return jsonResponse({ error: "invalid_contact_id" }, 400);
        const { data: contact } = await db.from("contatos").select("id, nome, telefone").eq("id", contactId).maybeSingle();
        if (!contact) return jsonResponse({ error: "contact_not_found" }, 404);
        const phone = normalizePhone(contact.telefone);
        if (!phone) return jsonResponse({ error: "contact_without_valid_phone" }, 400);

        let instanceId = String(body.instancia_id ?? "").trim();
        if (!instanceId) {
          // Reutiliza o histórico vinculado ao contato antes de escolher outra instância.
          const { data: linked, error: linkedError } = await db.from("ariiatalk_conversas")
            .select("id").eq("contato_id", contactId)
            .order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(1);
          if (linkedError) return jsonResponse({ error: "conversation_query_failed" }, 500);
          if (linked?.length) return jsonResponse({ conversation_id: linked[0].id, created: false });
          const { data: inst } = await db.from("ariiatalk_instancias").select("id, status")
            .order("criado_em").limit(20);
          const chosen = (inst ?? []).find((i) => i.status === "connected") ?? (inst ?? [])[0];
          if (!chosen) return jsonResponse({ error: "no_instance" }, 400);
          instanceId = chosen.id;
        }

        const jid = `${phone}@s.whatsapp.net`;
        // Evita duplicar: reutiliza conversa do mesmo número/instância ou vinculada ao contato.
        const { data: existing } = await db.from("ariiatalk_conversas").select("id, contato_id")
          .eq("instancia_id", instanceId).in("remote_jid", phoneVariants(phone).map((p) => `${p}@s.whatsapp.net`))
          .limit(1);
        if (existing && existing.length) {
          if (!existing[0].contato_id) {
            await db.from("ariiatalk_conversas").update({ contato_id: contactId }).eq("id", existing[0].id);
          }
          return jsonResponse({ conversation_id: existing[0].id, created: false });
        }

        const { data: created, error: createError } = await db.from("ariiatalk_conversas")
          .insert({ instancia_id: instanceId, remote_jid: jid, contato_id: contactId, nome_contato: contact.nome, status: "open", nao_lidas: 0 })
          .select("id").single();
        if (createError) {
          console.error("[ariiatalk-conversas] Erro ao iniciar conversa:", createError.message);
          return jsonResponse({ error: "conversation_create_failed" }, 500);
        }
        return jsonResponse({ conversation_id: created.id, created: true });
      }

      if (body.action === "list_notes") {
        const contactId = Number(body.contact_id);
        if (!Number.isInteger(contactId) || contactId <= 0) return jsonResponse({ error: "invalid_contact_id" }, 400);
        const { data, error: notesError } = await db.from("ariiatalk_contato_notas")
          .select("id, texto, criado_em, usuario_id, usuarios(nome)")
          .eq("contato_id", contactId).order("criado_em", { ascending: false }).limit(200);
        if (notesError) return jsonResponse({ error: "notes_query_failed" }, 500);
        return jsonResponse({ notes: data ?? [] });
      }

      if (body.action === "add_note") {
        const contactId = Number(body.contact_id);
        const texto = String(body.texto ?? "").trim();
        if (!Number.isInteger(contactId) || contactId <= 0) return jsonResponse({ error: "invalid_contact_id" }, 400);
        if (!texto || texto.length > 2000) return jsonResponse({ error: "invalid_note" }, 400);
        const { data: ct } = await db.from("contatos").select("id").eq("id", contactId).maybeSingle();
        if (!ct) return jsonResponse({ error: "contact_not_found" }, 404);
        const { data, error: insErr } = await db.from("ariiatalk_contato_notas")
          .insert({ contato_id: contactId, usuario_id: caller.id, texto })
          .select("id, texto, criado_em, usuario_id, usuarios(nome)").single();
        if (insErr) return jsonResponse({ error: "note_save_failed" }, 500);
        return jsonResponse({ note: data });
      }

      if (body.action === "delete_note") {
        const noteId = String(body.note_id ?? "");
        const { data: note } = await db.from("ariiatalk_contato_notas").select("id, usuario_id").eq("id", noteId).maybeSingle();
        if (!note) return jsonResponse({ error: "note_not_found" }, 404);
        const isAdmin = ["ADMIN", "SUPERADMIN"].includes(String(caller.permissao ?? "").toUpperCase());
        if (note.usuario_id !== caller.id && !isAdmin) return jsonResponse({ error: "forbidden" }, 403);
        await db.from("ariiatalk_contato_notas").delete().eq("id", noteId);
        return jsonResponse({ success: true });
      }

      if (body.action === "list_folders") {
        const { data, error: fErr } = await db.from("ariiatalk_pastas").select("id, nome, cor").order("nome");
        if (fErr) return jsonResponse({ error: "folders_query_failed" }, 500);
        return jsonResponse({ folders: data ?? [] });
      }

      if (body.action === "create_folder") {
        const nome = String(body.nome ?? "").trim().replace(/\s+/g, " ");
        const cor = typeof body.cor === "string" ? body.cor.slice(0, 20) : null;
        if (nome.length < 1 || nome.length > 60) return jsonResponse({ error: "invalid_name" }, 400);
        const { data, error: cErr } = await db.from("ariiatalk_pastas")
          .insert({ nome, cor, criado_por: caller.id }).select("id, nome, cor").single();
        if (cErr) return jsonResponse({ error: cErr.code === "23505" ? "folder_exists" : "folder_create_failed" }, cErr.code === "23505" ? 409 : 500);
        return jsonResponse({ folder: data });
      }

      if (body.action === "delete_folder") {
        const folderId = String(body.folder_id ?? "");
        const { error: dErr } = await db.from("ariiatalk_pastas").delete().eq("id", folderId);
        if (dErr) return jsonResponse({ error: "folder_delete_failed" }, 500);
        return jsonResponse({ success: true });
      }

      if (body.action === "toggle_folder") {
        const conversationId = String(body.conversation_id ?? "").trim();
        const folderId = String(body.folder_id ?? "").trim();
        if (!conversationId || !folderId) return jsonResponse({ error: "invalid_request" }, 400);
        if (body.add === true) {
          const { error: aErr } = await db.from("ariiatalk_conversa_pastas")
            .upsert({ conversa_id: conversationId, pasta_id: folderId, adicionado_por: caller.id }, { onConflict: "conversa_id,pasta_id" });
          if (aErr) return jsonResponse({ error: "folder_link_failed" }, 500);
        } else {
          await db.from("ariiatalk_conversa_pastas").delete().eq("conversa_id", conversationId).eq("pasta_id", folderId);
        }
        return jsonResponse({ success: true });
      }

      console.warn("[ariiatalk-conversas] Ação desconhecida:", String(body.action));
      return jsonResponse({ error: "unknown_action", action: String(body.action ?? "") }, 400);
    }

    const selectedId = new URL(req.url).searchParams.get("conversation_id");
    if (selectedId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedId)) {
      return jsonResponse({ error: "invalid_conversation_id" }, 400);
    }
    const selection = `
        id,
        instancia_id,
        remote_jid,
        contato_id,
        nome_contato,
        foto_url,
        ultima_mensagem,
        ultima_mensagem_em,
        nao_lidas,
        status,
        responsavel_id,
        atribuido_em,
        criado_em,
        ariiatalk_instancias (
          id,
          nome,
          telefone,
          status
        )
      `;
    const { data: conversations, error } = await db
      .from("ariiatalk_conversas")
      .select(selection)
      .order("ultima_mensagem_em", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(300);

    if (error) {
      console.error("[ariiatalk-conversas] Erro ao consultar conversas:", error.message);
      return jsonResponse({ error: "conversation_query_failed" }, 500);
    }

    const rows = conversations ?? [];
    if (selectedId && !rows.some(r => r.id === selectedId)) {
      const { data: selected, error: selectedError } = await db.from("ariiatalk_conversas").select(selection).eq("id", selectedId).maybeSingle();
      if (selectedError) return jsonResponse({ error: "conversation_query_failed" }, 500);
      if (selected) rows.push(selected);
    }
    const [{ data: unread }, staffRes, contactsRes, foldersRes] = await Promise.all([
      db.rpc("fn_ariiatalk_nao_lidas", { _usuario_id: caller.id }),
      db.from("usuarios").select("id, nome").in("id", [...new Set(rows.map((r: any) => r.responsavel_id).filter(Boolean))]),
      db.from("contatos").select(CONTACT_SELECT).in("id", [...new Set(rows.map((r: any) => r.contato_id).filter(Boolean))]),
      db.from("ariiatalk_conversa_pastas").select("conversa_id, pasta_id").in("conversa_id", rows.map((r: any) => r.id)),
    ]);
    const folderMap = new Map<string, string[]>();
    (foldersRes.data ?? []).forEach((f: any) => folderMap.set(f.conversa_id, [...(folderMap.get(f.conversa_id) ?? []), f.pasta_id]));
    const unreadMap = new Map<string, number>((unread ?? []).map((u: any) => [u.conversa_id, Number(u.nao_lidas)]));
    const staffMap = new Map<number, string>((staffRes.data ?? []).map((u: any) => [u.id, u.nome]));
    const contactMap = new Map<number, any>((contactsRes.data ?? []).map((c: any) => [c.id, c]));

    return jsonResponse({
      conversations: rows.map((r: any) => ({
        ...r,
        nao_lidas: unreadMap.get(r.id) ?? 0,
        responsavel_nome: r.responsavel_id ? staffMap.get(r.responsavel_id) ?? null : null,
        contato: r.contato_id ? contactMap.get(r.contato_id) ?? null : null,
        pasta_ids: folderMap.get(r.id) ?? [],
      })),
    });
  } catch (error) {
    return authErrorResponse(error, corsHeaders);
  }
});

