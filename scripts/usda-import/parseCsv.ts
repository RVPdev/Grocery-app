import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

export function parseCsvFile<T>(path: string): T[] {
  const content = readFileSync(path, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true }) as T[];
}
