import { z } from "npm:zod@3.25.76";
import { serviceClient } from "../_shared/grafana.ts";
import { canEditMessage } from "../_shared/ariiatalkMessageActions.ts";
import { outgoingText } from "../_shared/ariiatalkSignature.ts";

const Target = z.object({ conversa_id: z.string().uuid(), mensagem_id: z.string().uuid() });
const Annotation = Target.extend({ sinalizada: z.boolean(), nota: z.string().trim().max(2000), marcacao: z.string().trim().max(60) });
const Edit = Target.extend({ texto: z.string().trim().min(1).max(4000) });

export async function annotateMessage(db: ReturnType<typeof serviceClient>, body: unknown, userId: number) {
  const parsed = Annotation.safeParse(body);
  if (!parsed.success) return { status: 400, data: { error: "invalid_annotation" } };
  const { conversa_id, mensagem_id, ...values } = parsed.data;
  const { data: message, error } = await db.from("ariiatalk_mensagens").select("id").eq("id", mensagem_id).eq("conversa_id", conversa_id).maybeSingle();
  if (error) throw error;
  if (!message) return { status: 404, data: { error: "message_not_found" } };
  const { data, error: saveError } = await db.from("ariiatalk_mensagem_anotacoes").upsert({ mensagem_id, usuario_id: userId, ...values }, { onConflict: "mensagem_id,usuario_id" }).select("*").single();
  if (saveError) throw saveError;
  return { status: 200, data: { success: true, annotation: data } };
}

export async function editMessage(db: ReturnType<typeof serviceClient>, body: unknown, userId: number) {
  const parsed = Edit.safeParse(body);
  if (!parsed.success) return { status: 400, data: { error: "invalid_message_edit" } };
  const { conversa_id, mensagem_id, texto } = parsed.data;
  const { data: message, error } = await db.from("ariiatalk_mensagens").select("*").eq("id", mensagem_id).eq("conversa_id", conversa_id).maybeSingle();
  if (error) throw error;
  if (!message) return { status: 404, data: { error: "message_not_found" } };
  if (!canEditMessage(message, userId)) return { status: 403, data: { error: "message_not_editable" } };
  const { data: conversation, error: lookupError } = await db.from("ariiatalk_conversas").select("remote_jid, ariiatalk_instancias(evolution_instance_name)").eq("id", conversa_id).single();
  if (lookupError) throw lookupError;
  const instance = Array.isArray(conversation.ariiatalk_instancias) ? conversation.ariiatalk_instancias[0] : conversation.ariiatalk_instancias;
  const apiUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!apiUrl || !apiKey || !instance?.evolution_instance_name) return { status: 500, data: { error: "evolution_not_configured" } };
  const whatsappText = outgoingText(texto, message.assinatura || "");
  const response = await fetch(`${apiUrl}/chat/updateMessage/${encodeURIComponent(instance.evolution_instance_name)}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: conversation.remote_jid.replace(/@s\.whatsapp\.net$/i, ""), text: whatsappText, key: { id: message.evolution_message_id, remoteJid: conversation.remote_jid, fromMe: true } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return { status: 502, data: { error: "evolution_edit_failed" } };
  const { error: updateError } = await db.from("ariiatalk_mensagens").update({ conteudo: texto, texto_whatsapp: whatsappText, editada_em: new Date().toISOString() }).eq("id", mensagem_id);
  if (updateError) throw updateError;
  const { data: latest } = await db.from("ariiatalk_mensagens").select("id").eq("conversa_id", conversa_id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (latest?.id === mensagem_id) await db.from("ariiatalk_conversas").update({ ultima_mensagem: texto, atualizado_em: new Date().toISOString() }).eq("id", conversa_id);
  return { status: 200, data: { success: true } };
}