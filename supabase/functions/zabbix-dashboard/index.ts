import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function createZabbixClient(url: string, token: string) {
  return async (method: string, params: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Zabbix API error: ${JSON.stringify(data.error)}`);
    return data.result;
  };
}

function classifyZabbix2(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("indisponibilidade de ctrl")) return "equipamentos";
  if (d.includes("indisponibilidade de ddns")) return "links";
  if (d.includes("indisponibilidade de link")) return "links";
  if (d.includes("sem conexão com a unidade")) return "links";
  return "outros";
}

async function fetchProblemsFromInstance(
  zabbixCall: ReturnType<typeof createZabbixClient>,
  source: string,
  filterFn: (t: any) => boolean,
  categoryFn?: (desc: string) => string,
  severities: number[] = [4, 5],
) {
  const problems = await zabbixCall("problem.get", {
    output: ["eventid", "objectid", "name", "severity", "clock", "acknowledged", "suppressed"],
    source: 0,
    object: 0,
    severities,
    sortfield: "eventid",
    sortorder: "DESC",
  });


  const triggerIds = Array.from(new Set(problems.map((p: any) => p.objectid).filter(Boolean)));
  let triggerMap: Record<string, any> = {};

  if (triggerIds.length > 0) {
    const triggers = await zabbixCall("trigger.get", {
      output: ["triggerid", "description", "priority", "lastchange", "value"],
      triggerids: triggerIds,
      monitored: true,
      selectHosts: ["hostid", "host", "name", "status", "maintenance_status"],
      selectGroups: ["groupid", "name"],
    });

    triggerMap = Object.fromEntries(triggers.map((trigger: any) => [trigger.triggerid, trigger]));
  }

  const eventIds = problems.map((p: any) => p.eventid).filter(Boolean);
  let eventMap: Record<string, any> = {};
  if (eventIds.length > 0) {
    const events = await zabbixCall("event.get", {
      output: ["eventid", "objectid", "clock", "acknowledged"],
      eventids: eventIds,
      source: 0,
      object: 0,
      value: 1,
      selectAcknowledges: ["acknowledgeid", "userid", "clock", "message", "action"],
    });
    eventMap = Object.fromEntries(events.map((event: any) => [event.eventid, event]));
  }

  const userIds = new Set<string>();
  for (const event of Object.values(eventMap) as any[]) {
    for (const ack of event.acknowledges || []) {
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

  return problems
    .map((problem: any) => {
      const trigger = triggerMap[problem.objectid] || {};
      const event = eventMap[problem.eventid] || {};
      const description = trigger.description || problem.name || "";
      const acks = (event.acknowledges || []).map((ack: any) => ({
        ...ack,
        user: userMap[ack.userid] || "Desconhecido",
      }));

      acks.sort((a: any, b: any) => Number(b.clock) - Number(a.clock));

      return {
        eventid: `${source}_${problem.eventid || problem.objectid}`,
        objectid: problem.objectid,
        name: description,
        description,
        severity: String(problem.severity ?? trigger.priority ?? "0"),
        clock: problem.clock || trigger.lastchange || "0",
        acknowledged: String(problem.acknowledged ?? event.acknowledged ?? (acks.length > 0 ? "1" : "0")),
        suppressed: String(problem.suppressed ?? "0"),
        hosts: trigger.hosts || [],
        groups: trigger.groups || [],
        triggerDescription: description,
        tags: [],
        acknowledges: acks,
        source,
        category: categoryFn ? categoryFn(description) : undefined,
      };
    })
    .filter((p: any) => {
      if (!p.hosts || p.hosts.length === 0) return false;
      if (String(p.suppressed) === "1") return false;

      const allDisabled = p.hosts.every((h: any) => String(h.status) === "1");
      if (allDisabled) return false;

      const hasActiveMaintenance = p.hosts.some((h: any) => String(h.maintenance_status) === "1");
      if (hasActiveMaintenance) return false;

      return filterFn(p);
    });
}

async function fetchMaintenanceFromInstance(zabbixCall: ReturnType<typeof createZabbixClient>, source: string) {
  const now = Math.floor(Date.now() / 1000);
  const all = await zabbixCall("maintenance.get", {
    output: ["maintenanceid", "name", "active_since", "active_till", "description"],
    selectHosts: ["hostid", "host", "name"],
    selectGroups: ["groupid", "name"],
    selectTimeperiods: "extend",
  });
  return all
    .filter((m: any) => Number(m.active_till) > now)
    .map((m: any) => ({ ...m, source, maintenanceid: `${source}_${m.maintenanceid}` }));
}

async function fetchAllHostsFromInstance(zabbixCall: ReturnType<typeof createZabbixClient>, source: string, filterFn?: (h: any) => boolean) {
  const hosts = await zabbixCall("host.get", {
    output: ["hostid", "host", "name", "status", "maintenance_status"],
    selectInterfaces: ["ip", "dns", "type"],
    selectGroups: ["groupid", "name"],
    selectParentTemplates: ["templateid", "name"],
    selectTags: ["tag", "value"],
    filter: { status: 0 }, // Only enabled hosts
    sortfield: "name",
  });

  // Get proxies
  let proxyMap: Record<string, string> = {};
  try {
    // Try Zabbix 7.x proxy.get
    const proxies = await zabbixCall("proxy.get", {
      output: ["proxyid", "name"],
      selectHosts: ["hostid"],
    });
    for (const px of proxies) {
      for (const h of px.hosts || []) {
        proxyMap[h.hostid] = px.name;
      }
    }
  } catch {
    try {
      // Fallback to Zabbix 6.x
      const proxies = await zabbixCall("proxy.get", {
        output: ["proxyid", "host"],
        selectHosts: ["hostid"],
      });
      for (const px of proxies) {
        for (const h of px.hosts || []) {
          proxyMap[h.hostid] = px.host || px.name;
        }
      }
    } catch {
      // No proxy support or no permissions
    }
  }

  const filtered = filterFn ? hosts.filter(filterFn) : hosts;

  return filtered.map((h: any) => {
    const mainIface = h.interfaces?.find((i: any) => i.type === "1") || h.interfaces?.[0];
    return {
      hostid: `${source}_${h.hostid}`,
      hostname: h.host,
      name: h.name,
      status: h.status, // 0=enabled, 1=disabled
      ip: mainIface?.ip || "",
      proxy: proxyMap[h.hostid] || "",
      hostgroups: (h.groups || []).map((g: any) => g.name),
      templates: (h.parentTemplates || []).map((t: any) => t.name),
      tags: (h.tags || []).map((t: any) => ({ tag: t.tag, value: t.value })),
      source,
    };
  });
}

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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const zabbix1 = createZabbixClient(ZABBIX_API_URL, ZABBIX_API_TOKEN);
  const zabbix2 = ZABBIX_API_URL_2 && ZABBIX_API_TOKEN_2
    ? createZabbixClient(ZABBIX_API_URL_2, ZABBIX_API_TOKEN_2)
    : null;

  try {
    const body = await req.json();
    const { action } = body;
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
        const filter1 = (t: any) => {
          const desc = (t.description || "").toLowerCase();
          if (!desc.includes("indisponibilidade")) return false;
          const groupNames = (t.groups || []).map((g: any) => g.name.toLowerCase());
          if (groupNames.includes("infraestrutura")) return false;
          return true;
        };

        const promises: Promise<any[]>[] = [fetchProblemsFromInstance(zabbix1, "z1", filter1)];

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
          promises.push(fetchProblemsFromInstance(zabbix2, "z2", filter2, classifyZabbix2, [2, 3, 4, 5]));

        }

        const results = await Promise.all(promises);
        result = results.flat();
        break;
      }

      case "maintenance": {
        const promises = [fetchMaintenanceFromInstance(zabbix1, "z1")];
        if (zabbix2) promises.push(fetchMaintenanceFromInstance(zabbix2, "z2"));
        const results = await Promise.all(promises);
        result = results.flat();
        break;
      }

      case "hosts_all": {
        const filter1 = (h: any) => {
          const groupNames = (h.groups || []).map((g: any) => g.name.toLowerCase());
          return !groupNames.includes("infraestrutura");
        };

        const promises: Promise<any[]>[] = [fetchAllHostsFromInstance(zabbix1, "z1", filter1)];
        if (zabbix2) {
          promises.push(fetchAllHostsFromInstance(zabbix2, "z2"));
        }
        const results = await Promise.all(promises);
        result = results.flat();
        break;
      }

      case "hostgroups": {
        result = await zabbix1("hostgroup.get", { output: ["groupid", "name"], sortfield: "name" });
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

      case "server_metrics": {
        // 1) Disk space of Zabbix server (filesystem /)
        let diskUsagePct: number | null = null;
        try {
          const diskItems = await zabbix1("item.get", {
            output: ["itemid", "lastvalue", "name", "key_"],
            host: "Zabbix server",
            filter: { key_: "vfs.fs.dependent.size[/,pused]" },
            limit: 1,
          });
          if (diskItems.length > 0) {
            diskUsagePct = parseFloat(diskItems[0].lastvalue);
          }
        } catch { /* no disk item */ }

        // 2) Top hosts by CPU utilization (from "Zabbix servers" group)
        let cpuHosts: any[] = [];
        try {
          // First get the "Zabbix servers" host group ID
          const groups = await zabbix1("hostgroup.get", {
            output: ["groupid"],
            filter: { name: "Zabbix servers" },
          });
          const groupIds = groups.map((g: any) => g.groupid);

          // Get CPU utilization items from hosts in that group
          const cpuItems = await zabbix1("item.get", {
            output: ["itemid", "hostid", "lastvalue", "name", "key_"],
            filter: { key_: "system.cpu.util" },
            groupids: groupIds.length > 0 ? groupIds : undefined,
            selectHosts: ["hostid", "host", "name", "status"],
            monitored: true,
            limit: 50,
          });
          // Filter and sort by CPU desc, top 10
          const realCpuItems = cpuItems
            .filter((i: any) => i.hosts?.[0]?.status === "0" && parseFloat(i.lastvalue) > 0)
            .sort((a: any, b: any) => parseFloat(b.lastvalue) - parseFloat(a.lastvalue))
            .slice(0, 10);
          // Also try to get load averages for these hosts
          const hostIds = realCpuItems.map((i: any) => i.hostid);
          let loadItems: any[] = [];
          if (hostIds.length > 0) {
            try {
              loadItems = await zabbix1("item.get", {
                output: ["itemid", "hostid", "lastvalue", "key_"],
                hostids: hostIds,
                search: { key_: "system.cpu.load[" },
                searchByAny: true,
              });
            } catch { /* no load items */ }
          }
          // Get process count
          let procItems: any[] = [];
          if (hostIds.length > 0) {
            try {
              procItems = await zabbix1("item.get", {
                output: ["itemid", "hostid", "lastvalue", "key_"],
                hostids: hostIds,
                filter: { key_: "proc.num" },
              });
            } catch { /* no proc items */ }
          }

          const loadMap: Record<string, { avg1?: string; avg5?: string; avg15?: string }> = {};
          for (const li of loadItems) {
            if (!loadMap[li.hostid]) loadMap[li.hostid] = {};
            if (li.key_.includes("avg1]")) loadMap[li.hostid].avg1 = li.lastvalue;
            else if (li.key_.includes("avg5]")) loadMap[li.hostid].avg5 = li.lastvalue;
            else if (li.key_.includes("avg15]")) loadMap[li.hostid].avg15 = li.lastvalue;
          }
          const procMap: Record<string, string> = {};
          for (const pi of procItems) procMap[pi.hostid] = pi.lastvalue;

          cpuHosts = realCpuItems.map((i: any) => ({
            hostid: i.hostid,
            hostname: i.hosts?.[0]?.host || "",
            name: i.hosts?.[0]?.name || i.hosts?.[0]?.host || "",
            cpuUtil: parseFloat(i.lastvalue),
            load1m: loadMap[i.hostid]?.avg1 ? parseFloat(loadMap[i.hostid].avg1!) : null,
            load5m: loadMap[i.hostid]?.avg5 ? parseFloat(loadMap[i.hostid].avg5!) : null,
            load15m: loadMap[i.hostid]?.avg15 ? parseFloat(loadMap[i.hostid].avg15!) : null,
            processes: procMap[i.hostid] ? parseInt(procMap[i.hostid]) : null,
          }));
        } catch { /* no CPU data */ }

        // 3) Proxy last seen - fetched as items from "Zabbix server" host
        let proxies: any[] = [];
        try {
          const proxyItems = await zabbix1("item.get", {
            output: ["itemid", "lastvalue", "name", "key_"],
            host: "Zabbix server",
            search: { key_: "zabbix.proxy.last_seen" },
          });
          proxies = proxyItems.map((item: any) => {
            // Extract proxy name from key like "zabbix.proxy.last_seen[PRX-RJ]"
            const match = item.key_.match(/\[(.+?)\]/);
            const proxyName = match ? match[1] : item.name;
            const delaySec = parseInt(item.lastvalue) || 0;
            return {
              proxyid: item.itemid,
              name: proxyName,
              lastaccess: 0,
              delaySec,
            };
          });
        } catch { /* no proxy items */ }

        result = { diskUsagePct, cpuHosts, proxies };
        break;
      }

      case "acknowledge": {
        const { eventids, message, source, user_token } = body as { eventids: string[]; message: string; source?: string; user_token?: string };
        if (!Array.isArray(eventids) || eventids.length === 0 || !message || !message.trim()) {
          return new Response(JSON.stringify({ error: "eventids and message are required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Use per-user token if provided, otherwise fall back to global token
        let client;
        if (user_token && user_token.trim()) {
          const targetUrl = source === "z2" ? ZABBIX_API_URL_2 : ZABBIX_API_URL;
          if (!targetUrl) {
            return new Response(JSON.stringify({ error: "Zabbix URL não configurada para essa instância" }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          client = createZabbixClient(targetUrl, user_token.trim());
        } else {
          client = source === "z2" && zabbix2 ? zabbix2 : zabbix1;
        }
        // Strip "z1_"/"z2_" source prefix from eventids before sending to Zabbix
        const cleanEventIds = eventids.map((e) => String(e).replace(/^z[12]_/, ""));
        // action=4 → add message (bit flag per Zabbix API)
        result = await client("event.acknowledge", {
          eventids: cleanEventIds,
          action: 4,
          message: message.trim(),
        });
        break;
      }

      case "test_token": {
        const { token, source } = body as { token: string; source?: string };
        if (!token || !token.trim()) {
          return new Response(JSON.stringify({ ok: false, error: "Token vazio" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const targetUrl = source === "z2" ? ZABBIX_API_URL_2 : ZABBIX_API_URL;
        if (!targetUrl) {
          return new Response(JSON.stringify({ ok: false, error: "URL Zabbix não configurada" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        try {
          const client = createZabbixClient(targetUrl, token.trim());
          // user.get with no filter returns the authenticated user — works for any valid API token
          const users = await client("user.get", { output: ["userid", "username"] });
          return new Response(JSON.stringify({ ok: true, user: Array.isArray(users) ? users[0] : users }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Zabbix dashboard error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
