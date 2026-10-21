import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/grafana.ts";
import { requireAriiaTalkAccess, authErrorResponse } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ariia-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function normalizeStatus(value: unknown): string {
  const state = String(value ?? "").toLowerCase();
  if (["open", "connected", "connecting"].includes(state)) return "connected";
  if (["close", "closed", "disconnected"].includes(state)) return "disconnected";
  return "error";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!["GET", "POST"].includes(req.method)) {
      return response({ error: "method_not_allowed" }, 405);
    }

    const caller = await requireAriiaTalkAccess(req);
    const db = serviceClient();

    const { data: user, error: userError } = await db
      .from("usuarios")
      .select("id, ativo")
      .eq("id", caller.id)
      .maybeSingle();

    if (userError || !user || user.ativo !== true) {
      return response({ error: "user_inactive_or_not_found" }, 403);
    }

    const { data: allowedTabs, error: tabsError } = await db.rpc(
      "fn_user_allowed_tabs",
      { _usuario_id: caller.id },
    );

    if (tabsError) {
      console.error("AriiaTalk permission check failed:", tabsError);
      return response({ error: "permission_check_failed" }, 500);
    }

    const isAdmin = ["ADMIN", "SUPERADMIN"].includes(
      String(caller.permissao ?? "").toUpperCase(),
    );

    if (
      !isAdmin &&
      !(Array.isArray(allowedTabs) && allowedTabs.includes("ariiatalk"))
    ) {
      return response({ error: "forbidden" }, 403);
    }

    const apiUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/+$/, "");
    const apiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!apiUrl || !apiKey) {
      return response({ error: "evolution_secrets_not_configured" }, 500);
    }

    async function evolution(path: string, method = "GET", body?: unknown) {
      const result = await fetch(`${apiUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const text = await result.text();
      let data: unknown = null;

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!result.ok) {
        console.error("Evolution API error:", result.status, data);
        throw new Error(`evolution_api_error_${result.status}`);
      }

      return data as Record<string, any>;
    }

    if (req.method === "GET") {
      const { data, error } = await db
        .from("ariiatalk_instancias")
        .select("id, nome, evolution_instance_name, telefone, status, criado_em, atualizado_em")
        .order("criado_em", { ascending: false });

      if (error) {
        console.error("Instance list failed:", error);
        return response({ error: "instance_query_failed" }, 500);
      }

      return response({ instances: data ?? [] });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "create") {
      const nome = String(body.nome ?? "").trim();
      const instanceName = String(body.instanceName ?? nome)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50);

      if (!nome || !instanceName) {
        return response({ error: "invalid_instance_name" }, 400);
      }

      const { data: existing, error: existingError } = await db
        .from("ariiatalk_instancias")
        .select("id")
        .eq("evolution_instance_name", instanceName)
        .maybeSingle();

      if (existingError) {
        console.error("Instance duplicate check failed:", existingError);
        return response({ error: "instance_query_failed" }, 500);
      }

      if (existing) {
        return response({ error: "instance_already_exists" }, 409);
      }

      let evoResult: Record<string, any>;

      try {
        evoResult = await evolution("/instance/create", "POST", {
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        });
      } catch (error) {
        console.error("Evolution instance creation failed:", error);
        return response({ error: "evolution_instance_creation_failed" }, 502);
      }

      const evoData = evoResult?.instance ?? evoResult?.data ?? evoResult;
      const initialStatus = String(evoData?.status ?? "connecting").toLowerCase();

      const { data: saved, error: saveError } = await db
        .from("ariiatalk_instancias")
        .insert({
          nome,
          evolution_instance_name: instanceName,
          telefone: null,
          status: initialStatus === "open" || initialStatus === "connected"
            ? "connected"
            : "connecting",
        })
        .select("id, nome, evolution_instance_name, telefone, status, criado_em, atualizado_em")
        .single();

      if (saveError) {
        console.error("Saving instance failed:", saveError);
        return response({
          error: "instance_created_but_database_save_failed",
          instanceName,
        }, 500);
      }

      const qr =
        evoResult?.qrcode?.base64 ??
        evoResult?.qrcode?.code ??
        evoResult?.data?.qrcode?.base64 ??
        evoResult?.data?.qrcode?.code ??
        null;

      return response({ instance: saved, qrcode: qr });
    }

    const id = String(body.id ?? "").trim();
    if (!id) {
      return response({ error: "instance_id_required" }, 400);
    }

    const { data: instance, error: instanceError } = await db
      .from("ariiatalk_instancias")
      .select("id, nome, evolution_instance_name, telefone, status")
      .eq("id", id)
      .maybeSingle();

    if (instanceError || !instance) {
      return response({ error: "instance_not_found" }, 404);
    }

    const instanceName = encodeURIComponent(instance.evolution_instance_name);

    if (action === "connect") {
      let result: Record<string, any>;

      try {
        result = await evolution(`/instance/connect/${instanceName}`);
      } catch (error) {
        console.error("Evolution connect request failed:", error);
        return response({ error: "evolution_connect_failed" }, 502);
      }

      const qr =
        result?.base64 ??
        result?.qrcode?.base64 ??
        result?.data?.base64 ??
        result?.data?.qrcode?.base64 ??
        result?.code ??
        result?.data?.code ??
        null;

      await db
        .from("ariiatalk_instancias")
        .update({ status: "connecting" })
        .eq("id", id);

      return response({ qrcode: qr, result });
    }

    if (action === "status") {
      let result: Record<string, any>;

      try {
        result = await evolution(`/instance/connectionState/${instanceName}`);
      } catch (error) {
        console.error("Evolution status request failed:", error);
        return response({ error: "evolution_status_failed" }, 502);
      }

      const state = String(
        result?.instance?.state ??
        result?.state ??
        result?.data?.state ??
        "",
      ).toLowerCase();

      const status = normalizeStatus(state);

      await db
        .from("ariiatalk_instancias")
        .update({ status })
        .eq("id", id);

      return response({ status, details: result });
    }

    if (action === "delete") {
      try {
        await evolution(`/instance/delete/${instanceName}`, "DELETE");
      } catch (error) {
        console.error("Evolution instance deletion failed:", error);
        return response({ error: "evolution_instance_deletion_failed" }, 502);
      }

      const { error: deleteError } = await db
        .from("ariiatalk_instancias")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Database instance deletion failed:", deleteError);
        return response({ error: "instance_deleted_from_evolution_but_database_delete_failed" }, 500);
      }

      return response({ success: true });
    }

    return response({ error: "unknown_action" }, 400);
  } catch (error) {
    return authErrorResponse(error, corsHeaders);
  }
});

