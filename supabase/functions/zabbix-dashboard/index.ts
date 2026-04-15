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

    console.log("Zabbix URL:", ZABBIX_API_URL);
    console.log("Token length:", ZABBIX_API_TOKEN.length, "Token prefix:", ZABBIX_API_TOKEN.substring(0, 8));

    const zabbixCall = async (method: string, params: Record<string, unknown>) => {
      const body = JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        auth: ZABBIX_API_TOKEN,
        id: 1,
      });
      console.log("Calling Zabbix method:", method);
      const res = await fetch(ZABBIX_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json-rpc",
          "Authorization": `Bearer ${ZABBIX_API_TOKEN}`,
        },
        body,
      });
      const data = await res.json();
      console.log("Zabbix response for", method, ":", JSON.stringify(data).substring(0, 500));
      if (data.error) {
        throw new Error(`Zabbix API error: ${JSON.stringify(data.error)}`);
      }
      return data.result;
    };

    let result: unknown;

    switch (action) {
      case "problems": {
        // Get active problems with host and group info
        const problems = await zabbixCall("problem.get", {
          output: ["eventid", "objectid", "name", "severity", "clock", "acknowledged", "suppressed"],
          recent: false,
          sortfield: ["eventid"],
          sortorder: "DESC",
          suppressed: false,
          selectAcknowledges: ["alias", "message", "clock"],
          selectTags: "extend",
        });

        // Get trigger details for the problems to get host info
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

        const enrichedProblems = problems.map((p: any) => {
          const trigger = triggerMap.get(p.objectid);
          return {
            ...p,
            hosts: trigger?.hosts || [],
            groups: trigger?.groups || [],
            triggerDescription: trigger?.description || p.name,
          };
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
        const maintenances = await zabbixCall("maintenance.get", {
          output: ["maintenanceid", "name", "active_since", "active_till", "description"],
          selectHosts: ["hostid", "host", "name"],
          selectGroups: ["groupid", "name"],
          selectTimeperiods: "extend",
        });
        result = maintenances;
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
