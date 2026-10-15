import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { eachDayOfInterval } from "date-fns";
import { Atividade, diaEspecial, execLabel, iso, noDia, parse, periodo, progresso, statusDerivado, statusEfetivo } from "./cronogramaModel";
import { stageColor } from "./cronogramaColors";

export type PdfStage = { id: number; nome: string; ordem: number; cor?: string | null };
type RGB = [number, number, number];

// PDFs não usam tema; mesmas tonalidades dos tokens --stage-* do CSS.
const STAGE_RGB: Record<string, RGB> = {
  azul: [26, 104, 193], laranja: [202, 94, 13], violeta: [123, 52, 192], rosa: [189, 30, 110],
  ciano: [12, 125, 151], ambar: [156, 113, 7], vermelho: [192, 32, 32], grafite: [93, 103, 126],
};
const NAVY: RGB = [0, 13, 92];
const rgb = (s?: PdfStage) => STAGE_RGB[stageColor(s) || "azul"] || STAGE_RGB.azul;
const br = (d: string | null) => (d ? parse(d).toLocaleDateString("pt-BR") : "—");
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Segunda-feira da semana de referência. */
export const inicioSemana = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); };

type Opts = { titulo: string; filtros: [string, string][]; stages: PdfStage[]; atividades: Atividade[]; unidadesDe: (id: number) => string[]; gantt: boolean; semanal: boolean };

function cabecalho(doc: jsPDF, titulo: string, sub: string, filtros: [string, string][]) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 16, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(titulo, 10, 10.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, w - 10, 10.5, { align: "right" });
  doc.setTextColor(30, 30, 30); doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(sub, 10, 23);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
  doc.text(filtros.length ? `Filtros: ${filtros.map(([k, v]) => `${k}: ${v}`).join("  ·  ")}` : "Filtros: nenhum (todas as atividades)", 10, 28, { maxWidth: w - 20 });
  return 33;
}

function gantt(doc: jsPDF, o: Opts) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const rows = o.stages.map((s) => ({ s, acts: o.atividades.filter((a) => a.etapa_id === s.id).sort((a, b) => (a.data_inicio || "9").localeCompare(b.data_inicio || "9") || a.ordem - b.ordem) })).filter((r) => r.acts.length);
  const per = periodo(o.atividades);
  if (!per.inicio || !per.fim) { const y = cabecalho(doc, o.titulo, "Gantt do cronograma", o.filtros); doc.text("Nenhuma atividade com data para os filtros escolhidos.", 10, y + 8); return; }
  const start = parse(per.inicio), days = eachDayOfInterval({ start, end: parse(per.fim) }).filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  const keys = days.map(iso);
  if (!days.length) { const y = cabecalho(doc, o.titulo, "Gantt do cronograma", o.filtros); doc.text("Nenhuma atividade em dias úteis para os filtros escolhidos.", 10, y + 8); return; }
  const LABEL = 120, X0 = 10 + LABEL, TW = W - X0 - 10, dw = TW / days.length, RH = 7;
  // Só dias úteis: início vai para o próximo dia útil, fim para o anterior.
  const idxIni = (d: string) => { const i = keys.findIndex((k) => k >= d); return i < 0 ? keys.length - 1 : i; };
  const idxFim = (d: string) => { let i = -1; keys.forEach((k, j) => { if (k <= d) i = j; }); return Math.max(0, i); };
  const xOf = (d: string) => X0 + idxIni(d) * dw;
  const xEnd = (d: string) => X0 + (idxFim(d) + 1) * dw;
  const hoje = iso(new Date());

  const header = () => {
    const top = cabecalho(doc, o.titulo, `Gantt do cronograma · ${br(per.inicio)} a ${br(per.fim)} · ${o.atividades.length} atividades`, o.filtros);
    // meses
    let i = 0; doc.setFontSize(8);
    while (i < days.length) {
      const m = days[i].getMonth(); let j = i; while (j < days.length && days[j].getMonth() === m) j++;
      doc.setFillColor(232, 236, 245); doc.setDrawColor(200, 205, 215); doc.rect(X0 + i * dw, top, (j - i) * dw, 6, "FD");
      doc.setTextColor(...NAVY); doc.setFont("helvetica", "bold");
      if ((j - i) * dw > 14) doc.text(days[i].toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).toUpperCase(), X0 + i * dw + 1.5, top + 4.2);
      i = j;
    }
    // dias / semanas
    doc.setFont("helvetica", "normal"); doc.setFontSize(dw >= 4 ? 6 : 5.5); doc.setTextColor(80, 80, 80);
    days.forEach((d, k) => {
      const show = dw >= 3.5 || d.getDay() === 1;
      if (show) doc.text(String(d.getDate()), X0 + k * dw + (dw >= 4 ? dw / 2 : 0.3), top + 10, { align: dw >= 4 ? "center" : "left" });
    });
    doc.setFillColor(...NAVY); doc.rect(10, top, LABEL, 12, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Etapa / Atividade", 12, top + 7.5); doc.text("Início – Fim · Status", 10 + LABEL - 2, top + 7.5, { align: "right" });
    return top + 12;
  };

  let y = header();
  const yBody = y;
  const grid = (y0: number, y1: number) => {
    days.forEach((d, k) => {
      const s = iso(d);
      if (diaEspecial(s)) { doc.setFillColor(243, 244, 247); doc.rect(X0 + k * dw, y0, dw, y1 - y0, "F"); }
      if (d.getDay() === 1) { doc.setDrawColor(215, 218, 226); doc.setLineWidth(0.15); doc.line(X0 + k * dw, y0, X0 + k * dw, y1); }
    });
  };
  const fechaPagina = (y1: number) => {
    if (keys.includes(hoje)) { const x = xOf(hoje) + dw / 2; doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.5); doc.line(x, yBody - 12, x, y1); doc.setFontSize(6); doc.setTextColor(220, 38, 38); doc.text("HOJE", x + 0.8, yBody - 12.8); }
    doc.setFontSize(7); doc.setTextColor(120, 120, 120); doc.text(`Página ${doc.getNumberOfPages()}`, W - 10, H - 5, { align: "right" });
    doc.text("Barra cheia = etapa (período derivado) · barra fina = atividade · contorno vermelho = atraso · somente dias úteis · faixas cinza = feriado", 10, H - 5);
  };
  const linhas: { tipo: "s" | "a"; s: PdfStage; a?: Atividade; acts: Atividade[] }[] = [];
  rows.forEach((r) => { linhas.push({ tipo: "s", s: r.s, acts: r.acts }); r.acts.forEach((a) => linhas.push({ tipo: "a", s: r.s, a, acts: r.acts })); });

  let pageStart = y;
  linhas.forEach((l, idx) => {
    if (y + RH > H - 10) { grid(pageStart, y); redrawPending(); fechaPagina(y); doc.addPage(); y = header(); pageStart = y; }
    pending.push({ l, y });
    y += RH;
    if (idx === linhas.length - 1) { grid(pageStart, y); redrawPending(); fechaPagina(y); }
  });

  function redrawPending() {
    pending.forEach(({ l, y: ry }) => {
      const c = rgb(l.s);
      if (l.tipo === "s") {
        doc.setFillColor(c[0], c[1], c[2]); doc.rect(10, ry, 2, RH, "F");
        doc.setFillColor(246, 247, 251); doc.rect(12, ry, LABEL - 2, RH, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(20, 20, 20);
        const p = periodo(l.acts);
        doc.text(doc.splitTextToSize(`${l.s.ordem}. ${l.s.nome}`, LABEL - 48)[0], 14, ry + 4.7);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(70, 70, 70);
        doc.text(`${br(p.inicio)} – ${br(p.fim)} · ${progresso(l.acts)}%`, 10 + LABEL - 2, ry + 4.7, { align: "right" });
        if (p.inicio) { const x = xOf(p.inicio), w = Math.max(dw, xEnd(p.fim || p.inicio) - x); doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(x, ry + 1.2, w, RH - 2.4, 0.8, 0.8, "F"); if (w > 30) { doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text(doc.splitTextToSize(`${l.s.nome} · ${execLabel(statusDerivado(l.acts))}`, w - 3)[0], x + 1.5, ry + 4.6); } }
      } else {
        const a = l.a!, st = statusEfetivo(a);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(30, 30, 30);
        doc.text(doc.splitTextToSize(a.nome, LABEL - 50)[0], 17, ry + 4.6);
        doc.setTextColor(st === "ATRASADO" || st === "BLOQUEADO" ? 200 : 90, st === "ATRASADO" || st === "BLOQUEADO" ? 30 : 90, st === "ATRASADO" || st === "BLOQUEADO" ? 30 : 90);
        doc.text(`${br(a.data_inicio)} – ${br(a.data_fim || a.data_inicio)} · ${execLabel(st)}`, 10 + LABEL - 2, ry + 4.6, { align: "right" });
        if (a.data_inicio) {
          const x = xOf(a.data_inicio), w = Math.max(dw, xEnd(a.data_fim || a.data_inicio) - x);
          const done = a.status === "CONCLUIDO";
          doc.setFillColor(done ? Math.round(c[0] * 0.6 + 100) : c[0], done ? Math.round(c[1] * 0.6 + 100) : c[1], done ? Math.round(c[2] * 0.6 + 100) : c[2]);
          doc.roundedRect(x, ry + 1.8, w, RH - 3.6, 0.6, 0.6, "F");
          if (st === "ATRASADO") { doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.5); doc.roundedRect(x, ry + 1.8, w, RH - 3.6, 0.6, 0.6, "S"); }
        }
      }
      doc.setDrawColor(228, 230, 236); doc.setLineWidth(0.1); doc.line(10, ry + RH, W - 10, ry + RH);
    });
    pending.length = 0;
  }
}
const pending: { l: any; y: number }[] = [];

function semanal(doc: jsPDF, o: Opts) {
  const seg = inicioSemana();
  [0, 1].forEach((sem) => {
    if (doc.getNumberOfPages() > 1 || (doc as any).__used) doc.addPage("a4", "landscape");
    (doc as any).__used = true;
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const ini = addDays(seg, sem * 7), fim = addDays(ini, 4);
    const dias = Array.from({ length: 5 }, (_, i) => addDays(ini, i));
    const top = cabecalho(doc, o.titulo, `${sem === 0 ? "Semana atual" : "Próxima semana"} · ${ini.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`, o.filtros);
    const colW = (W - 20) / 5, y0 = top + 1, yMax = H - 10;
    dias.forEach((d, i) => {
      const s = iso(d), x = 10 + i * colW, esp = diaEspecial(s), we = false;
      doc.setFillColor(...(s === iso(new Date()) ? [26, 104, 193] as RGB : NAVY)); doc.rect(x, y0, colW - 1, 9, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(`${d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase()} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`, x + 2, y0 + 6);
      doc.setFillColor(we || esp ? 243 : 252, we || esp ? 244 : 252, we || esp ? 247 : 253); doc.setDrawColor(215, 218, 226); doc.rect(x, y0 + 9, colW - 1, yMax - y0 - 9, "FD");
      let cy = y0 + 11;
      if (esp) { doc.setFontSize(6.5); doc.setTextColor(180, 60, 20); doc.text(doc.splitTextToSize(esp.nome, colW - 4), x + 2, cy + 2.5); cy += 5; }
      const acts = o.atividades.filter((a) => noDia(a, s)).sort((a, b) => a.etapa_id - b.etapa_id || a.nome.localeCompare(b.nome));
      let restantes = acts.length;
      for (const a of acts) {
        const st = o.stages.find((x) => x.id === a.etapa_id), c = rgb(st), es = statusEfetivo(a);
        doc.setFontSize(7); doc.setFont("helvetica", "bold");
        const nome = doc.splitTextToSize(a.nome, colW - 6).slice(0, 3);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6);
        const etapa = doc.splitTextToSize(st?.nome || "", colW - 6).slice(0, 1);
        const h = 3 + nome.length * 3 + 3 + 3;
        if (cy + h > yMax - 5) break;
        doc.setFillColor(255, 255, 255); doc.setDrawColor(es === "ATRASADO" || es === "BLOQUEADO" ? 220 : 220, es === "ATRASADO" || es === "BLOQUEADO" ? 38 : 222, es === "ATRASADO" || es === "BLOQUEADO" ? 38 : 230);
        doc.rect(x + 1, cy, colW - 3, h, "FD"); doc.setFillColor(c[0], c[1], c[2]); doc.rect(x + 1, cy, 1.4, h, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(20, 20, 20); doc.text(nome, x + 3.5, cy + 3);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(c[0], c[1], c[2]); doc.text(etapa, x + 3.5, cy + 3 + nome.length * 3);
        doc.setTextColor(es === "ATRASADO" || es === "BLOQUEADO" ? 200 : 80, es === "ATRASADO" || es === "BLOQUEADO" ? 30 : 80, es === "ATRASADO" || es === "BLOQUEADO" ? 30 : 80);
        doc.text(execLabel(es), x + 3.5, cy + 6 + nome.length * 3);
        cy += h + 1.2; restantes--;
      }
      if (restantes > 0) { doc.setFontSize(7); doc.setTextColor(...NAVY); doc.setFont("helvetica", "bold"); doc.text(`+ ${restantes} atividade(s) — ver lista`, x + 2, yMax - 2); }
    });
    // Lista completa da semana
    const lista = o.atividades.filter((a) => dias.some((d) => noDia(a, iso(d)))).sort((a, b) => (a.data_inicio || "").localeCompare(b.data_inicio || "") || a.nome.localeCompare(b.nome));
    doc.addPage("a4", "landscape");
    const t2 = cabecalho(doc, o.titulo, `Lista de atividades · ${sem === 0 ? "semana atual" : "próxima semana"} (${ini.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}) · ${lista.length}`, o.filtros);
    autoTable(doc, {
      startY: t2, margin: { left: 10, right: 10 },
      head: [["Etapa", "Atividade", "Início", "Fim", "Status", "Responsável", "Unidades"]],
      body: lista.length ? lista.map((a) => [o.stages.find((s) => s.id === a.etapa_id)?.nome || "", a.nome, br(a.data_inicio), br(a.data_fim || a.data_inicio), execLabel(statusEfetivo(a)), a.responsavel || "—", o.unidadesDe(a.id).join(", ") || "—"]) : [["", "Nenhuma atividade nesta semana", "", "", "", "", ""]],
      styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" }, headStyles: { fillColor: NAVY, textColor: 255 },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 60 }, 2: { cellWidth: 18 }, 3: { cellWidth: 18 }, 4: { cellWidth: 22 }, 5: { cellWidth: 30 } },
      didParseCell: (d) => { if (d.section === "body" && d.column.index === 4 && (d.cell.raw === "Atraso" || d.cell.raw === "Bloqueada")) { d.cell.styles.textColor = [200, 30, 30]; d.cell.styles.fontStyle = "bold"; } },
    });
  });
}

export function gerarPdfCronograma(o: Opts) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: o.gantt ? "a3" : "a4" });
  if (o.gantt) { gantt(doc, o); (doc as any).__used = true; }
  if (o.semanal) semanal(doc, o);
  const sem = iso(inicioSemana());
  doc.save(`relatorio-cronograma-${o.gantt && !o.semanal ? "gantt" : o.semanal && !o.gantt ? "semanal" : "completo"}-${sem}.pdf`);
}
