import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/grafana.ts";
import { requireAriiaTalkAccess, authErrorResponse } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ariia-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return respond({ error: "method_not_allowed" }, 405);
  }

  try {
    const caller = await requireAriiaTalkAccess(req);
    const db = serviceClient();

    const { data: user, error: userError } = await db
      .from("usuarios")
      .select("id, ativo")
      .eq("id", caller.id)
      .maybeSingle();

    if (userError || !user || user.ativo !== true) {
      return respond({ error: "user_inactive_or_not_found" }, 403);
    }

    const { data: allowedTabs, error: tabsError } = await db.rpc(
      "fn_user_allowed_tabs",
      { _usuario_id: caller.id },
    );

    if (tabsError) {
      console.error("AriiaTalk permission check failed:", tabsError);
      return respond({ error: "permission_check_failed" }, 500);
    }

    const isAdmin = ["ADMIN", "SUPERADMIN"].includes(
      String(caller.permissao ?? "").toUpperCase(),
    );

    if (
      !isAdmin &&
      !(Array.isArray(allowedTabs) && allowedTabs.includes("ariiatalk"))
    ) {
      return respond({ error: "forbidden" }, 403);
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const conversationId = url.searchParams.get("conversa_id");

      if (!conversationId) {
        return respond({ error: "conversation_id_required" }, 400);
      }

      const { data: conversation, error: conversationError } = await db
        .from("ariiatalk_conversas")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationError) {
        console.error("Conversation lookup failed:", conversationError);
        return respond({ error: "conversation_query_failed" }, 500);
      }

      if (!conversation) {
        return respond({ error: "conversation_not_found" }, 404);
      }

      const { data: messages, error: messagesError } = await db
        .from("ariiatalk_mensagens")
        .select("id, conversa_id, evolution_message_id, direcao, tipo, conteudo, media_url, status, enviado_por, enviada_em, criado_em")
        .eq("conversa_id", conversationId)
        .order("criado_em", { ascending: true })
        .limit(500);

      if (messagesError) {
        console.error("Message history query failed:", messagesError);
        return respond({ error: "message_history_query_failed" }, 500);
      }

      await db
        .from("ariiatalk_conversas")
        .update({ nao_lidas: 0, atualizado_em: new Date().toISOString() })
        .eq("id", conversationId);

      return respond({ messages: messages ?? [] });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const conversationId = String(body.conversa_id ?? "").trim();
    const messageText = String(body.texto ?? "").trim();

    if (action === "history") {
      if (!conversationId) {
        return respond({ error: "conversation_id_required" }, 400);
      }

      const { data: conversation, error: conversationError } = await db
        .from("ariiatalk_conversas")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationError) {
        console.error("Conversation lookup failed:", conversationError);
        return respond({ error: "conversation_query_failed" }, 500);
      }

      if (!conversation) {
        return respond({ error: "conversation_not_found" }, 404);
      }

      const { data: messages, error: messagesError } = await db
        .from("ariiatalk_mensagens")
        .select("id, conversa_id, evolution_message_id, direcao, tipo, conteudo, media_url, status, enviado_por, enviada_em, criado_em")
        .eq("conversa_id", conversationId)
        .order("criado_em", { ascending: true })
        .limit(500);

      if (messagesError) {
        console.error("Message history query failed:", messagesError);
        return respond({ error: "message_history_query_failed" }, 500);
      }

      const { error: unreadError } = await db
        .from("ariiatalk_conversas")
        .update({ nao_lidas: 0, atualizado_em: new Date().toISOString() })
        .eq("id", conversationId);

      if (unreadError) {
        console.error("Unread counter update failed:", unreadError);
      }

      // Leitura individual: marca como visualizado apenas para o técnico atual.
      const { error: readError } = await db.from("ariiatalk_leituras").upsert(
        { conversa_id: conversationId, usuario_id: caller.id, lido_em: new Date().toISOString() },
        { onConflict: "conversa_id,usuario_id" },
      );
      if (readError) console.error("Read receipt update failed:", readError);

      return respond({ messages: messages ?? [] });
    }

    if (action !== "send") {
      return respond({ error: "unknown_action" }, 400);
    }

    if (!conversationId) {
      return respond({ error: "conversation_id_required" }, 400);
    }

    if (!messageText) {
      return respond({ error: "message_text_required" }, 400);
    }

    if (messageText.length > 4000) {
      return respond({ error: "message_too_long" }, 400);
    }

    const { data: conversation, error: conversationError } = await db
      .from("ariiatalk_conversas")
      .select("id, instancia_id, remote_jid, ariiatalk_instancias(id, evolution_instance_name, status)")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) {
      console.error("Conversation lookup failed:", conversationError);
      return respond({ error: "conversation_query_failed" }, 500);
    }

    if (!conversation) {
      return respond({ error: "conversation_not_found" }, 404);
    }

    const instanceData = conversation.ariiatalk_instancias as any;
    const instance = Array.isArray(instanceData) ? instanceData[0] : instanceData;

    if (!instance?.evolution_instance_name) {
      return respond({ error: "conversation_instance_not_found" }, 404);
    }

    const apiUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/+$/, "");
    const apiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!apiUrl || !apiKey) {
      return respond({ error: "evolution_secrets_not_configured" }, 500);
    }

    const instanceName = encodeURIComponent(instance.evolution_instance_name);
    const number = String(conversation.remote_jid).replace(/@s\.whatsapp\.net$/i, "");

    const { data: pendingMessage, error: pendingError } = await db
      .from("ariiatalk_mensagens")
      .insert({
        conversa_id: conversation.id,
        direcao: "saida",
        tipo: "text",
        conteudo: messageText,
        status: "enviando",
        enviado_por: caller.id,
      })
      .select("id")
      .single();

    if (pendingError || !pendingMessage) {
      console.error("Pending message creation failed:", pendingError);
      return respond({ error: "message_save_failed" }, 500);
    }

    try {
      const evoResponse = await fetch(
        `${apiUrl}/message/sendText/${instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify({
            number,
            text: messageText,
          }),
        },
      );

      const responseText = await evoResponse.text();
      let evoData: Record<string, any> = {};

      try {
        evoData = responseText ? JSON.parse(responseText) : {};
      } catch {
        evoData = { message: responseText };
      }

      if (!evoResponse.ok) {
        console.error("Evolution sendText failed:", evoResponse.status, evoData);

        await db
          .from("ariiatalk_mensagens")
          .update({
            status: "erro",
            payload: evoData,
          })
          .eq("id", pendingMessage.id);

        return respond({
          error: "evolution_send_failed",
          details: evoData,
        }, 502);
      }

      const messageId = evoData?.key?.id
        ?? evoData?.data?.key?.id
        ?? evoData?.message?.key?.id
        ?? null;

      const sentAt = new Date().toISOString();

      const { error: updateMessageError } = await db
        .from("ariiatalk_mensagens")
        .update({
          evolution_message_id: messageId,
          status: "enviada",
          enviada_em: sentAt,
          payload: evoData,
        })
        .eq("id", pendingMessage.id);

      if (updateMessageError) {
        console.error("Sent message update failed:", updateMessageError);
      }

      const { error: updateConversationError } = await db
        .from("ariiatalk_conversas")
        .update({
          ultima_mensagem: messageText,
          ultima_mensagem_em: sentAt,
          atualizado_em: sentAt,
        })
        .eq("id", conversation.id);

      if (updateConversationError) {
        console.error("Conversation update failed:", updateConversationError);
      }

      return respond({
        success: true,
        message: {
          id: pendingMessage.id,
          conversa_id: conversation.id,
          evolution_message_id: messageId,
          direcao: "saida",
          tipo: "text",
          conteudo: messageText,
          status: "enviada",
          enviado_por: caller.id,
          enviada_em: sentAt,
          criado_em: sentAt,
        },
      });
    } catch (sendError) {
      console.error("Evolution request failed:", sendError);

      await db
        .from("ariiatalk_mensagens")
        .update({ status: "erro" })
        .eq("id", pendingMessage.id);

      return respond({ error: "evolution_request_failed" }, 502);
    }
  } catch (error) {
    return authErrorResponse(error, corsHeaders);
  }
});


