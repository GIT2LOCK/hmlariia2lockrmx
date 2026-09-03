import type jsPDF from "jspdf";

/* Paleta institucional (Navy / Azul claro) */
export const PDF_COLORS = {
  navy: [12, 25, 92] as RGB,
  blue: [79, 141, 214] as RGB,
  lightBlue: [150, 191, 235] as RGB,
  sky: [37, 99, 235] as RGB,
  red: [201, 48, 44] as RGB,
  orange: [230, 126, 34] as RGB,
  amber: [240, 190, 40] as RGB,
  teal: [21, 143, 149] as RGB,
  purple: [124, 77, 194] as RGB,
  gray: [130, 138, 150] as RGB,
  grid: [223, 227, 234] as RGB,
  text: [40, 46, 58] as RGB,
  muted: [110, 118, 132] as RGB,
  white: [255, 255, 255] as RGB,
  panel: [246, 248, 251] as RGB,
};

export type RGB = [number, number, number];

export const SERIES_PALETTE: RGB[] = [
  PDF_COLORS.navy, PDF_COLORS.blue, PDF_COLORS.teal, PDF_COLORS.orange,
  PDF_COLORS.purple, PDF_COLORS.amber, PDF_COLORS.red, PDF_COLORS.lightBlue,
];

interface Box { x: number; y: number; w: number; h: number }

const setFill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
const setText = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

/* ------------------------------ layout ------------------------------ */

export function pdfPageHeader(doc: jsPDF, title: string, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();
  setFill(doc, PDF_COLORS.navy);
  doc.rect(0, 0, w, 18, "F");
  setText(doc, PDF_COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title.toUpperCase(), 12, 11.5);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(subtitle, w - 12, 11.5, { align: "right" });
  }
  setText(doc, PDF_COLORS.text);
  doc.setFont("helvetica", "normal");
}

export function pdfPageFooter(doc: jsPDF, note: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  setFill(doc, PDF_COLORS.navy);
  doc.rect(0, h - 10, w, 10, "F");
  setText(doc, PDF_COLORS.white);
  doc.setFontSize(7.5);
  doc.text(note, 12, h - 4);
  const page = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  doc.text(String(page), w - 12, h - 4, { align: "right" });
  setText(doc, PDF_COLORS.text);
}

export function pdfPanel(doc: jsPDF, box: Box, title?: string) {
  setDraw(doc, PDF_COLORS.grid);
  setFill(doc, PDF_COLORS.white);
  doc.setLineWidth(0.3);
  doc.roundedRect(box.x, box.y, box.w, box.h, 1.5, 1.5, "FD");
  if (title) {
    setText(doc, PDF_COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(title.toUpperCase(), box.x + box.w / 2, box.y + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    setText(doc, PDF_COLORS.text);
  }
}

export interface KpiItem {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad" | "warn";
}

export function pdfKpiCards(doc: jsPDF, box: Box, items: KpiItem[], cols = 4, rowH = 20, gap = 3) {
  const cardW = (box.w - gap * (cols - 1)) / cols;
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = box.x + col * (cardW + gap);
    const y = box.y + row * (rowH + gap);
    setFill(doc, PDF_COLORS.panel);
    setDraw(doc, PDF_COLORS.grid);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, rowH, 1.5, 1.5, "FD");
    const accent =
      item.tone === "good" ? PDF_COLORS.teal :
      item.tone === "bad" ? PDF_COLORS.red :
      item.tone === "warn" ? PDF_COLORS.orange : PDF_COLORS.navy;
    setFill(doc, accent);
    doc.rect(x, y, 1.4, rowH, "F");
    setText(doc, PDF_COLORS.muted);
    doc.setFontSize(6.6);
    doc.text(doc.splitTextToSize(item.label.toUpperCase(), cardW - 7)[0], x + 4, y + 6);
    setText(doc, accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(item.value, x + 4, y + 13.5);
    doc.setFont("helvetica", "normal");
    if (item.hint) {
      setText(doc, PDF_COLORS.muted);
      doc.setFontSize(6.2);
      doc.text(doc.splitTextToSize(item.hint, cardW - 7)[0], x + 4, y + 17.6);
    }
    setText(doc, PDF_COLORS.text);
  });
  return box.y + Math.ceil(items.length / cols) * (rowH + gap);
}

/* ------------------------------ eixos ------------------------------ */

const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const s of steps) if (max <= s * base) return s * base;
  return 10 * base;
};

interface AxisArea extends Box { plotX: number; plotY: number; plotW: number; plotH: number; max: number }

function drawAxes(
  doc: jsPDF,
  box: Box,
  max: number,
  fmtY: (v: number) => string,
  padLeft = 14,
  padBottom = 12,
  padTop = 10,
): AxisArea {
  const plotX = box.x + padLeft;
  const plotY = box.y + padTop;
  const plotW = box.w - padLeft - 6;
  const plotH = box.h - padTop - padBottom;
  const top = niceMax(max);
  const ticks = 4;
  doc.setFontSize(6);
  for (let i = 0; i <= ticks; i++) {
    const v = (top / ticks) * i;
    const y = plotY + plotH - (plotH * i) / ticks;
    setDraw(doc, PDF_COLORS.grid);
    doc.setLineWidth(0.2);
    doc.line(plotX, y, plotX + plotW, y);
    setText(doc, PDF_COLORS.muted);
    doc.text(fmtY(v), plotX - 2, y + 1.5, { align: "right" });
  }
  setDraw(doc, PDF_COLORS.gray);
  doc.setLineWidth(0.3);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);
  setText(doc, PDF_COLORS.text);
  return { ...box, plotX, plotY, plotW, plotH, max: top };
}

function drawXLabels(doc: jsPDF, area: AxisArea, labels: string[], slotW: number, offset: number) {
  doc.setFontSize(5.4);
  setText(doc, PDF_COLORS.muted);
  const maxLabels = Math.max(2, Math.floor(area.plotW / 11));
  const step = Math.ceil(labels.length / maxLabels);
  labels.forEach((l, i) => {
    if (i % step) return;
    const x = area.plotX + slotW * i + offset;
    doc.text(String(l).slice(0, 12), x, area.plotY + area.plotH + 4, { align: "center" });
  });
  setText(doc, PDF_COLORS.text);
}

function drawLegend(doc: jsPDF, box: Box, entries: { name: string; color: RGB }[]) {
  doc.setFontSize(6);
  let x = box.x + 6;
  const y = box.y + box.h - 3;
  entries.forEach((e) => {
    setFill(doc, e.color);
    doc.rect(x, y - 2, 3, 2, "F");
    setText(doc, PDF_COLORS.muted);
    doc.text(e.name, x + 4.2, y);
    x += 8 + doc.getTextWidth(e.name);
  });
  setText(doc, PDF_COLORS.text);
}

/* ------------------------------ gráficos ------------------------------ */

export interface LineSeries { name: string; color: RGB; values: number[]; dashed?: boolean; showDots?: boolean }

export function pdfLineChart(
  doc: jsPDF,
  box: Box,
  title: string,
  labels: string[],
  series: LineSeries[],
  fmtY: (v: number) => string = (v) => String(Math.round(v)),
) {
  pdfPanel(doc, box, title);
  const inner = { x: box.x + 2, y: box.y + 8, w: box.w - 4, h: box.h - 14 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const area = drawAxes(doc, inner, max, fmtY, 14, 8, 2);
  const n = Math.max(1, labels.length - 1);
  const stepX = area.plotW / n;
  series.forEach((s) => {
    setDraw(doc, s.color);
    doc.setLineWidth(s.dashed ? 0.6 : 0.8);
    if (s.dashed) doc.setLineDashPattern([1.2, 1.2], 0);
    for (let i = 1; i < s.values.length; i++) {
      const x1 = area.plotX + stepX * (i - 1);
      const y1 = area.plotY + area.plotH - (s.values[i - 1] / area.max) * area.plotH;
      const x2 = area.plotX + stepX * i;
      const y2 = area.plotY + area.plotH - (s.values[i] / area.max) * area.plotH;
      doc.line(x1, y1, x2, y2);
    }
    doc.setLineDashPattern([], 0);
    if (s.showDots !== false && !s.dashed && s.values.length <= 40) {
      setFill(doc, s.color);
      s.values.forEach((v, i) => {
        const x = area.plotX + stepX * i;
        const y = area.plotY + area.plotH - (v / area.max) * area.plotH;
        doc.circle(x, y, 0.7, "F");
      });
    }
  });
  drawXLabels(doc, area, labels, stepX, 0);
  drawLegend(doc, box, series.map((s) => ({ name: s.name, color: s.color })));
}

export function pdfBarChart(
  doc: jsPDF,
  box: Box,
  title: string,
  labels: string[],
  series: { name: string; color: RGB; values: number[] }[],
  fmtY: (v: number) => string = (v) => String(Math.round(v)),
  showValues = false,
) {
  pdfPanel(doc, box, title);
  const inner = { x: box.x + 2, y: box.y + 8, w: box.w - 4, h: box.h - 14 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const area = drawAxes(doc, inner, max, fmtY, 14, 8, 2);
  const slot = area.plotW / Math.max(1, labels.length);
  const barW = Math.max(0.8, (slot * 0.7) / series.length);
  labels.forEach((_, i) => {
    series.forEach((s, si) => {
      const v = s.values[i] || 0;
      const h = (v / area.max) * area.plotH;
      const x = area.plotX + slot * i + slot * 0.15 + si * barW;
      setFill(doc, s.color);
      doc.rect(x, area.plotY + area.plotH - h, barW, h, "F");
      if (showValues && v > 0 && labels.length <= 14) {
        setText(doc, PDF_COLORS.muted);
        doc.setFontSize(5);
        doc.text(fmtY(v), x + barW / 2, area.plotY + area.plotH - h - 1, { align: "center" });
        setText(doc, PDF_COLORS.text);
      }
    });
  });
  drawXLabels(doc, area, labels, slot, slot / 2);
  drawLegend(doc, box, series.map((s) => ({ name: s.name, color: s.color })));
}

export function pdfStackedBarChart(
  doc: jsPDF,
  box: Box,
  title: string,
  labels: string[],
  series: { name: string; color: RGB; values: number[] }[],
) {
  pdfPanel(doc, box, title);
  const inner = { x: box.x + 2, y: box.y + 8, w: box.w - 4, h: box.h - 14 };
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] || 0), 0));
  const area = drawAxes(doc, inner, Math.max(1, ...totals), (v) => String(Math.round(v)), 14, 8, 2);
  const slot = area.plotW / Math.max(1, labels.length);
  const barW = Math.max(1, slot * 0.62);
  labels.forEach((_, i) => {
    let acc = 0;
    series.forEach((s) => {
      const v = s.values[i] || 0;
      if (!v) return;
      const h = (v / area.max) * area.plotH;
      const y = area.plotY + area.plotH - (acc / area.max) * area.plotH - h;
      setFill(doc, s.color);
      doc.rect(area.plotX + slot * i + (slot - barW) / 2, y, barW, h, "F");
      acc += v;
    });
  });
  drawXLabels(doc, area, labels, slot, slot / 2);
  drawLegend(doc, box, series.map((s) => ({ name: s.name, color: s.color })));
}

/** Ranking horizontal com rótulo e valor. */
export function pdfHBarChart(
  doc: jsPDF,
  box: Box,
  title: string,
  rows: { name: string; value: number; color?: RGB }[],
  fmtV: (v: number) => string = (v) => String(v),
) {
  pdfPanel(doc, box, title);
  const top = Math.max(1, ...rows.map((r) => Math.max(0, r.value)));
  const labelW = Math.min(38, box.w * 0.4);
  const startX = box.x + 4 + labelW;
  const availW = box.w - labelW - 24;
  const usableH = box.h - 12;
  const rowH = rows.length ? Math.min(7, usableH / rows.length) : 7;
  doc.setFontSize(6.2);
  rows.forEach((r, i) => {
    const y = box.y + 10 + i * rowH;
    setText(doc, PDF_COLORS.text);
    doc.text(doc.splitTextToSize(r.name, labelW)[0], box.x + 4, y + rowH * 0.6);
    const w = Math.max(0.6, (Math.max(0, r.value) / top) * availW);
    setFill(doc, r.color || PDF_COLORS.blue);
    doc.rect(startX, y + rowH * 0.15, w, rowH * 0.6, "F");
    setText(doc, PDF_COLORS.muted);
    doc.text(fmtV(r.value), startX + w + 1.5, y + rowH * 0.62);
  });
  setText(doc, PDF_COLORS.text);
}

export function pdfDonutChart(
  doc: jsPDF,
  box: Box,
  title: string,
  slices: { name: string; value: number; color: RGB }[],
) {
  pdfPanel(doc, box, title);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = box.x + box.w * 0.32;
  const cy = box.y + box.h / 2 + 2;
  const r = Math.min(box.w * 0.26, (box.h - 18) / 2);
  let start = -Math.PI / 2;
  if (!total) {
    setDraw(doc, PDF_COLORS.grid);
    doc.circle(cx, cy, r, "S");
  }
  slices.forEach((s) => {
    if (!s.value) return;
    const angle = (s.value / total) * Math.PI * 2;
    const steps = Math.max(2, Math.ceil(angle / 0.12));
    setFill(doc, s.color);
    for (let i = 0; i < steps; i++) {
      const a1 = start + (angle * i) / steps;
      const a2 = start + (angle * (i + 1)) / steps + 0.006;
      doc.triangle(
        cx, cy,
        cx + Math.cos(a1) * r, cy + Math.sin(a1) * r,
        cx + Math.cos(a2) * r, cy + Math.sin(a2) * r,
        "F",
      );
    }
    start += angle;
  });
  // furo central
  setFill(doc, PDF_COLORS.white);
  doc.circle(cx, cy, r * 0.55, "F");
  setText(doc, PDF_COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(String(total), cx, cy + 1.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  // legenda lateral
  doc.setFontSize(6.2);
  const lx = box.x + box.w * 0.62;
  slices.slice(0, 8).forEach((s, i) => {
    const y = box.y + 12 + i * 5.4;
    setFill(doc, s.color);
    doc.rect(lx, y - 2.2, 2.6, 2.6, "F");
    setText(doc, PDF_COLORS.text);
    const pct = total ? Math.round((s.value / total) * 100) : 0;
    doc.text(doc.splitTextToSize(`${s.name} — ${s.value} (${pct}%)`, box.w * 0.34)[0], lx + 3.6, y);
  });
  setText(doc, PDF_COLORS.text);
}

/** Mapa de calor (matriz linhas x colunas). */
export function pdfHeatmap(
  doc: jsPDF,
  box: Box,
  title: string,
  rowLabels: string[],
  colLabels: string[],
  matrix: number[][],
  base: RGB = PDF_COLORS.navy,
) {
  pdfPanel(doc, box, title);
  doc.setFontSize(5.4);
  const labelW = Math.min(
    box.w * 0.28,
    Math.max(8, ...rowLabels.map((l) => doc.getTextWidth(String(l)))) + 1.5,
  );
  const gridX = box.x + 3 + labelW;
  const gridY = box.y + 13;
  const gridW = box.w - labelW - 8;
  const gridH = box.h - 18;
  const cw = gridW / Math.max(1, colLabels.length);
  const ch = gridH / Math.max(1, rowLabels.length);
  const max = Math.max(1, ...matrix.flat());
  doc.setFontSize(5.4);
  colLabels.forEach((c, j) => {
    setText(doc, PDF_COLORS.muted);
    if (colLabels.length <= 26 || j % 2 === 0) {
      doc.text(String(c).slice(0, 8), gridX + cw * j + cw / 2, gridY - 2, { align: "center" });
    }
  });
  rowLabels.forEach((rl, i) => {
    setText(doc, PDF_COLORS.text);
    doc.text(doc.splitTextToSize(rl, labelW)[0], box.x + 3, gridY + ch * i + ch * 0.66);
    colLabels.forEach((_, j) => {
      const v = matrix[i]?.[j] || 0;
      const t = v / max;
      const c: RGB = [
        Math.round(255 - (255 - base[0]) * t),
        Math.round(255 - (255 - base[1]) * t),
        Math.round(255 - (255 - base[2]) * t),
      ];
      setFill(doc, c);
      setDraw(doc, PDF_COLORS.white);
      doc.setLineWidth(0.15);
      doc.rect(gridX + cw * j, gridY + ch * i, cw, ch, "FD");
      if (v && cw > 5 && ch > 4) {
        setText(doc, t > 0.55 ? PDF_COLORS.white : PDF_COLORS.text);
        doc.setFontSize(4.8);
        doc.text(String(v), gridX + cw * j + cw / 2, gridY + ch * i + ch * 0.65, { align: "center" });
        doc.setFontSize(5.4);
      }
    });
  });
  setText(doc, PDF_COLORS.text);
}

/** Barras + linha de percentual acumulado (Pareto). */
export function pdfParetoChart(
  doc: jsPDF,
  box: Box,
  title: string,
  rows: { name: string; value: number }[],
) {
  pdfPanel(doc, box, title);
  const inner = { x: box.x + 2, y: box.y + 8, w: box.w - 4, h: box.h - 14 };
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const area = drawAxes(doc, inner, Math.max(1, ...rows.map((r) => r.value)), (v) => String(Math.round(v)), 14, 8, 2);
  const slot = area.plotW / Math.max(1, rows.length);
  const barW = Math.max(1, slot * 0.6);
  let acc = 0;
  const points: { x: number; y: number }[] = [];
  rows.forEach((r, i) => {
    const h = (r.value / area.max) * area.plotH;
    setFill(doc, PDF_COLORS.blue);
    doc.rect(area.plotX + slot * i + (slot - barW) / 2, area.plotY + area.plotH - h, barW, h, "F");
    acc += r.value;
    points.push({
      x: area.plotX + slot * i + slot / 2,
      y: area.plotY + area.plotH - (acc / total) * area.plotH,
    });
  });
  setDraw(doc, PDF_COLORS.orange);
  doc.setLineWidth(0.7);
  for (let i = 1; i < points.length; i++) doc.line(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  setFill(doc, PDF_COLORS.orange);
  points.forEach((p) => doc.circle(p.x, p.y, 0.7, "F"));
  drawXLabels(doc, area, rows.map((r) => r.name), slot, slot / 2);
  drawLegend(doc, box, [
    { name: "Chamados", color: PDF_COLORS.blue },
    { name: "% acumulado", color: PDF_COLORS.orange },
  ]);
}

/** Barra de progresso 100% (dentro x fora do SLA). */
export function pdfGaugeBar(
  doc: jsPDF,
  box: Box,
  title: string,
  pct: number,
  target: number,
  captionOk: string,
  captionBad: string,
) {
  pdfPanel(doc, box, title);
  const barY = box.y + box.h / 2 - 3;
  const barX = box.x + 8;
  const barW = box.w - 16;
  setFill(doc, PDF_COLORS.grid);
  doc.roundedRect(barX, barY, barW, 7, 1, 1, "F");
  const okW = Math.max(0, Math.min(1, pct / 100)) * barW;
  setFill(doc, pct >= target ? PDF_COLORS.teal : PDF_COLORS.red);
  doc.roundedRect(barX, barY, okW, 7, 1, 1, "F");
  setDraw(doc, PDF_COLORS.navy);
  doc.setLineWidth(0.6);
  const tx = barX + (Math.max(0, Math.min(100, target)) / 100) * barW;
  doc.line(tx, barY - 2, tx, barY + 9);
  doc.setFontSize(6);
  setText(doc, PDF_COLORS.navy);
  doc.text(`Meta ${target}%`, tx, barY - 3, { align: "center" });
  setText(doc, PDF_COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`${pct}%`, barX, barY + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  setText(doc, PDF_COLORS.muted);
  doc.text(`${captionOk}  |  ${captionBad}`, barX + 16, barY + 15.4);
  setText(doc, PDF_COLORS.text);
}

export function pdfCoverPage(
  doc: jsPDF,
  opts: { title: string; subtitle: string; periodo: string; geradoEm: string; filtros: string[] },
) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  setFill(doc, PDF_COLORS.navy);
  doc.rect(0, 0, w, h, "F");
  setFill(doc, PDF_COLORS.blue);
  doc.rect(0, h * 0.62, w, 2, "F");
  setText(doc, PDF_COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text(opts.title, 20, h * 0.42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text(opts.subtitle, 20, h * 0.42 + 12);
  doc.setFontSize(10);
  doc.text(`Período: ${opts.periodo}`, 20, h * 0.72);
  doc.text(`Gerado em: ${opts.geradoEm}`, 20, h * 0.72 + 6);
  if (opts.filtros.length) {
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(`Filtros aplicados: ${opts.filtros.join(" · ")}`, w - 40);
    doc.text(lines.slice(0, 4), 20, h * 0.72 + 14);
  }
  setText(doc, PDF_COLORS.text);
}
