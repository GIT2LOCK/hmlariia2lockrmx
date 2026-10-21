
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
      let body: { action?: string; conversation_id?: string; contact_id?: number | null };

      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "invalid_json" }, 400);
      }

      if (body.action === "list_contacts") {
        const { data: contacts, error: contactsError } = await db
          .from("contatos")
          .select("id, nome, telefone, email, tipo, empresa_id, unidade_id, empresas(nome_fantasia)")
          .in("tipo", ["responsavel", "pessoa"])
          .order("nome", { ascending: true })
          .limit(1000);

        if (contactsError) {
          console.error("[ariiatalk-conversas] Erro ao consultar contatos:", contactsError.message);
          return jsonResponse({ error: "contact_query_failed" }, 500);
        }

        return jsonResponse({ contacts: contacts ?? [] });
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
        const assignToMe = body.assign_to_me;

        if (!conversationId) {
          return jsonResponse({ error: "conversation_id_required" }, 400);
        }

        if (typeof assignToMe !== "boolean") {
          return jsonResponse({ error: "assign_to_me_required" }, 400);
        }

        const { data: conversation, error: conversationError } = await db
          .from("ariiatalk_conversas")
          .select("id")
          .eq("id", conversationId)
          .maybeSingle();

        if (conversationError || !conversation) {
          return jsonResponse({ error: "conversation_not_found" }, 404);
        }

        const { error: updateError } = await db
          .from("ariiatalk_conversas")
          .update({ responsavel_id: assignToMe ? caller.id : null })
          .eq("id", conversationId);

        if (updateError) {
          console.error("[ariiatalk-conversas] Erro ao atribuir conversa:", updateError.message);
          return jsonResponse({ error: "conversation_assignment_failed" }, 500);
        }

        return jsonResponse({
          success: true,
          conversation_id: conversationId,
          responsavel_id: assignToMe ? caller.id : null,
        });
      }

      return jsonResponse({ error: "unknown_action" }, 400);
    }

    const { data: conversations, error } = await db
      .from("ariiatalk_conversas")
      .select(`
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
        criado_em,
        ariiatalk_instancias (
          id,
          nome,
          telefone,
          status
        )
      `)
      .order("ultima_mensagem_em", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(100);

    if (error) {
      console.error("[ariiatalk-conversas] Erro ao consultar conversas:", error.message);
      return jsonResponse({ error: "conversation_query_failed" }, 500);
    }

    return jsonResponse({ conversations: conversations ?? [] });
  } catch (error) {
    return authErrorResponse(error, corsHeaders);
  }
});

