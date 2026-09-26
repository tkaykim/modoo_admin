import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

type ManifestDocument = {
  source_file: string;
  source_sha256: string;
  statement_date: string;
  line_count: number;
  supply_total: number;
  vat_total: number;
  gross_total: number;
};

type Manifest = {
  documents: ManifestDocument[];
  row_count: number;
};

type SourceLine = {
  source_file: string;
  source_sha256: string;
  statement_date: string;
  page: string;
  line_no: string;
  item_name: string;
  spec: string;
  quantity: string;
  unit_price_net: string;
  supply_amount: string;
  vat_amount: string;
  gross_amount: string;
  cost_class: string;
  size_or_dimension_note: string;
};

const attachmentIdsByHash: Record<string, number[]> = {
  b2581f8e4a6485a7364de63655659d8c6d6518d45253e70d1270a1802cf218a0: [2, 3],
  '00982f297f6f1acee04ec225f3f24fc3448a3ba1be52cfec7d33ee88d905609e': [4],
  '7a3e13acfc2adbcb1d348b55aaef8523491ecd51745f4f11e243213ebfe42d97': [5],
  '9667d52a09b22ba8911e8cae2408403bc07b363a3edf84da30ebd008ce42c055': [6],
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function requiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`Missing argument: ${name}`);
  return resolve(value);
}

function parseCsv(content: string): Record<string, string>[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field.replace(/\r$/, ''));
      records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Malformed CSV: unterminated quoted field');
  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ''));
    records.push(record);
  }

  const [headers, ...rows] = records;
  if (!headers) return [];
  return rows
    .filter((row) => row.some((value) => value !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function asNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}: ${value}`);
  return parsed;
}

function assertSourceIntegrity(manifest: Manifest, lines: SourceLine[]): void {
  if (lines.length !== manifest.row_count) {
    throw new Error(`Row count mismatch: manifest=${manifest.row_count}, csv=${lines.length}`);
  }

  for (const document of manifest.documents) {
    const documentLines = lines.filter((line) => line.source_sha256 === document.source_sha256);
    const supply = documentLines.reduce((total, line) => total + asNumber(line.supply_amount, 'supply_amount'), 0);
    const vat = documentLines.reduce((total, line) => total + asNumber(line.vat_amount, 'vat_amount'), 0);
    const gross = documentLines.reduce((total, line) => total + asNumber(line.gross_amount, 'gross_amount'), 0);

    if (
      documentLines.length !== document.line_count
      || supply !== document.supply_total
      || vat !== document.vat_total
      || gross !== document.gross_total
    ) {
      throw new Error(`Source totals do not reconcile: ${document.source_file}`);
    }
  }
}

async function main(): Promise<void> {
  const manifestPath = requiredArg('--manifest');
  const linesPath = requiredArg('--lines');
  const apply = process.argv.includes('--apply');
  const manufacturerId = process.env.PRINT_COST_MANUFACTURER_ID?.trim()
    || '5d35dde1-70a4-4bdd-948f-dc56b97cfb54';

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const lines = parseCsv(await readFile(linesPath, 'utf8')) as SourceLine[];
  assertSourceIntegrity(manifest, lines);

  const summary = {
    documents: manifest.documents.length,
    lines: lines.length,
    supply: manifest.documents.reduce((sum, document) => sum + document.supply_total, 0),
    vat: manifest.documents.reduce((sum, document) => sum + document.vat_total, 0),
    gross: manifest.documents.reduce((sum, document) => sum + document.gross_total, 0),
    apply,
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const client = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const documentRows = manifest.documents.map((document) => ({
    manufacturer_id: manufacturerId,
    supplier_name: '피스코프',
    statement_date: document.statement_date,
    source_kind: 'naverworks_attachment',
    source_filename: document.source_file,
    source_sha256: document.source_sha256,
    source_locator: {
      provider: 'naverworks',
      mailbox: 'tkay@grigoent.co.kr',
      mailId: '2022',
      attachmentIds: attachmentIdsByHash[document.source_sha256] ?? [],
    },
    total_supply_amount: document.supply_total,
    total_vat_amount: document.vat_total,
    total_gross_amount: document.gross_total,
    line_count: document.line_count,
    received_at: '2026-09-26T04:15:14+09:00',
    notes: '운영 손익 미반영 원본 증빙. 주문 항목 연결 및 기존 공장 정산 중복 검증 후 반영.',
  }));

  const { data: importedDocuments, error: documentError } = await client
    .from('print_cost_source_documents')
    .upsert(documentRows, { onConflict: 'source_sha256' })
    .select('id, source_sha256');
  if (documentError) throw documentError;

  const documentIds = new Map(
    (importedDocuments ?? []).map((document) => [document.source_sha256 as string, document.id as number]),
  );
  if (documentIds.size !== manifest.documents.length) {
    throw new Error('Not every source document returned an id');
  }

  const lineRows = lines.map((line) => ({
    document_id: documentIds.get(line.source_sha256),
    page_number: asNumber(line.page, 'page'),
    line_number: asNumber(line.line_no, 'line_no'),
    item_name: line.item_name,
    spec: line.spec || null,
    quantity: asNumber(line.quantity, 'quantity'),
    unit_price_net: asNumber(line.unit_price_net, 'unit_price_net'),
    supply_amount: asNumber(line.supply_amount, 'supply_amount'),
    vat_amount: asNumber(line.vat_amount, 'vat_amount'),
    gross_amount: asNumber(line.gross_amount, 'gross_amount'),
    cost_class: line.cost_class,
    size_or_dimension_note: line.size_or_dimension_note || null,
    match_status: 'unmatched',
    match_method: 'pending_order_reconciliation',
  }));

  for (let offset = 0; offset < lineRows.length; offset += 100) {
    const { error } = await client
      .from('print_cost_source_lines')
      .upsert(lineRows.slice(offset, offset + 100), {
        onConflict: 'document_id,line_number',
        // Source lines are immutable by document hash and line number.
        // Preserve later reconciliation fields such as match_status and match_notes on reruns.
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }

  const { count: documentCount, error: documentCountError } = await client
    .from('print_cost_source_documents')
    .select('*', { count: 'exact', head: true })
    .in('source_sha256', manifest.documents.map((document) => document.source_sha256));
  if (documentCountError) throw documentCountError;

  const { count: lineCount, error: lineCountError } = await client
    .from('print_cost_source_lines')
    .select('*', { count: 'exact', head: true })
    .in('document_id', [...documentIds.values()]);
  if (lineCountError) throw lineCountError;

  if (documentCount !== manifest.documents.length || lineCount !== manifest.row_count) {
    throw new Error(`Post-import count mismatch: documents=${documentCount}, lines=${lineCount}`);
  }

  console.log(JSON.stringify({ ...summary, verifiedDocuments: documentCount, verifiedLines: lineCount }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
