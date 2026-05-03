import { traffic, topPages, campaigns, events, realtime, revenue, funnel } from '@/lib/ga4/reports';
import { MODOO_APP_EVENTS } from '@/lib/ga4/events';

type Args = { _: string[]; days: number; event?: string; json: boolean };

function parseArgs(argv: string[]): Args {
  const a: Args = { _: [], days: 7, json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--days') a.days = Number(argv[++i]);
    else if (t === '--event') a.event = argv[++i];
    else if (t === '--json') a.json = true;
    else a._.push(t);
  }
  return a;
}

function table(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(no rows)';
  const cols = Object.keys(rows[0]);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)),
  );
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const head = cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  const body = rows
    .map((r) => cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join('  '))
    .join('\n');
  return `${head}\n${sep}\n${body}`;
}

function printout(data: unknown, json: boolean) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (Array.isArray(data)) {
    console.log(table(data as Record<string, unknown>[]));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

const HELP = `
modoo_app GA4 CLI

Usage:
  pnpm ga4 <command> [--days N] [--event NAME] [--json]

Commands:
  traffic    Sessions/users/pageviews by date·source/medium  (--days, default 7)
  pages      Top pages by views                              (--days, default 7)
  campaigns  UTM source/medium/campaign performance          (--days, default 30)
  events     Event counts (use --event NAME to filter)       (--days, default 30)
  realtime   Currently active users by country
  revenue    Revenue/transactions by date·source             (--days, default 30)
  funnel     view_item → editor_open → design_complete → add_to_cart → begin_checkout → purchase

Known modoo_app events: ${MODOO_APP_EVENTS.join(', ')}
`;

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0];
  switch (cmd) {
    case 'traffic':
      printout(await traffic(a.days), a.json);
      break;
    case 'pages':
      printout(await topPages(a.days), a.json);
      break;
    case 'campaigns':
      printout(await campaigns(a.days || 30), a.json);
      break;
    case 'events':
      printout(await events(a.days || 30, a.event), a.json);
      break;
    case 'realtime':
      printout(await realtime(), a.json);
      break;
    case 'revenue':
      printout(await revenue(a.days || 30), a.json);
      break;
    case 'funnel':
      printout(await funnel(a.days || 30), a.json);
      break;
    default:
      console.log(HELP);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('ga4 error:', err?.message || err);
  process.exit(1);
});
