import * as XLSX from "xlsx";

type R = { u: { id: number; nome_unidade: string; empresa_id?: number | null; cidade?: string | null; estado?: string | null }; sw: string | null; an: string | null; swQ: number; anQ: number; wan: string | null; cam: string | null };
type It = { unidade_id: number; tipo: string; modelo: string; quantidade: number; origem?: string; host_name?: string | null; ctrl?: boolean; observacao?: string | null };

const NOVAS = ["U7LT", "UAL6", "UAP6MP", "UAPLR6V2"];
const up = (s?: string | null) => (s ?? "").trim().toUpperCase();
const ni = (v: string | null) => v ?? "Não informado";

function sheet(wb: XLSX.WorkBook, name: string, data: Record<string, unknown>[], empty = "Sem dados para os filtros atuais") {
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Info: empty }]);
  const keys = Object.keys(data[0] ?? { Info: empty });
  ws["!cols"] = keys.map((k) => ({ wch: Math.min(50, Math.max(k.length, ...data.map((d) => String(d[k] ?? "").length)) + 2) }));
  if (data.length) ws["!autofilter"] = { ref: ws["!ref"]! };
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

function pivot(rows: R[], key: (r: R) => string, label: string, field: keyof R) {
  const m = new Map<string, Record<string, number>>();
  rows.forEach((r) => {
    const k = key(r); const v = ni(r[field] as string | null);
    const o = m.get(k) ?? {}; o[v] = (o[v] || 0) + 1; m.set(k, o);
  });
  const cols = [...new Set([...m.values()].flatMap((o) => Object.keys(o)))].sort();
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, o]) => {
    const row: Record<string, unknown> = { [label]: k };
    cols.forEach((c) => (row[c] = o[c] || 0));
    row.Total = Object.values(o).reduce((s, n) => s + n, 0);
    return row;
  });
}

export function exportarRelatorio(opts: {
  rows: R[]; itens: It[]; linkCount: Record<number, number>; empresas: { id: number; nome_fantasia: string }[]; filtros: [string, string][];
}) {
  const { rows, itens, linkCount, empresas, filtros } = opts;
  const emp = (id?: number | null) => empresas.find((e) => e.id === id)?.nome_fantasia ?? "Sem empresa";
  const ids = new Set(rows.map((r) => r.u.id));
  const its = itens.filter((i) => ids.has(i.unidade_id));
  const byId = new Map(rows.map((r) => [r.u.id, r]));
  const sorted = [...rows].sort((a, b) => up(a.u.nome_unidade).localeCompare(up(b.u.nome_unidade)));
  const wb = XLSX.utils.book_new();

  const novas = (uid: number) => its.filter((i) => i.unidade_id === uid && i.tipo === "ANTENA" && NOVAS.includes(up(i.modelo).replace(/\s/g, ""))).reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
  const pend = (r: R) => [r.sw === "PARCIAL" || r.sw === "N/E" || !r.sw ? "Switch" : "", r.an === "PARCIAL" || r.an === "N/E" || !r.an ? "Antenas" : "", r.wan === "PROBLEMAS" || r.wan === "S/R" ? "WAN" : "", !r.cam ? "Câmeras" : ""].filter(Boolean);

  // Resumo
  const cnt = (f: (r: R) => boolean) => rows.filter(f).length;
  sheet(wb, "Resumo", [
    { Indicador: "Gerado em", Valor: new Date().toLocaleString("pt-BR") },
    ...filtros.map(([k, v]) => ({ Indicador: `Filtro: ${k}`, Valor: v })),
    { Indicador: "Unidades", Valor: rows.length },
    { Indicador: "Switches (total)", Valor: rows.reduce((s, r) => s + r.swQ, 0) },
    { Indicador: "Antenas (total)", Valor: rows.reduce((s, r) => s + r.anQ, 0) },
    { Indicador: "Antenas novas", Valor: rows.reduce((s, r) => s + novas(r.u.id), 0) },
    { Indicador: "Links de internet", Valor: rows.reduce((s, r) => s + (linkCount[r.u.id] || 0), 0) },
    { Indicador: "Switch TOTAL / PARCIAL / N/E", Valor: `${cnt((r) => r.sw === "TOTAL")} / ${cnt((r) => r.sw === "PARCIAL")} / ${cnt((r) => r.sw === "N/E")}` },
    { Indicador: "Antenas TOTAL / PARCIAL / N/E", Valor: `${cnt((r) => r.an === "TOTAL")} / ${cnt((r) => r.an === "PARCIAL")} / ${cnt((r) => r.an === "N/E")}` },
    { Indicador: "WAN OK / S/R / PROBLEMAS", Valor: `${cnt((r) => r.wan === "OK")} / ${cnt((r) => r.wan === "S/R")} / ${cnt((r) => r.wan === "PROBLEMAS")}` },
    { Indicador: "Câmeras IP / ANALOG / Não informado", Valor: `${cnt((r) => r.cam === "IP")} / ${cnt((r) => r.cam === "ANALOG")} / ${cnt((r) => !r.cam)}` },
    { Indicador: "Unidades 100% adequadas", Valor: cnt((r) => !pend(r).length) },
  ]);

  // Lista geral ordenada por unidade
  const geral: Record<string, unknown>[] = [];
  sorted.forEach((r) => {
    const li = its.filter((i) => i.unidade_id === r.u.id).sort((a, b) => a.tipo.localeCompare(b.tipo) || up(a.modelo).localeCompare(up(b.modelo)));
    const base = { Unidade: up(r.u.nome_unidade), Empresa: emp(r.u.empresa_id), Cidade: up(r.u.cidade), UF: up(r.u.estado) };
    if (!li.length) geral.push({ ...base, Tipo: "", Modelo: "", Hostname: "", Quantidade: 0, CTRL: "", Origem: "", Observação: "Sem equipamentos" });
    li.forEach((i) => geral.push({ ...base, Tipo: i.tipo, Modelo: up(i.modelo), Hostname: i.host_name ?? "", Quantidade: Number(i.quantidade) || 0, CTRL: i.ctrl ? "Sim" : "", Origem: i.origem ?? "MANUAL", Observação: i.observacao ?? "" }));
  });
  sheet(wb, "Inventário geral", geral);

  // Situação por unidade
  sheet(wb, "Situação por unidade", sorted.map((r) => ({
    Unidade: up(r.u.nome_unidade), Empresa: emp(r.u.empresa_id), Cidade: up(r.u.cidade), UF: up(r.u.estado),
    "Qtd switches": r.swQ, "Status switch": ni(r.sw), "Qtd antenas": r.anQ, "Antenas novas": novas(r.u.id), "Antenas velhas": r.anQ - novas(r.u.id),
    "Status antenas": ni(r.an), "Links": linkCount[r.u.id] || 0, "Status WAN": ni(r.wan), "Câmeras": ni(r.cam),
    "Pendências": pend(r).join(", ") || "Nenhuma",
  })));

  // Pendências
  sheet(wb, "Pendências", sorted.filter((r) => pend(r).length).map((r) => ({
    Unidade: up(r.u.nome_unidade), Empresa: emp(r.u.empresa_id), UF: up(r.u.estado), "Qtd pendências": pend(r).length, Pendências: pend(r).join(", "),
    Switch: ni(r.sw), Antenas: ni(r.an), WAN: ni(r.wan), Câmeras: ni(r.cam),
  })).sort((a, b) => b["Qtd pendências"] - a["Qtd pendências"]), "Nenhuma pendência");

  // Por empresa
  const empMap = new Map<string, R[]>();
  rows.forEach((r) => { const k = emp(r.u.empresa_id); empMap.set(k, [...(empMap.get(k) ?? []), r]); });
  sheet(wb, "Por empresa", [...empMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, rs]) => ({
    Empresa: k, Unidades: rs.length, Switches: rs.reduce((s, r) => s + r.swQ, 0), Antenas: rs.reduce((s, r) => s + r.anQ, 0),
    "Antenas novas": rs.reduce((s, r) => s + novas(r.u.id), 0), Links: rs.reduce((s, r) => s + (linkCount[r.u.id] || 0), 0),
    "Switch TOTAL": rs.filter((r) => r.sw === "TOTAL").length, "Antenas TOTAL": rs.filter((r) => r.an === "TOTAL").length,
    "WAN OK": rs.filter((r) => r.wan === "OK").length, "WAN PROBLEMAS": rs.filter((r) => r.wan === "PROBLEMAS").length,
    "Câmeras IP": rs.filter((r) => r.cam === "IP").length, "Câmeras ANALOG": rs.filter((r) => r.cam === "ANALOG").length,
    "100% adequadas": rs.filter((r) => !pend(r).length).length,
  })));

  // Por estado / cidade
  const locMap = new Map<string, R[]>();
  rows.forEach((r) => { const k = `${up(r.u.estado) || "-"}|${up(r.u.cidade) || "-"}`; locMap.set(k, [...(locMap.get(k) ?? []), r]); });
  sheet(wb, "Por estado e cidade", [...locMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, rs]) => ({
    UF: k.split("|")[0], Cidade: k.split("|")[1], Unidades: rs.length, Switches: rs.reduce((s, r) => s + r.swQ, 0),
    Antenas: rs.reduce((s, r) => s + r.anQ, 0), Links: rs.reduce((s, r) => s + (linkCount[r.u.id] || 0), 0),
    "Com pendência": rs.filter((r) => pend(r).length).length,
  })));

  // Cruzamentos de status
  const eKey = (r: R) => emp(r.u.empresa_id);
  sheet(wb, "Empresa x Switch", pivot(rows, eKey, "Empresa", "sw"));
  sheet(wb, "Empresa x Antenas", pivot(rows, eKey, "Empresa", "an"));
  sheet(wb, "Empresa x WAN", pivot(rows, eKey, "Empresa", "wan"));
  sheet(wb, "Empresa x Câmeras", pivot(rows, eKey, "Empresa", "cam"));
  sheet(wb, "Switch x Antenas", pivot(rows, (r) => `Switch ${ni(r.sw)}`, "Status switch", "an"));

  // Modelos
  const mod = new Map<string, { Tipo: string; Modelo: string; Classe: string; Quantidade: number; Unidades: Set<number> }>();
  its.forEach((i) => {
    const m = up(i.modelo) || "SEM MODELO"; const k = `${i.tipo}|${m}`;
    const classe = i.tipo === "ANTENA" ? (NOVAS.includes(m.replace(/\s/g, "")) ? "Nova" : "Velha") : i.ctrl ? "CTRL" : "Normal";
    const o = mod.get(k) ?? { Tipo: i.tipo, Modelo: m, Classe: classe, Quantidade: 0, Unidades: new Set() };
    o.Quantidade += Number(i.quantidade) || 0; o.Unidades.add(i.unidade_id); mod.set(k, o);
  });
  sheet(wb, "Modelos", [...mod.values()].sort((a, b) => a.Tipo.localeCompare(b.Tipo) || b.Quantidade - a.Quantidade).map((o) => ({
    Tipo: o.Tipo, Modelo: o.Modelo, Classe: o.Classe, Quantidade: o.Quantidade, "Nº unidades": o.Unidades.size,
    Unidades: [...o.Unidades].map((id) => up(byId.get(id)?.u.nome_unidade)).sort().join(", "),
  })));

  // Unidade x Modelo (matriz)
  const modelos = [...new Set(its.map((i) => `${i.tipo === "ANTENA" ? "AP" : "SW"} ${up(i.modelo) || "SEM MODELO"}`))].sort();
  sheet(wb, "Unidade x Modelo", sorted.map((r) => {
    const o: Record<string, unknown> = { Unidade: up(r.u.nome_unidade) };
    modelos.forEach((m) => (o[m] = 0));
    its.filter((i) => i.unidade_id === r.u.id).forEach((i) => { const k = `${i.tipo === "ANTENA" ? "AP" : "SW"} ${up(i.modelo) || "SEM MODELO"}`; o[k] = (o[k] as number) + (Number(i.quantidade) || 0); });
    return o;
  }));

  // Origem dos dados
  sheet(wb, "Origem dos dados", sorted.map((r) => {
    const li = its.filter((i) => i.unidade_id === r.u.id);
    const s = (t: string, o: boolean) => li.filter((i) => i.tipo === t && (i.origem === "ZABBIX") === o).reduce((a, i) => a + (Number(i.quantidade) || 0), 0);
    return { Unidade: up(r.u.nome_unidade), "Switches Zabbix": s("SWITCH", true), "Switches manuais": s("SWITCH", false), "Antenas Zabbix": s("ANTENA", true), "Antenas manuais": s("ANTENA", false) };
  }));

  XLSX.writeFile(wb, `relatorio-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
