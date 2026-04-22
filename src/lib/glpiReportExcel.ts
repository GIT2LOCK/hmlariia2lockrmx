import * as XLSX from "xlsx";

export interface UnitRankingItem {
  company: string;
  unit: string;
  total: number;
  linkTickets: number;
}

export interface GlpiReportsData {
  totalTickets: number;
  byCompany: Record<string, number>;
  unitRanking: UnitRankingItem[];
  internetLinkRanking: UnitRankingItem[];
  generatedAt: string;
}

const REPORT_COMPANIES = ["Todos", "GoodStorage", "Brava", "PetCare", "Indefinido"];

const normalizeSheetName = (name: string) => name.toUpperCase().slice(0, 31);

const makeBar = (value: number, max: number) => {
  if (!value || !max) return "";
  return "█".repeat(Math.max(1, Math.round((value / max) * 24)));
};

const companyRows = (rows: UnitRankingItem[], company: string) =>
  company === "Todos" ? rows : rows.filter((item) => item.company === company);

const appendSection = (sheetRows: (string | number)[][], title: string) => {
  if (sheetRows.length) sheetRows.push([]);
  sheetRows.push([title]);
};

const createCompanySheet = (
  workbook: XLSX.WorkBook,
  company: string,
  data: GlpiReportsData,
  validUnits: UnitRankingItem[],
  validLinks: UnitRankingItem[],
) => {
  const rows = companyRows(validUnits, company).sort((a, b) => b.total - a.total);
  const linkRows = companyRows(validLinks, company).sort((a, b) => b.linkTickets - a.linkTickets);
  const totalTickets = company === "Todos" ? data.totalTickets : data.byCompany[company] || 0;
  const maxTotal = Math.max(...rows.map((item) => item.total), 0);
  const maxLinks = Math.max(...linkRows.map((item) => item.linkTickets), 0);
  const sheetRows: (string | number)[][] = [
    [`Relatório GLPI - ${company.toUpperCase()}`],
    ["Gerado em", new Date(data.generatedAt).toLocaleString("pt-BR")],
    ["Quantidade total de chamados abertos", totalTickets],
    ["Chamados por Unidade", rows.length],
    ["Unidades com chamados de link", linkRows.length],
  ];

  appendSection(sheetRows, "Gráfico representativo - chamados por unidade");
  sheetRows.push(["Unidade", "Empresa", "Chamados", "Visual"]);
  rows.slice(0, 20).forEach((item) => sheetRows.push([item.unit, item.company, item.total, makeBar(item.total, maxTotal)]));

  appendSection(sheetRows, "Gráfico representativo - chamados de link de internet");
  sheetRows.push(["Unidade", "Empresa", "Chamados de link", "Visual"]);
  linkRows.slice(0, 20).forEach((item) =>
    sheetRows.push([item.unit, item.company, item.linkTickets, makeBar(item.linkTickets, maxLinks)]),
  );

  appendSection(sheetRows, "Lista completa - todos os chamados por unidade");
  sheetRows.push(["#", "Empresa", "Unidade", "Total de chamados", "Chamados de link"]);
  rows.forEach((item, index) => sheetRows.push([index + 1, item.company, item.unit, item.total, item.linkTickets]));

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!cols"] = [{ wch: 8 }, { wch: 18 }, { wch: 42 }, { wch: 20 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(company));
};

export const exportGlpiReportWorkbook = (data: GlpiReportsData, isValidUnitRow: (item: UnitRankingItem) => boolean) => {
  const workbook = XLSX.utils.book_new();
  const validUnits = data.unitRanking.filter(isValidUnitRow);
  const validLinks = data.internetLinkRanking.filter(isValidUnitRow).filter((item) => item.linkTickets > 0);

  REPORT_COMPANIES.forEach((company) => createCompanySheet(workbook, company, data, validUnits, validLinks));

  XLSX.writeFile(workbook, `relatorio-glpi-completo-${new Date().toISOString().slice(0, 10)}.xlsx`);
};