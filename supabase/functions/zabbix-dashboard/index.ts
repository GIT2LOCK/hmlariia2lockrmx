import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Zabbix API helper ────────────────────────────────────────────────
function createZabbixClient(url: string, token: string) {
  return async (method: string, params: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Zabbix API error: ${JSON.stringify(data.error)}`);
    return data.result;
  };
}

// ── Classification for Zabbix 2 (2lock) ────────────────────────────
function classifyZabbix2(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("indisponibilidade de ctrl")) return "equipamentos";
  if (d.includes("indisponibilidade de ddns")) return "links";
  if (d.includes("indisponibilidade de link")) return "links";
  if (d.includes("sem conexão com a unidade")) return "links";
  return "outros";
}

// ── Fetch problems from one Zabbix instance ─────────────────────────
async function fetchProblemsFromInstance(
  zabbixCall: ReturnType<typeof createZabbixClient>,
  source: string,
  filterFn: (t: any) => boolean,
  categoryFn?: (desc: string) => string,
) {
  const triggers = await zabbixCall("trigger.get", {
    output: ["triggerid", "description", "priority", "lastchange", "value"],
    filter: { value: 1, priority: 4 },
    monitored: true,
    maintenance: false,
    skipDependent: true,
    selectHosts: ["hostid", "host", "name"],
    selectGroups: ["groupid", "name"],
    sortfield: "lastchange",
    sortorder: "DESC",
  });

  const filtered = triggers.filter(filterFn);

  // Fetch events with acknowledges
  const triggerIds = filtered.map((t: any) => t.triggerid);
  let eventsMap: Record<string, any[]> = {};

  if (triggerIds.length > 0) {
    const lastchangeMap: Record<string, string> = {};
    for (const t of filtered) lastchangeMap[t.triggerid] = t.lastchange;

    const events = await zabbixCall("event.get", {
      output: ["eventid", "objectid", "clock", "acknowledged"],
      objectids: triggerIds,
      source: 0,
      object: 0,
      value: 1,
      sortfield: "clock",
      sortorder: "DESC",
      selectAcknowledges: ["acknowledgeid", "userid", "clock", "message", "action"],
    });

    const currentEvents = events.filter((ev: any) => ev.clock === lastchangeMap[ev.objectid]);

    // Resolve user names
    const userIds = new Set<string>();
    for (const ev of currentEvents) {
      for (const ack of ev.acknowledges || []) {
        if (ack.userid) userIds.add(ack.userid);
      }
    }

    let userMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const users = await zabbixCall("user.get", {
        output: ["userid", "username", "name", "surname"],
        userids: Array.from(userIds),
      });
      for (const u of users) {
        const displayName = u.name && u.surname ? `${u.name} ${u.surname}`.trim() : u.username || u.alias || u.userid;
        userMap[u.userid] = displayName || u.username;
      }
    }

    for (const ev of currentEvents) {
      const enrichedAcks = (ev.acknowledges || []).map((ack: any) => ({
        ...ack,
        user: userMap[ack.userid] || "Desconhecido",
      }));
      if (!eventsMap[ev.objectid]) eventsMap[ev.objectid] = [];
      eventsMap[ev.objectid].push(...enrichedAcks);
    }
  }

  return filtered.map((t: any) => {
    const acks = eventsMap[t.triggerid] || [];
    acks.sort((a: any, b: any) => Number(b.clock) - Number(a.clock));
    return {
      eventid: `${source}_${t.triggerid}`,
      objectid: t.triggerid,
      name: t.description,
      severity: t.priority,
      clock: t.lastchange,
      acknowledged: acks.length > 0 ? "1" : "0",
      suppressed: "0",
      hosts: t.hosts || [],
      groups: t.groups || [],
      triggerDescription: t.description,
      tags: [],
      acknowledges: acks,
      source,
      category: categoryFn ? categoryFn(t.description || "") : undefined,
    };
  });
}

// ── Fetch maintenance from one instance ─────────────────────────────
async function fetchMaintenanceFromInstance(zabbixCall: ReturnType<typeof createZabbixClient>) {
  const now = Math.floor(Date.now() / 1000);
  const all = await zabbixCall("maintenance.get", {
    output: ["maintenanceid", "name", "active_since", "active_till", "description"],
    selectHosts: ["hostid", "host", "name"],
    selectGroups: ["groupid", "name"],
    selectTimeperiods: "extend",
  });
  return all.filter((m: any) => Number(m.active_till) > now);
}

// ── Main handler ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ZABBIX_API_URL = Deno.env.get("ZABBIX_API_URL");
  const ZABBIX_API_TOKEN = Deno.env.get("ZABBIX_API_TOKEN");
  const ZABBIX_API_URL_2 = Deno.env.get("ZABBIX_API_URL_2");
  const ZABBIX_API_TOKEN_2 = Deno.env.get("ZABBIX_API_TOKEN_2");

  if (!ZABBIX_API_URL || !ZABBIX_API_TOKEN) {
    return new Response(JSON.stringify({ error: "Zabbix 1 credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const zabbix1 = createZabbixClient(ZABBIX_API_URL, ZABBIX_API_TOKEN);
  const zabbix2 = ZABBIX_API_URL_2 && ZABBIX_API_TOKEN_2
    ? createZabbixClient(ZABBIX_API_URL_2, ZABBIX_API_TOKEN_2)
    : null;

  try {
    const { action } = await req.json();
    let result: unknown;

    switch (action) {
      case "version": {
        const vRes = await fetch(ZABBIX_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "apiinfo.version", params: [], id: 1 }),
        });
        result = await vRes.json();
        break;
      }

      case "problems": {
        // Zabbix 1: "Indisponibilidade" triggers, exclude "Infraestrutura"
        const filter1 = (t: any) => {
          const desc = (t.description || "").toLowerCase();
          if (!desc.includes("indisponibilidade")) return false;
          const groupNames = (t.groups || []).map((g: any) => g.name.toLowerCase());
          if (groupNames.includes("infraestrutura")) return false;
          return true;
        };

        const promises: Promise<any[]>[] = [
          fetchProblemsFromInstance(zabbix1, "z1", filter1),
        ];

        // Zabbix 2: specific trigger descriptions
        if (zabbix2) {
          const filter2 = (t: any) => {
            const desc = (t.description || "").toLowerCase();
            return (
              desc.includes("indisponibilidade de ctrl") ||
              desc.includes("indisponibilidade de ddns") ||
              desc.includes("indisponibilidade de link") ||
              desc.includes("sem conexão com a unidade")
            );
          };
          promises.push(fetchProblemsFromInstance(zabbix2, "z2", filter2, classifyZabbix2));
        }

        const results = await Promise.all(promises);
        result = results.flat();
        break;
      }

      case "maintenance": {
        const promises = [fetchMaintenanceFromInstance(zabbix1)];
        if (zabbix2) promises.push(fetchMaintenanceFromInstance(zabbix2));
        const results = await Promise.all(promises);
        result = results.flat();
        break;
      }

      case "hostgroups": {
        result = await zabbix1("hostgroup.get", {
          output: ["groupid", "name"],
          sortfield: "name",
        });
        break;
      }

      case "hosts": {
        result = await zabbix1("host.get", {
          output: ["hostid", "host", "name", "status", "maintenance_status"],
          selectGroups: ["groupid", "name"],
          selectInterfaces: ["ip", "dns", "type"],
          sortfield: "name",
        });
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Zabbix dashboard error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
