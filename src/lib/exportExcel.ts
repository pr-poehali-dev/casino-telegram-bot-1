import * as XLSX from 'xlsx';

/**
 * Экспортирует массив объектов в Excel-файл (.xlsx) и запускает скачивание.
 * @param rows Массив строк для экспорта (плоские объекты: ключ = заголовок столбца)
 * @param fileName Имя файла без расширения
 * @param sheetName Название листа внутри книги
 */
export function exportToExcel(rows: Record<string, unknown>[], fileName: string, sheetName = 'Отчёт') {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);

  // Автоширина колонок по содержимому
  const colWidths = rows.length > 0
    ? Object.keys(rows[0]).map(key => ({
        wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2,
      }))
    : [];
  sheet['!cols'] = colWidths;

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${fileName}_${stamp}.xlsx`);
}
