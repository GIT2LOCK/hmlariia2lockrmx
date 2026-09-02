import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireStaff, authErrorResponse } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ZabbixParams = Record<string, unknown> | unknown[];

function normalizeZabbixApiUrls(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return [];

  const urls = [trimmed];
  if (!/\/api_jsonrpc\.php$/i.test(trimmed)) {
    urls.unshift(`${trimmed}/api_jsonrpc.php`);
  }

  return Array.from(new Set(urls));
}

function createZabbixClient(url: string, token: string) {
  const candidateUrls = normalizeZabbixApiUrls(url);

  return async (method: string, params: ZabbixParams) => {
    let lastError: Error | null = null;

    for (const endpoint of candidateUrls) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        });
        const text = await res.text();
        let data: any;

        try {
          data = JSON.parse(text);
        } catch {
          lastError = new Error(`Zabbix endpoint did not return JSON (${res.status})`);
          continue;
        }

        if (!res.ok) {
          lastError = new Error(`Zabbix HTTP ${res.status}: ${JSON.stringify(data)}`);
          continue;
        }

        if (data.error) throw new Error(`Zabbix API error: ${JSON.stringify(data.error)}`);
        return data.result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error("Zabbix endpoint not configured");
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function fetchEventsByTimeWindows(
  client: ReturnType<typeof createZabbixClient>,
  baseParams: Record<string, unknown>,
  timeFrom: number,
  timeTill: number,
  perQueryLimit = 5000,
) {
  const events: any[] = [];
  const seen = new Set<string>();
  let truncated = false;
  const safeLimit = Math.min(Math.max(Number(perQueryLimit) || 5000, 100), 5000);
  const minWindowSeconds = 3600;

  const fetchWindow = async (from: number, till: number): Promise<void> => {
    const batch = await client("event.get", {
      ...baseParams,
      time_from: from,
      time_till: till,
      limit: safeLimit,
    });

    if (Array.isArray(batch) && batch.length >= safeLimit && till - from > minWindowSeconds) {
      const mid = Math.floor((from + till) / 2);
      await fetchWindow(mid + 1, till);
      await fetchWindow(from, mid);
      return;
    }

    if (Array.isArray(batch) && batch.length >= safeLimit) truncated = true;

    for (const event of batch || []) {
      if (!event?.eventid || seen.has(event.eventid)) continue;
      seen.add(event.eventid);
      events.push(event);
    }
  };

  await fetchWindow(timeFrom, timeTill);
  events.sort((a, b) => Number(b.clock || 0) - Number(a.clock || 0));
  return { events, truncated };
}

function classifyZabbix2(description: string): string {
  const d = normalizeText(description);
  if (/\b(?:switch|ap|access point|ctrl|controller)\b.*\boff-?line\b/.test(d)) return "equipamentos";
  if (/indisponibilidade.*(?:equipamento|ctrl|switch|\bap\b)/.test(d)) return "equipamentos";
  if (d.includes("indisponibilidade de ctrl")) return "equipamentos";
  if (d.includes("indisponibilidade de ddns")) return "links";
  if (d.includes("indisponibilidade de link")) return "links";
  if (d.includes("sem conexao com a unidade")) return "links";
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

  try {
    await requireStaff(req);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  const ZABBIX_API_URL_2LOCK = Deno.env.get("ZABBIX_API_URL_2") || Deno.env.get("ZABBIX_API_URL");
  const ZABBIX_API_TOKEN_2LOCK = Deno.env.get("ZABBIX_API_TOKEN_2") || Deno.env.get("ZABBIX_API_TOKEN");

  if (!ZABBIX_API_URL_2LOCK || !ZABBIX_API_TOKEN_2LOCK) {
    return new Response(JSON.stringify({ error: "Zabbix 2LOCK credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const zabbix2lock = createZabbixClient(ZABBIX_API_URL_2LOCK, ZABBIX_API_TOKEN_2LOCK);

  try {
    const body = await req.json();
    const { action } = body;
    let result: unknown;

    switch (action) {
      case "version": {
        result = await zabbix2lock("apiinfo.version", []);
        break;
      }

      case "problems": {
        result = await fetchProblemsFromInstance(zabbix2lock, "z2", () => true, classifyZabbix2, [2, 3, 4, 5]);
        break;
      }

      case "maintenance": {
        result = await fetchMaintenanceFromInstance(zabbix2lock, "z2");
        break;
      }

      case "hosts_all": {
        result = await fetchAllHostsFromInstance(zabbix2lock, "z2");
        break;
      }

      case "hostgroups": {
        result = await zabbix2lock("hostgroup.get", { output: ["groupid", "name"], sortfield: "name" });
        break;
      }

      case "hosts": {
        result = await zabbix2lock("host.get", {
          output: ["hostid", "host", "name", "status", "maintenance_status"],
          selectGroups: ["groupid", "name"],
          selectInterfaces: ["ip", "dns", "type"],
          sortfield: "name",
        });
        break;
      }

      case "server_metrics": {
        const countZabbix = async (method: string, params: Record<string, unknown>) => {
          try {
            const count = await zabbix2lock(method, { ...params, countOutput: true });
            return Number(count) || 0;
          } catch {
            return null;
          }
        };

        const latestNumericItem = async (
          candidates: Array<{ filter?: Record<string, unknown>; search?: Record<string, unknown> }>,
        ) => {
          for (const candidate of candidates) {
            try {
              const items = await zabbix2lock("item.get", {
                output: ["itemid", "hostid", "lastvalue", "name", "key_"],
                ...candidate,
                monitored: true,
                selectHosts: ["hostid", "host", "name", "status"],
                limit: 20,
              });
              const numeric = (items || [])
                .filter((item: any) => item.hosts?.[0]?.status === "0" && Number.isFinite(parseFloat(item.lastvalue)))
                .sort((a: any, b: any) => Number(b.lastclock || 0) - Number(a.lastclock || 0));
              if (numeric.length > 0) return parseFloat(numeric[0].lastvalue);
            } catch {
              // Tenta o proximo formato de item.
            }
          }
          return null;
        };

        let systemInfo: Record<string, number | string | boolean | null> = {
          serverRunning: true,
          version: null,
          frontendVersion: null,
          hostEnabled: null,
          hostDisabled: null,
          templates: null,
          itemsEnabled: null,
          itemsDisabled: null,
          itemsUnsupported: null,
          proxiesOnline: null,
          proxiesTotal: null,
        };

        try {
          const version = await zabbix2lock("apiinfo.version", []);
          systemInfo.version = typeof version === "string" ? version : null;
          systemInfo.frontendVersion = typeof version === "string" ? version : null;
        } catch { /* no version */ }

        const [
          hostEnabled,
          hostDisabled,
          templates,
          itemsEnabled,
          itemsDisabled,
          itemsUnsupported,
        ] = await Promise.all([
          countZabbix("host.get", { filter: { status: "0" } }),
          countZabbix("host.get", { filter: { status: "1" } }),
          countZabbix("template.get", {}),
          countZabbix("item.get", { filter: { status: "0" } }),
          countZabbix("item.get", { filter: { status: "1" } }),
          countZabbix("item.get", { filter: { state: "1" } }),
        ]);

        systemInfo = {
          ...systemInfo,
          hostEnabled,
          hostDisabled,
          templates,
          itemsEnabled,
          itemsDisabled,
          itemsUnsupported,
        };

        const valuesPerSecond = await latestNumericItem([
          { filter: { key_: "zabbix[wcache,values,all]" } },
          { search: { name: "Values processed by Zabbix server per second" } },
          { search: { name: "values per second" } },
        ]);

        let diskUsagePct: number | null = null;
        try {
          const diskItems = await zabbix2lock("item.get", {
            output: ["itemid", "hostid", "lastvalue", "name", "key_"],
            search: { key_: "vfs.fs" },
            searchByAny: true,
            monitored: true,
            selectHosts: ["hostid", "host", "name", "status"],
            limit: 100,
          });
          const diskCandidates = (diskItems || [])
            .filter((item: any) =>
              item.hosts?.[0]?.status === "0" &&
              String(item.key_ || "").includes("pused") &&
              Number.isFinite(parseFloat(item.lastvalue)),
            )
            .sort((a: any, b: any) => parseFloat(b.lastvalue) - parseFloat(a.lastvalue));

          if (diskCandidates.length > 0) {
            diskUsagePct = parseFloat(diskCandidates[0].lastvalue);
          }
        } catch { /* no disk item */ }

        let memoryAvailablePct: number | null = null;
        let memoryHosts: any[] = [];
        try {
          const memoryItems = await zabbix2lock("item.get", {
            output: ["itemid", "hostid", "lastvalue", "name", "key_"],
            filter: { key_: "vm.memory.size[pavailable]" },
            monitored: true,
            selectHosts: ["hostid", "host", "name", "status"],
            limit: 100,
          });
          const normalizedMemory = (memoryItems || [])
            .filter((item: any) => item.hosts?.[0]?.status === "0" && Number.isFinite(parseFloat(item.lastvalue)))
            .map((item: any) => {
              const available = parseFloat(item.lastvalue);
              const host = item.hosts?.[0] || {};
              return {
                hostid: item.hostid,
                hostname: host.host || "",
                name: host.name || host.host || "",
                memoryAvailablePct: available,
                memoryUtilPct: Math.max(0, Math.min(100, 100 - available)),
              };
            });

          memoryHosts = normalizedMemory
            .sort((a: any, b: any) => b.memoryUtilPct - a.memoryUtilPct)
            .slice(0, 8);

          const zabbixMemory = normalizedMemory.find((item: any) => item.name.toLowerCase().includes("zabbix") || item.hostname.toLowerCase().includes("zabbix"));
          memoryAvailablePct = zabbixMemory?.memoryAvailablePct ?? normalizedMemory[0]?.memoryAvailablePct ?? null;
        } catch { /* no memory items */ }

        let cpuHosts: any[] = [];
        try {
          const cpuItems = await zabbix2lock("item.get", {
            output: ["itemid", "hostid", "lastvalue", "name", "key_"],
            search: { key_: "system.cpu.util" },
            searchByAny: true,
            selectHosts: ["hostid", "host", "name", "status"],
            monitored: true,
            limit: 100,
          });

          const realCpuItems = cpuItems
            .filter((i: any) => i.hosts?.[0]?.status === "0" && Number.isFinite(parseFloat(i.lastvalue)))
            .sort((a: any, b: any) => parseFloat(b.lastvalue) - parseFloat(a.lastvalue))
            .slice(0, 10);

          const hostIds = realCpuItems.map((i: any) => i.hostid);
          let loadItems: any[] = [];
          if (hostIds.length > 0) {
            try {
              loadItems = await zabbix2lock("item.get", {
                output: ["itemid", "hostid", "lastvalue", "key_"],
                hostids: hostIds,
                search: { key_: "system.cpu.load[" },
                searchByAny: true,
                monitored: true,
              });
            } catch { /* no load items */ }
          }

          let procItems: any[] = [];
          if (hostIds.length > 0) {
            try {
              procItems = await zabbix2lock("item.get", {
                output: ["itemid", "hostid", "lastvalue", "key_"],
                hostids: hostIds,
                search: { key_: "proc.num" },
                searchByAny: true,
                monitored: true,
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

        let proxies: any[] = [];
        try {
          const proxyList = await zabbix2lock("proxy.get", {
            output: ["proxyid", "name", "host", "lastaccess"],
          });
          const now = Math.floor(Date.now() / 1000);
          proxies = (proxyList || []).map((proxy: any) => {
            const lastaccess = Number(proxy.lastaccess || 0);
            return {
              proxyid: proxy.proxyid,
              name: proxy.name || proxy.host || `Proxy ${proxy.proxyid}`,
              lastaccess,
              delaySec: lastaccess > 0 ? Math.max(0, now - lastaccess) : -1,
            };
          });
        } catch {
          proxies = [];
        }

        if (proxies.length === 0) {
          try {
            const proxyItems = await zabbix2lock("item.get", {
              output: ["itemid", "lastvalue", "name", "key_"],
              search: { key_: "zabbix.proxy.last_seen" },
              searchByAny: true,
              monitored: true,
            });
            proxies = proxyItems.map((item: any) => {
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
        }

        const proxiesTotal = proxies.length;
        const proxiesOnline = proxies.filter((proxy: any) => proxy.delaySec >= 0 && proxy.delaySec <= 120).length;
        systemInfo = { ...systemInfo, proxiesOnline, proxiesTotal };

        result = { diskUsagePct, memoryAvailablePct, valuesPerSecond, cpuHosts, memoryHosts, proxies, systemInfo };
        break;
      }

      case "acknowledge": {
        const { eventids, message, user_token } = body as { eventids: string[]; message: string; user_token?: string };
        if (!Array.isArray(eventids) || eventids.length === 0 || !message || !message.trim()) {
          return new Response(JSON.stringify({ error: "eventids and message are required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Use per-user token if provided, otherwise fall back to global token
        let client;
        if (user_token && user_token.trim()) {
          const targetUrl = ZABBIX_API_URL_2LOCK;
          if (!targetUrl) {
            return new Response(JSON.stringify({ error: "Zabbix URL não configurada para essa instância" }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          client = createZabbixClient(targetUrl, user_token.trim());
        } else {
          client = zabbix2lock;
        }
        // Remove o prefixo local antes de enviar para o Zabbix 2LOCK.
        const cleanEventIds = eventids.map((e) => String(e).replace(/^z2_/, ""));
        // action=4 → add message (bit flag per Zabbix API)
        result = await client("event.acknowledge", {
          eventids: cleanEventIds,
          action: 4,
          message: message.trim(),
        });
        break;
      }

      case "test_token": {
        const { token } = body as { token: string };
        if (!token || !token.trim()) {
          return new Response(JSON.stringify({ ok: false, error: "Token vazio" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const targetUrl = ZABBIX_API_URL_2LOCK;
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

      case "events_history": {
        const {
          time_from,
          time_till,
          severities = [4],
          hostgroup_ids,
          search,
          limit = 5000,
          min_duration_sec = 300,
        } = body as {
          time_from: number;
          time_till: number;
          severities?: number[];
          hostgroup_ids?: string[];
          search?: string;
          limit?: number;
          min_duration_sec?: number;
        };


        if (!time_from || !time_till) {
          return new Response(JSON.stringify({ error: "time_from and time_till are required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const client = zabbix2lock;
        if (!client) {
          return new Response(JSON.stringify({ error: "Instância Zabbix não configurada" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const problemParams: Record<string, unknown> = {
          output: ["eventid", "objectid", "name", "severity", "clock", "r_eventid", "acknowledged"],
          source: 0,
          object: 0,
          value: 1,
          severities,
          selectTags: "extend",
          sortfield: ["clock"],
          sortorder: "DESC",
        };

        if (Array.isArray(hostgroup_ids) && hostgroup_ids.length > 0) {
          problemParams.groupids = hostgroup_ids;
        }

        const { events, truncated } = await fetchEventsByTimeWindows(client, problemParams, Number(time_from), Number(time_till), Number(limit));

        const triggerIds = Array.from(new Set(events.map((e: any) => e.objectid).filter(Boolean)));
        const triggerMap: Record<string, any> = {};
        if (triggerIds.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < triggerIds.length; i += 500) chunks.push(triggerIds.slice(i, i + 500) as string[]);
          for (const chunk of chunks) {
            const triggers = await client("trigger.get", {
              output: ["triggerid", "description", "priority"],
              triggerids: chunk,
              selectHosts: ["hostid", "host", "name"],
              selectGroups: ["groupid", "name"],
            });
            for (const t of triggers) triggerMap[t.triggerid] = t;
          }
        }

        const recoveryIds = Array.from(
          new Set(events.map((e: any) => e.r_eventid).filter((x: string) => x && x !== "0")),
        );
        const recoveryMap: Record<string, string> = {};
        if (recoveryIds.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < recoveryIds.length; i += 1000) chunks.push(recoveryIds.slice(i, i + 1000) as string[]);
          for (const chunk of chunks) {
            const rEvents = await client("event.get", {
              output: ["eventid", "clock"],
              eventids: chunk,
            });
            for (const re of rEvents) recoveryMap[re.eventid] = re.clock;
          }
        }

        const now = Math.floor(Date.now() / 1000);
        const result_events = events.map((e: any) => {
          const trg = triggerMap[e.objectid] || {};
          const host = trg.hosts?.[0] || {};
          const recoveryClock = e.r_eventid && e.r_eventid !== "0" ? recoveryMap[e.r_eventid] : null;
          const startClock = Number(e.clock);
          const endClock = recoveryClock ? Number(recoveryClock) : now;
          return {
            eventid: e.eventid,
            clock: startClock,
            name: trg.description || e.name,
            triggerid: e.objectid || null,
            severity: Number(e.severity),
            hostid: host.hostid || null,
            hostname: host.host || "",
            host_visible: host.name || host.host || "",
            groups: (trg.groups || []).map((g: any) => g.name),
            groupids: (trg.groups || []).map((g: any) => String(g.groupid)),
            tags: (e.tags || []).map((t: any) => ({ tag: String(t.tag || ""), value: String(t.value ?? "") })),
            duration_sec: Math.max(0, endClock - startClock),
            status: recoveryClock ? "RESOLVED" : "OPEN",
            resolved_at: recoveryClock ? Number(recoveryClock) : null,
            acknowledged: e.acknowledged === "1",
          };
        });

        const minDur = Math.max(0, Number(min_duration_sec) || 0);
        let filtered = result_events.filter((r: any) => r.duration_sec >= minDur);

        if (search && search.trim()) {
          const s = search.trim().toLowerCase();
          filtered = filtered.filter((r: any) =>
            r.name.toLowerCase().includes(s) ||
            r.hostname.toLowerCase().includes(s) ||
            r.host_visible.toLowerCase().includes(s),
          );
        }

        result = { events: filtered, total: filtered.length, fetched_total: events.length, truncated };
        break;
      }

      case "current_open_problems": {
        const {
          severities = [4],
          hostgroup_ids,
          search,
        } = body as {
          severities?: number[];
          hostgroup_ids?: string[];
          search?: string;
        };

        const client = zabbix2lock;
        if (!client) {
          return new Response(JSON.stringify({ error: "Instância Zabbix não configurada" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const params: Record<string, unknown> = {
          output: ["eventid", "objectid", "name", "severity", "clock"],
          source: 0,
          object: 0,
          severities,
          suppressed: false,
        };
        if (Array.isArray(hostgroup_ids) && hostgroup_ids.length > 0) {
          params.groupids = hostgroup_ids;
        }

        const problems = await client("problem.get", params);
        const triggerIds = Array.from(new Set(problems.map((p: any) => p.objectid).filter(Boolean)));
        let triggerMap: Record<string, any> = {};
        if (triggerIds.length > 0) {
          const triggers = await client("trigger.get", {
            output: ["triggerid", "description"],
            triggerids: triggerIds,
            monitored: true,
            selectHosts: ["hostid", "host", "name", "status", "maintenance_status"],
          });
          triggerMap = Object.fromEntries(triggers.map((t: any) => [t.triggerid, t]));
        }

        const s = (search || "").trim().toLowerCase();
        const nowSec = Math.floor(Date.now() / 1000);
        const filtered = problems.filter((p: any) => {
          const trg = triggerMap[p.objectid];
          if (!trg || !trg.hosts || trg.hosts.length === 0) return false;
          if (trg.hosts.every((h: any) => String(h.status) === "1")) return false;
          if (trg.hosts.some((h: any) => String(h.maintenance_status) === "1")) return false;
          // Apenas problemas ativos há >= 5 minutos
          if (nowSec - Number(p.clock || 0) < 300) return false;
          if (s) {
            const name = (trg.description || p.name || "").toLowerCase();
            const host = (trg.hosts[0]?.name || trg.hosts[0]?.host || "").toLowerCase();
            const hostname = (trg.hosts[0]?.host || "").toLowerCase();
            if (!name.includes(s) && !host.includes(s) && !hostname.includes(s)) return false;
          }
          return true;
        });

        result = { count: filtered.length };
        break;
      }

      case "hostgroups_by_source": {
        const client = zabbix2lock;
        if (!client) {
          return new Response(JSON.stringify({ error: "Instância Zabbix não configurada" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await client("hostgroup.get", {
          output: ["groupid", "name"],
          real_hosts: true,
          sortfield: "name",
        });
        break;
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
