/**
 * One cell of a ";"-separated file meant to be opened in a spreadsheet. Text starting like a formula
 * (= + - @ tab CR) is prefixed with an apostrophe so the spreadsheet shows it instead of evaluating it;
 * plain numbers, negative ones included, are left as they are.
 */
export function spreadsheetCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(?:[.,]\d+)?$/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
