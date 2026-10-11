// Spreadsheet downloads that Excel opens directly.

export type CsvValue = string | number | null | undefined;

function cell(value: CsvValue) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Quote everything that could break a row, and stop spreadsheet formulas.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvResponse(rows: CsvValue[][], fileName: string) {
  // The byte-order mark tells Excel the file is UTF-8 (Arabic titles).
  const csv = `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
