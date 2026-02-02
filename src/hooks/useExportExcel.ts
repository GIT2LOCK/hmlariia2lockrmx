import * as XLSX from "xlsx";
import { toast } from "sonner";

interface ExportOptions {
  filename: string;
  sheetName?: string;
}

export function useExportExcel() {
  const exportToExcel = <T extends object>(
    data: T[],
    columns: { key: keyof T; header: string; format?: (value: T[keyof T]) => string }[],
    options: ExportOptions
  ) => {
    if (data.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    try {
      // Preparar dados para Excel
      const excelData = data.map((item) => {
        const row: Record<string, string | number> = {};
        columns.forEach((col) => {
          const value = item[col.key];
          row[col.header] = col.format ? col.format(value) : String(value ?? "");
        });
        return row;
      });

      // Criar workbook e worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || "Dados");

      // Ajustar largura das colunas
      const colWidths = columns.map((col) => ({
        wch: Math.max(
          col.header.length,
          ...excelData.map((row) => String(row[col.header] || "").length)
        ) + 2,
      }));
      worksheet["!cols"] = colWidths;

      // Gerar arquivo e download
      const timestamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `${options.filename}_${timestamp}.xlsx`);
      
      toast.success(`${data.length} registro(s) exportado(s) com sucesso!`);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar dados");
    }
  };

  return { exportToExcel };
}
