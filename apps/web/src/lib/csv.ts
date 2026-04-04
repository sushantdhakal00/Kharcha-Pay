/**
 * RFC4180-style CSV encoding. BigInt must already be stringified before passing.
 */
export function toCsv(
  rows: Record<string, string | number | null | undefined>[],
  headers: string[]
): string {
  const escape = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    // RFC4180: if field contains comma, newline, or quote, wrap in quotes and escape internal quotes
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerRow = headers.map(escape).join(",");
  const dataRows = rows.map((row) =>
    headers.map((h) => escape(row[h])).join(",")
  );
  return [headerRow, ...dataRows].join("\r\n");
}
