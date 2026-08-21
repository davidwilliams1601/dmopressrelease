/**
 * Ad-hoc verification for issue #23 (media-network importer first/last-name mapping).
 * Runs the real alias table + display-name builder over the two fixture CSVs and prints
 * the mapping and resolved names. Run with: npx tsx scripts/check-network-name-mapping.ts
 */
import { readFileSync } from 'fs';
import {
  suggestNetworkFieldForHeader,
  buildNetworkDisplayName,
  NETWORK_IMPORT_TARGET_FIELDS,
} from '../src/lib/media-taxonomy';

function run(path: string) {
  const [headerLine, ...rows] = readFileSync(path, 'utf8').trim().split('\n');
  const headers = headerLine.split(',');
  const mapping = headers.map((h) => suggestNetworkFieldForHeader(h));

  console.log(`\n=== ${path} ===`);
  headers.forEach((h, i) => console.log(`  ${h} -> ${mapping[i]}`));

  const mapped = new Set(mapping);
  const hasName = mapped.has('name') || mapped.has('firstName');
  const missing = NETWORK_IMPORT_TARGET_FIELDS.filter((f) => f.required && !mapped.has(f.key));
  console.log(`  name mapping present: ${hasName}; other missing required: ${missing.length}`);

  rows.forEach((line) => {
    // Naive split is fine here: the fixtures quote only list columns, never name columns.
    const cells = line.split(',');
    const values: Record<string, string> = {};
    mapping.forEach((target, i) => {
      if (!target || target === 'ignore') return;
      const cell = (cells[i] || '').trim();
      if (cell) values[target] = values[target] ? `${values[target]}, ${cell}` : cell;
    });
    console.log(`  display name: "${buildNetworkDisplayName(values)}"`);
  });
}

run('docs/smart-distribution/fixtures/media-network-first-last-name.csv');
run('docs/smart-distribution/fixtures/media-network-combined-name.csv');
