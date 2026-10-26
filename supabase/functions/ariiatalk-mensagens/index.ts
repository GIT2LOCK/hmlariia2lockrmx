import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/grafana.ts";
import { requireAriiaTalkAccess, authErrorResponse } from "../_shared/authz.ts";
import { normalizeSignature, outgoingText } from "../_shared/ariiatalkSignature.ts";
import { sentConversationUpdate } from "../_shared/ariiatalkLifecycle.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";
import { buildQuoted, quoteSnapshot } from "../_shared/ariiatalkMessageActions.ts";
import { annotateMessage, editMessage } from "./messageActions.ts";
import { ATTACHMENT_BUCKET, ATTACHMENT_RETENTION_MS, EXPIRED_MEDIA, MAX_ATTACHMENT_BYTES, attachmentInfo, isAttachmentExpired, mediaPayload } from "../_shared/ariiatalkAttachments.ts";

const historyFields = "id, conversa_id, evolution_message_id, direcao, tipo, conteudo, media_url, status, enviado_por, autor_nome, enviada_em, criado_em, resposta_mensagem_id, resposta_snapshot, editada_em, remetente_nome, remetente_jid";

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Remove arquivos com mais de 30 dias (lote pequeno, executado a cada envio/leitura).
async function purgeExpiredAttachments(db: ReturnType<typeof serviceClient>) {
  const prefix = `storage://${ATTACHMENT_BUCKET}/`;
  const cutoff = new Date(Date.now() - ATTACHMENT_RETENTION_MS).toISOString();
  const { data } = await db.from("ariiatalk_mensagens").select("id, media_url").like("media_url", `${prefix}%`).lt("criado_em", cutoff).limit(100);
  if (!data?.length) return;
  const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove(data.map(m => m.media_url.slice(prefix.length)));
  if (error) { console.error("Attachment purge failed:", error); return; }
  await db.from("ariiatalk_mensagens").update({ media_url: EXPIRED_MEDIA }).in("id", data.map(m => m.id));
}

async function withAuthors(db: ReturnType<typeof serviceClient>, messages: any[]) {
  if (!messages.length) return messages;
  purgeExpiredAttachments(db).catch(e => console.error("purge", e));
  messages = await Promise.all(messages.map(async message => {
    const prefix = `storage://${ATTACHMENT_BUCKET}/`;
    if (message.media_url === EXPIRED_MEDIA || (message.media_url?.startsWith(prefix) && isAttachmentExpired(message.criado_em))) {
      return { ...message, media_url: null, media_expirada: true };
    }
    if (!message.media_url?.startsWith(prefix)) return message;
    const { data } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(message.media_url.slice(prefix.length), 3600);
    return data?.signedUrl ? { ...message, media_url: data.signedUrl } : { ...message, media_url: null, media_expirada: true };
  }));
  const { data: annotations, error: annotationsError } = await db.from("ariiatalk_mensagem_anotacoes").select("*, usuarios(nome)").in("mensagem_id", messages.map(m => m.id));
  if (annotationsError) throw annotationsError;
  messages = messages.map(m => ({ ...m, anotacoes: (annotations ?? []).filter(a => a.mensagem_id === m.id) }));
  const ids = [...new Set(messages.map((m) => m.enviado_por).filter((id) => id != null))];
  if (!ids.length) return messages;
  const { data: authors, error } = await db.from("usuarios").select("id, nome").in("id", ids);
  if (error) throw error;
  const names = new Map((authors ?? []).map((author: any) => [author.id, author.nome]));
  return messages.map((m) => ({ ...m, autor_nome: m.autor_nome || names.get(m.enviado_por) || null }));
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
      .select("id, ativo, nome")
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
        .select(historyFields)
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

      return respond({ messages: await withAuthors(db, messages ?? []) });
    }

    let attachment: File | null = null;
    let body: Record<string, any>;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      if (Number(req.headers.get("content-length") ?? 0) > MAX_ATTACHMENT_BYTES + 65536) return respond({ error: "attachment_too_large" }, 400);
      const form = await req.formData();
      const file = form.get("arquivo");
      if (!(file instanceof File)) return respond({ error: "attachment_required" }, 400);
      attachment = file;
      body = { action: "send", conversa_id: form.get("conversa_id"), texto: form.get("texto") ?? "", resposta_mensagem_id: form.get("resposta_mensagem_id") || null };
    } else {
      body = await req.json().catch(() => ({}));
    }
    const action = String(body.action ?? "");
    const conversationId = String(body.conversa_id ?? "").trim();
    const messageText = String(body.texto ?? "").trim();
    if (action === "annotate" || action === "edit") {
      const result = action === "annotate" ? await annotateMessage(db, body, caller.id) : await editMessage(db, body, caller.id);
      return respond(result.data, result.status);
    }

    if (action === "get_signature" || action === "save_signature") {
      if (action === "save_signature") {
        let signature: string;
        try { signature = normalizeSignature(body.assinatura); }
        catch { return respond({ error: "invalid_signature" }, 400); }
        const { error } = await db.from("ariiatalk_assinaturas").upsert({ usuario_id: caller.id, assinatura: signature });
        if (error) return respond({ error: "signature_save_failed" }, 500);
        return respond({ assinatura: signature });
      }
      const { data, error } = await db.from("ariiatalk_assinaturas").select("assinatura").eq("usuario_id", caller.id).maybeSingle();
      if (error) return respond({ error: "signature_query_failed" }, 500);
      return respond({ assinatura: data?.assinatura ?? "" });
    }

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
        .select(historyFields)
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

      return respond({ messages: await withAuthors(db, messages ?? []) });
    }

    if (action !== "send") {
      return respond({ error: "unknown_action" }, 400);
    }

    const validSend = z.object({ conversa_id: z.string().uuid(), texto: z.string().trim().min(attachment ? 0 : 1).max(4000), resposta_mensagem_id: z.string().uuid().nullish() }).safeParse(body);
    if (!validSend.success) return respond({ error: "invalid_message" }, 400);
    let fileInfo: ReturnType<typeof attachmentInfo> | null = null;
    if (attachment) {
      try { fileInfo = attachmentInfo(attachment); }
      catch (error) { return respond({ error: "invalid_attachment", message: error instanceof Error ? error.message : "Arquivo inválido." }, 400); }
    }

    if (!conversationId) {
      return respond({ error: "conversation_id_required" }, 400);
    }

    if (!messageText && !attachment) {
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

    const { data: signatureData, error: signatureError } = await db.from("ariiatalk_assinaturas")
      .select("assinatura").eq("usuario_id", caller.id).maybeSingle();
    if (signatureError) return respond({ error: "signature_query_failed" }, 500);
    const signature = signatureData?.assinatura ?? "";
    const cleanText = messageText || fileInfo?.name || "";
    const whatsappText = outgoingText(cleanText, signature);
    let quoted;
    let snapshot = null;
    if (validSend.data.resposta_mensagem_id) {
      const { data: target, error: replyError } = await db.from("ariiatalk_mensagens").select("*").eq("id", validSend.data.resposta_mensagem_id).eq("conversa_id", conversation.id).maybeSingle();
      if (replyError) return respond({ error: "reply_query_failed" }, 500);
      if (!target?.evolution_message_id) return respond({ error: "invalid_reply_target" }, 400);
      quoted = buildQuoted(target, conversation.id, conversation.remote_jid);
      snapshot = quoteSnapshot(target);
    }

    let storagePath: string | null = null;
    let mediaUrl: string | null = null;
    if (attachment && fileInfo) {
      storagePath = `${conversation.id}/${crypto.randomUUID()}/${fileInfo.name}`;
      const { error: uploadError } = await db.storage.from(ATTACHMENT_BUCKET).upload(storagePath, attachment, { contentType: fileInfo.mime, upsert: false });
      if (uploadError) return respond({ error: "attachment_upload_failed" }, 500);
      const { data: signed, error: signedError } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(storagePath, 3600);
      if (signedError || !signed?.signedUrl) {
        await db.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
        return respond({ error: "attachment_link_failed" }, 500);
      }
      mediaUrl = signed.signedUrl;
    }

    const { data: pendingMessage, error: pendingError } = await db
      .from("ariiatalk_mensagens")
      .insert({
        conversa_id: conversation.id,
        direcao: "saida",
        tipo: fileInfo?.kind ?? "text",
        conteudo: cleanText,
        media_url: storagePath ? `storage://${ATTACHMENT_BUCKET}/${storagePath}` : null,
        status: "enviando",
        enviado_por: caller.id,
        autor_nome: user.nome,
        assinatura: signature,
        texto_whatsapp: whatsappText,
        resposta_mensagem_id: validSend.data.resposta_mensagem_id ?? null,
        resposta_snapshot: snapshot,
      })
      .select("id")
      .single();

    if (pendingError || !pendingMessage) {
      if (storagePath) await db.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
      console.error("Pending message creation failed:", pendingError);
      return respond({ error: "message_save_failed" }, 500);
    }

    try {
      const evoResponse = await fetch(
        `${apiUrl}/message/${fileInfo ? "sendMedia" : "sendText"}/${instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify(fileInfo && mediaUrl ? mediaPayload(number, mediaUrl, fileInfo, whatsappText, quoted) : {
            number,
            text: whatsappText,
            ...(quoted ? { quoted } : {}),
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
        .update(sentConversationUpdate(cleanText, sentAt))
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
          tipo: fileInfo?.kind ?? "text",
          conteudo: cleanText,
          media_url: mediaUrl,
          status: "enviada",
          enviado_por: caller.id,
          autor_nome: user.nome,
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


