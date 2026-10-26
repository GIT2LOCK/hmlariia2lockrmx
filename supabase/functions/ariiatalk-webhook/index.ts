import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/grafana.ts";
import { matchesOutboundEcho } from "../_shared/ariiatalkSignature.ts";
import { quotedContext, editedContent, cleanEditedText } from "../_shared/ariiatalkWebhookActions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEvent(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/[.-]/g, "_");
}

function extractMessage(message: Record<string, any>) {
  const m = message.message ?? {};
  const typeMap: Array<[string, string]> = [
    ["conversation", "text"],
    ["extendedTextMessage", "text"],
    ["imageMessage", "image"],
    ["videoMessage", "video"],
    ["audioMessage", "audio"],
    ["documentMessage", "document"],
    ["stickerMessage", "sticker"],
    ["locationMessage", "location"],
    ["contactMessage", "contact"],
  ];

  for (const [key, type] of typeMap) {
    if (!m[key]) continue;
    const item = m[key];
    const content =
      typeof item === "string"
        ? item
        : item.text ?? item.caption ?? item.fileName ?? item.name ?? null;

    return {
      type,
      content: textValue(content) ?? (type === "text" ? null : `[${type}]`),
      mediaUrl: textValue(item.url),
    };
  }

  return {
    type: "unknown",
    content: "[Mensagem não textual ou formato não reconhecido]",
    mediaUrl: null,
  };
}

function getMessageDate(item: Record<string, any>): string {
  const timestamp = Number(item.messageTimestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date().toISOString();
}

function getItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "method_not_allowed" }, 405);
  }

  const expectedToken = Deno.env.get("ARIIATALK_WEBHOOK_SECRET");
  const suppliedToken = new URL(req.url).searchParams.get("token");

  if (!expectedToken || !suppliedToken || suppliedToken !== expectedToken) {
    return respond({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const event = normalizeEvent(body.event ?? body.type);
    const instanceName = textValue(body.instance);

    if (!instanceName) {
      return respond({ error: "missing_instance", event }, 400);
    }

    const db = serviceClient();

    const { data: instance, error: instanceError } = await db
      .from("ariiatalk_instancias")
      .select("id, nome, telefone, status")
      .eq("evolution_instance_name", instanceName)
      .maybeSingle();

    if (instanceError || !instance) {
      console.error("Webhook instance lookup failed:", instanceError);
      return respond({ error: "instance_not_found", event }, 404);
    }

    // Atualiza o estado da conexão da instância.
    if (event === "CONNECTION_UPDATE") {
      const state = String(
        body.data?.state ?? body.data?.instance?.state ?? ""
      ).toLowerCase();

      let status: string | null = null;

      if (["open", "connected"].includes(state)) status = "connected";
      else if (["close", "closed", "disconnected"].includes(state)) {
        status = "disconnected";
      } else if (["connecting", "refused"].includes(state)) {
        status = "connecting";
      }

      if (status) {
        const { error } = await db
          .from("ariiatalk_instancias")
          .update({ status, atualizado_em: new Date().toISOString() })
          .eq("id", instance.id);

        if (error) {
          console.error("Instance status update failed:", error);
          return respond({ error: "instance_status_update_failed" }, 500);
        }
      }

      return respond({ received: true, event, status: status ?? "unchanged" });
    }

    // Atualizações de entrega/leitura: atualiza mensagens já registradas.
    if (event === "MESSAGES_UPDATE") {
      const updates = getItems(body.data);
      let updated = 0;

      for (const item of updates) {
        const key = item?.key ?? {};
        const messageId = textValue(key.id ?? item?.id);
        if (!messageId) continue;

        const rawStatus = String(
          item?.update?.status ?? item?.status ?? ""
        ).toUpperCase();

        const statusMap: Record<string, string> = {
          PENDING: "pendente",
          SERVER_ACK: "enviada",
          DELIVERY_ACK: "entregue",
          READ: "lida",
          PLAYED: "lida",
          ERROR: "erro",
        };

        const mappedStatus = statusMap[rawStatus];
        if (!mappedStatus) continue;

        const { data, error } = await db
          .from("ariiatalk_mensagens")
          .update({ status: mappedStatus })
          .eq("evolution_message_id", messageId)
          .select("id");

        if (error) {
          console.error("Message status update failed:", error);
          return respond({ error: "message_status_update_failed" }, 500);
        }

        updated += data?.length ?? 0;
      }

      return respond({ received: true, event, updated });
    }

    // Eventos que podem conter novas mensagens.
    if (!["MESSAGES_UPSERT", "SEND_MESSAGE"].includes(event)) {
      return respond({ received: true, ignored: true, event });
    }

    const items = getItems(body.data);
    if (!items.length) {
      return respond({ received: true, event, processed: 0, ignored: 1 });
    }

    let processed = 0;
    let ignored = 0;

    for (const item of items) {
      const key = item?.key ?? item?.data?.key ?? {};
      const remoteJid = textValue(
        key.remoteJid ?? item?.remoteJid ?? item?.data?.remoteJid
      );

      if (!remoteJid || remoteJid === "status@broadcast") {
        ignored++;
        continue;
      }

      const messageId = textValue(
        key.id ?? item?.messageId ?? item?.data?.key?.id
      );

      const edit = editedContent(item?.message);
      if (edit) {
        const { data: editConversation } = await db.from("ariiatalk_conversas").select("id").eq("instancia_id", instance.id).eq("remote_jid", remoteJid).maybeSingle();
        if (editConversation) {
          const { data: original } = await db.from("ariiatalk_mensagens").select("id, assinatura").eq("conversa_id", editConversation.id).eq("evolution_message_id", edit.evolutionId).maybeSingle();
          if (original) {
            const { error } = await db.from("ariiatalk_mensagens").update({ conteudo: cleanEditedText(edit.text, original.assinatura), texto_whatsapp: edit.text, editada_em: new Date().toISOString() }).eq("id", original.id);
            if (error) return respond({ error: "message_edit_update_failed" }, 500);
          }
        }
        processed++;
        continue;
      }

      // Verifica duplicação ANTES de alterar a conversa.
      if (messageId) {
        const { data: existingMessage, error } = await db
          .from("ariiatalk_mensagens")
          .select("id")
          .eq("evolution_message_id", messageId)
          .maybeSingle();

        if (error) {
          console.error("Message lookup failed:", error);
          return respond({ error: "message_lookup_failed" }, 500);
        }

        if (existingMessage) {
          ignored++;
          continue;
        }
      }

      const fromMe = key.fromMe === true || item?.key?.fromMe === true;
      const direction = fromMe ? "saida" : "entrada";
      const isGroup = remoteJid.endsWith("@g.us");
      const participantJid = isGroup ? textValue(key.participant ?? item?.participant ?? item?.data?.participant) : null;
      const senderName = textValue(item.pushName ?? item?.data?.pushName) ?? (participantJid ? participantJid.split("@")[0] : null);
      const pushName = isGroup ? null : (senderName ?? remoteJid.split("@")[0]);

      const extracted = extractMessage(item);
      const messageDate = getMessageDate(item);

      const { data: conversation, error: lookupError } = await db
        .from("ariiatalk_conversas")
        .select("id, nao_lidas, nome_contato")
        .eq("instancia_id", instance.id)
        .eq("remote_jid", remoteJid)
        .maybeSingle();

      if (lookupError) {
        console.error("Conversation lookup failed:", lookupError);
        return respond({ error: "conversation_lookup_failed" }, 500);
      }

      let conversationId: string;

      // SEND_MESSAGE may arrive before sendText returns its ID. Attach the
      // echo to the pending row, preserving its clean text and real author.
      if (fromMe && conversation && messageId && extracted.content) {
        let pendingQuery = db.from("ariiatalk_mensagens")
          .select("id, texto_whatsapp, direcao, enviado_por, tipo")
          .eq("conversa_id", conversation.id)
          .eq("direcao", "saida")
          .not("enviado_por", "is", null)
          .is("evolution_message_id", null)
          .eq("status", "enviando")
          .eq("tipo", extracted.type)
          .gte("criado_em", new Date(Date.now() - 120000).toISOString())
          .order("criado_em", { ascending: true }).limit(1);
        if (extracted.type === "text" || extracted.content !== `[${extracted.type}]`) pendingQuery = pendingQuery.eq("texto_whatsapp", extracted.content);
        const { data: pending, error: pendingError } = await pendingQuery.maybeSingle();
        if (pendingError) return respond({ error: "pending_echo_query_failed" }, 500);
        if (pending && (matchesOutboundEcho(pending, extracted.content) || (pending.tipo !== "text" && extracted.content === `[${extracted.type}]`))) {
          const { error } = await db.from("ariiatalk_mensagens")
            .update({ evolution_message_id: messageId, enviada_em: messageDate })
            .eq("id", pending.id);
          if (error) return respond({ error: "pending_echo_update_failed" }, 500);
          processed++;
          continue;
        }
      }

      if (conversation) {
        conversationId = conversation.id;

        const currentName = String(conversation.nome_contato ?? "").trim();
        const fallbackName = remoteJid.split("@")[0];
        const incomingName = String(pushName ?? "").trim();

        const updates: Record<string, any> = {
          ...(isGroup ? (!currentName || currentName === fallbackName ? { nome_contato: (await groupSubject(instanceName, remoteJid)) ?? (currentName || "Grupo") } : {}) : !currentName || currentName === fallbackName
            ? { nome_contato: incomingName || fallbackName }
            : {}
          ),
          ultima_mensagem: isGroup && direction === "entrada" && senderName && extracted.content ? `${senderName}: ${extracted.content}` : extracted.content,
          ultima_mensagem_em: messageDate,
          status: "open",
          atualizado_em: new Date().toISOString(),
        };

        // Mensagem enviada pela equipe não conta como não lida.
        if (direction === "entrada") {
          updates.nao_lidas = Number(conversation.nao_lidas ?? 0) + 1;
        }

        const { error } = await db
          .from("ariiatalk_conversas")
          .update(updates)
          .eq("id", conversationId);

        if (error) {
          console.error("Conversation update failed:", error);
          return respond({ error: "conversation_update_failed" }, 500);
        }
      } else {
        const { data: newConversation, error } = await db
          .from("ariiatalk_conversas")
          .insert({
            instancia_id: instance.id,
            remote_jid: remoteJid,
            nome_contato: isGroup ? ((await groupSubject(instanceName, remoteJid)) ?? "Grupo") : pushName,
            is_grupo: isGroup,
            ultima_mensagem: isGroup && direction === "entrada" && senderName && extracted.content ? `${senderName}: ${extracted.content}` : extracted.content,
            ultima_mensagem_em: messageDate,
            nao_lidas: direction === "entrada" ? 1 : 0,
            status: "open",
          })
          .select("id")
          .single();

        if (error || !newConversation) {
          console.error("Conversation creation failed:", error);
          return respond({ error: "conversation_creation_failed" }, 500);
        }

        conversationId = newConversation.id;
      }

      // Grupos ficam registrados como contato (sem telefone) para reabrir depois de encerrados.
      if (isGroup) {
        const { data: groupContact } = await db.from("contatos").select("id").eq("whatsapp_grupo_jid", remoteJid).maybeSingle();
        let groupContactId = groupContact?.id ?? null;
        if (!groupContactId) {
          const { data: conv } = await db.from("ariiatalk_conversas").select("nome_contato").eq("id", conversationId).maybeSingle();
          const { data: created, error: groupError } = await db.from("contatos")
            .insert({ nome: String(conv?.nome_contato ?? "").trim() || "Grupo", tipo: "contato", categoria: "Grupo", whatsapp_grupo_jid: remoteJid })
            .select("id").single();
          if (groupError) console.warn("Group contact creation failed:", groupError.message);
          groupContactId = created?.id ?? null;
        }
        if (groupContactId) {
          await db.from("ariiatalk_conversas").update({ contato_id: groupContactId }).eq("id", conversationId).is("contato_id", null);
        }
      }

      const quote = quotedContext(item?.message);
      let quoteId = null;
      let snapshot: any = quote?.snapshot ?? null;
      if (quote) {
        const { data: quoted } = await db.from("ariiatalk_mensagens").select("id, conteudo, autor_nome, direcao, tipo").eq("conversa_id", conversationId).eq("evolution_message_id", quote.evolutionId).maybeSingle();
        if (quoted) {
          quoteId = quoted.id;
          snapshot = { id: quoted.id, autor_nome: quoted.autor_nome || (quoted.direcao === "entrada" ? (pushName ?? senderName) : "WhatsApp / dispositivo"), conteudo: quoted.conteudo || `[${quoted.tipo}]` };
        }
      }
      const { error: insertError } = await db
        .from("ariiatalk_mensagens")
        .insert({
          conversa_id: conversationId,
          evolution_message_id: messageId,
          direcao: direction,
          tipo: extracted.type,
          conteudo: extracted.content,
          media_url: extracted.mediaUrl,
          status: direction === "entrada" ? "recebida" : "enviada",
          enviada_em: messageDate,
          payload: item,
          resposta_mensagem_id: quoteId,
          resposta_snapshot: snapshot,
          remetente_nome: isGroup && direction === "entrada" ? senderName : null,
          remetente_jid: isGroup && direction === "entrada" ? participantJid : null,
        });

      if (insertError) {
        console.error("Message insert failed:", insertError);
        return respond({ error: "message_insert_failed" }, 500);
      }

      processed++;
    }

    return respond({ received: true, event, processed, ignored });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return respond({ error: "internal_error" }, 500);
  }
});


async function groupSubject(instanceName: string | null | undefined, groupJid: string): Promise<string | null> {
  const base = Deno.env.get("EVOLUTION_API_URL"); const apikey = Deno.env.get("EVOLUTION_API_KEY");
  if (!base || !apikey || !instanceName) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/group/findGroupInfos/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`, { headers: { apikey }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const subject = String((Array.isArray(data) ? data[0] : data)?.subject ?? "").trim();
    return subject ? subject.slice(0, 120) : null;
  } catch { return null; }
}
