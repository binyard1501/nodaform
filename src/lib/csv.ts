// A leading =, +, -, @, tab or CR can make Excel/Sheets read the cell as a formula
// (CSV injection) when opened, so a guarding apostrophe is prepended to those values.
const cell = (v: unknown) => {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// BOM so Excel opens Korean text as UTF-8.
export function toCsv(rows: unknown[][]) {
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')
}

export function csvResponse(filename: string, rows: unknown[][]) {
  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
