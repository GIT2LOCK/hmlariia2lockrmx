import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ZABBIX_API_URL = Deno.env.get("ZABBIX_API_URL");
  const ZABBIX_API_TOKEN = Deno.env.get("ZABBIX_API_TOKEN");

  if (!ZABBIX_API_URL || !ZABBIX_API_TOKEN) {
    return new Response(JSON.stringify({ error: "Zabbix credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { action } = await req.json();

    const zabbixCall = async (method: string, params: Record<string, unknown>) => {
      const res = await fetch(ZABBIX_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ZABBIX_API_TOKEN}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method,
          params,
          id: 1,
        }),
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(`Zabbix API error: ${JSON.stringify(data.error)}`);
      }
      return data.result;
    };

    let result: unknown;

    switch (action) {
      case "version": {
        // No auth required - used to check API connectivity
        const vRes = await fetch(ZABBIX_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "apiinfo.version", params: [], id: 1 }),
        });
        result = await vRes.json();
        break;
      }

      case "problems": {
        // Get triggers currently in PROBLEM state (value=1), severity High (4),
        // excluding hosts in maintenance, only active hosts/triggers
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

        // Filter: only "Indisponibilidade" triggers, exclude "Infraestrutura" group
        const filteredTriggers = triggers.filter((t: any) => {
          const desc = (t.description || "").toLowerCase();
          if (!desc.includes("indisponibilidade")) return false;
          const groupNames = (t.groups || []).map((g: any) => g.name.toLowerCase());
          if (groupNames.includes("infraestrutura")) return false;
          return true;
        });

        // Fetch events with acknowledges for each trigger's objectids
        const triggerIds = filteredTriggers.map((t: any) => t.triggerid);
        let eventsMap: Record<string, any[]> = {};

        if (triggerIds.length > 0) {
          const events = await zabbixCall("event.get", {
            output: ["eventid", "objectid", "clock", "acknowledged"],
            objectids: triggerIds,
            source: 0,  // triggers
            object: 0,  // triggers
            value: 1,   // PROBLEM
            sortfield: "clock",
            sortorder: "DESC",
            selectAcknowledges: ["acknowledgeid", "userid", "clock", "message", "action"],
          });

          // Collect unique userids from acknowledges
          const userIds = new Set<string>();
          for (const ev of events) {
            for (const ack of (ev.acknowledges || [])) {
              if (ack.userid) userIds.add(ack.userid);
            }
          }

          // Resolve userids to names
          let userMap: Record<string, string> = {};
          if (userIds.size > 0) {
            const users = await zabbixCall("user.get", {
              output: ["userid", "username", "name", "surname"],
              userids: Array.from(userIds),
            });
            for (const u of users) {
              const displayName = (u.name && u.surname) ? `${u.name} ${u.surname}`.trim() : u.username || u.alias || u.userid;
              userMap[u.userid] = displayName || u.username;
            }
          }

          // Build events map by objectid (triggerid), enrich acknowledges with user names
          for (const ev of events) {
            const enrichedAcks = (ev.acknowledges || []).map((ack: any) => ({
              ...ack,
              user: userMap[ack.userid] || "Desconhecido",
            }));
            if (!eventsMap[ev.objectid]) {
              eventsMap[ev.objectid] = [];
            }
            eventsMap[ev.objectid].push(...enrichedAcks);
          }
        }

        // Map to problem-like format for frontend compatibility
        result = filteredTriggers.map((t: any) => {
          const acks = eventsMap[t.triggerid] || [];
          // Sort by clock desc
          acks.sort((a: any, b: any) => Number(b.clock) - Number(a.clock));
          return {
            eventid: t.triggerid,
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
          };
        });

        break;
      }

      case "hostgroups": {
        result = await zabbixCall("hostgroup.get", {
          output: ["groupid", "name"],
          sortfield: "name",
        });
        break;
      }

      case "maintenance": {
        const now = Math.floor(Date.now() / 1000);
        const allMaintenances = await zabbixCall("maintenance.get", {
          output: ["maintenanceid", "name", "active_since", "active_till", "description"],
          selectHosts: ["hostid", "host", "name"],
          selectGroups: ["groupid", "name"],
          selectTimeperiods: "extend",
        });
        // Filter: active (started and not ended) or approaching (not started yet)
        result = allMaintenances.filter((m: any) => {
          const since = Number(m.active_since);
          const till = Number(m.active_till);
          return till > now; // active or approaching (end time in the future)
        });
        break;
      }

      case "hosts": {
        result = await zabbixCall("host.get", {
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
