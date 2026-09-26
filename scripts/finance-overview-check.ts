import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadFinanceData } from "../lib/finance-overview-data";
import {
  buildFinanceOverview,
  summarizeEntries,
  type FinanceData,
} from "../lib/finance-overview";

async function main() {
  const out = process.argv[2];
  if (!out) throw Error("Private output directory required");
  await fs.mkdir(out, { recursive: true });
  let data: FinanceData;
  if (process.argv.includes("--cached"))
    data = JSON.parse(await fs.readFile(path.join(out, "source.json"), "utf8"));
  else {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    data = await loadFinanceData(db);
    await fs.writeFile(path.join(out, "source.json"), JSON.stringify(data));
  }
  const report = buildFinanceOverview(data);
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  );
  const missing: Record<string, number> = {};
  for (const e of report.entries)
    for (const m of e.missing) {
      const k = m.slice(m.lastIndexOf(":") + 1).trim();
      missing[k] = (missing[k] || 0) + 1;
    }
  console.log(
    JSON.stringify(
      {
        counts: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v.length]),
        ),
        overall: summarizeEntries(report.entries),
        orders: summarizeEntries(
          report.entries.filter((e) => e.source === "order"),
        ),
        legacy: summarizeEntries(
          report.entries.filter((e) => e.source !== "order"),
        ),
        bankMonths: report.bankMonths.length,
        missing,
        duplicate: report.entries.filter((e) => e.duplicate).map((e) => e.id),
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
