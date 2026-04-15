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
        // Get hosts currently in maintenance
        const hostsInMaintenance = await zabbixCall("host.get", {
          output: ["hostid"],
          filter: { maintenance_status: 1 },
        });
        const maintenanceHostIds = new Set(hostsInMaintenance.map((h: any) => h.hostid));

        // Get active problems - severity 4 (High) only, not suppressed
        const problems = await zabbixCall("problem.get", {
          output: ["eventid", "objectid", "name", "severity", "clock", "acknowledged", "suppressed"],
          recent: false,
          severities: [4], // 4 = High only
          sortfield: ["eventid"],
          sortorder: "DESC",
          suppressed: false,
          selectAcknowledges: ["acknowledgeid", "userid", "message", "clock"],
          selectTags: "extend",
        });

        // Get trigger details for host info
        const triggerIds = [...new Set(problems.map((p: any) => p.objectid))];
        let triggers: any[] = [];
        if (triggerIds.length > 0) {
          triggers = await zabbixCall("trigger.get", {
            triggerids: triggerIds,
            output: ["triggerid", "description", "priority"],
            selectHosts: ["hostid", "host", "name"],
            selectGroups: ["groupid", "name"],
          });
        }

        const triggerMap = new Map(triggers.map((t: any) => [t.triggerid, t]));

        const enrichedProblems = problems
          .map((p: any) => {
            const trigger = triggerMap.get(p.objectid);
            return {
              ...p,
              hosts: trigger?.hosts || [],
              groups: trigger?.groups || [],
              triggerDescription: trigger?.description || p.name,
            };
          })
          // Exclude problems where ALL hosts are in maintenance
          .filter((p: any) => {
            if (!p.hosts || p.hosts.length === 0) return true;
            return !p.hosts.every((h: any) => maintenanceHostIds.has(h.hostid));
          })
          // Exclude problems from "Infraestrutura" host group
          .filter((p: any) => {
            const groupNames = (p.groups || []).map((g: any) => g.name.toLowerCase());
            return !groupNames.includes("infraestrutura");
          });

        result = enrichedProblems;
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
