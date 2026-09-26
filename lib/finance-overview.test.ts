import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinanceOverview,
  estimatePrint,
  summarizeEntries,
  dayKst,
  type FinanceData,
  type RecordRow,
} from "./finance-overview";

const methods = [{ id: "dtf", key: "dtf" }];
const prices = [10, 20, 30].map((n, i) => ({
  id: String(i),
  factory_id: "default",
  print_method_id: "dtf",
  max_width_cm: n,
  max_height_cm: n,
  pricing_model: "flat",
  unit_price: [1500, 2400, 3200][i],
  is_active: true,
}));
const artwork = (extra: RecordRow = {}) => ({
  width: 100,
  height: 100,
  left: 0,
  top: 0,
  data: { printMethod: "dtf", widthMm: 100, heightMm: 100 },
  ...extra,
});
const item = (objects: RecordRow[], extra: RecordRow = {}) => ({
  id: "item",
  order_id: "order",
  product_title: "테스트",
  quantity: 2,
  canvas_state: { front: { objects } },
  ...extra,
});
const data = (extra: FinanceData = {}): FinanceData => ({
  orders: [
    {
      id: "order",
      payment_status: "completed",
      order_status: "delivered",
      total_amount: 100000,
      created_at: "2026-08-01",
      shipping_method: "pickup",
    },
  ],
  items: [item([])],
  costs: [{ order_item_id: "item", total_cost: 10000 }],
  methods,
  prices,
  manufacturers: [{ id: "default", name: "전사찍는사람들" }],
  ...extra,
});
const report = (extra: FinanceData = {}) => buildFinanceOverview(data(extra));

test("same-side artworks have one envelope fee; backgrounds are excluded", () => {
  const result = estimatePrint(
    item([
      artwork(),
      artwork({ left: 100 }),
      artwork({ excludeFromExport: true, width: 9999 }),
    ]),
    prices,
    methods,
    "default",
  );
  assert.equal(result.net, 4800);
  assert.deepEqual(result.missing, []);
});
test("separate sides have separate fees; string canvas snapshots are supported", () => {
  const r = estimatePrint(
    item([], {
      canvas_state: {
        front: JSON.stringify({ objects: [artwork()] }),
        back: { objects: [artwork()] },
      },
    }),
    prices,
    methods,
    "default",
  );
  assert.equal(r.net, 6000);
});
test("missing method and dimensions are explicit DTF scenarios, not garment sizes", () => {
  const r = estimatePrint(
    item([artwork({ data: {} })], {
      size: "XL",
      assigned_manufacturer_id: "unknown",
    }),
    prices,
    methods,
    "default",
  );
  assert.equal(r.net, 4800);
  assert.ok(r.notes.some((n) => n.includes("DTF 가정")));
  assert.ok(r.notes.some((n) => n.includes("중앙값")));
  assert.ok(r.notes.some((n) => n.includes("기본 공장")));
});
test("known unsupported methods and oversize artwork remain unresolved", () => {
  assert.equal(
    estimatePrint(
      item([
        artwork({
          data: { printMethod: "embroidery", widthMm: 100, heightMm: 100 },
        }),
      ]),
      prices,
      methods,
      "default",
    ).net,
    0,
  );
  const r = estimatePrint(
    item([
      artwork({ data: { printMethod: "dtf", widthMm: 1000, heightMm: 1000 } }),
    ]),
    prices,
    methods,
    "default",
  );
  assert.equal(r.net, 0);
  assert.equal(r.missing.length, 1);
});
test("positive ledger costs are preserved; overlapping factory fee is not added twice", () => {
  const e = report({
    prints: [{ order_item_id: "item", total_cost: 5000 }],
    factories: [{ order_item_id: "item", factory_amount: 5000 }],
  }).entries[0];
  assert.equal(e.recordedCost, 15000);
  assert.equal(e.costSupplement, 0);
  assert.equal(e.cost, 16500);
});
test("cancelled/unpaid orders excluded; zero-revenue paid orders retain costs", () => {
  const orders = [
    { id: "zero", payment_status: "completed", total_amount: 0 },
    { id: "cancel", payment_status: "completed", order_status: "cancelled" },
    { id: "unpaid", payment_status: "pending" },
  ];
  const r = report({ orders, items: [item([], { order_id: "zero" })] });
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].revenue, 0);
  assert.equal(r.entries[0].cost, 11000);
});
test("confirmed invoice supplements missing work fee; manual adjustments block guessed duplicate fees", () => {
  const links = [
    {
      link_type: "invoice_order",
      status: "confirmed",
      order_item_id: "item",
      amount_net: 8000,
    },
  ];
  assert.equal(report({ links }).entries[0].costSupplement, 8000);
  const e = report({
    links,
    adjustments: [{ order_item_id: "item", amount: 5000 }],
  }).entries[0];
  assert.equal(e.costSupplement, 0);
  assert.ok(e.missing.some((m) => m.includes("중복")));
});
test("evidence discount is gross, linked, and counted once", () => {
  const r = report({
    prints: [{ order_item_id: "item", total_cost: 5000 }],
    evidenceAdjustments: [
      { order_id: "order", source_line_id: 10, amount_gross: -1100 },
    ],
    links: [
      { order_id: "order", source_line_id: 10, status: "confirmed" },
      { order_id: "order", source_line_id: 10, status: "confirmed" },
    ],
  });
  assert.equal(r.entries[0].cost, 15400);
});
test("bank/ERP revenues and expenses use maximum, not sum; refunds reduce cost", () => {
  const r = report({
    orders: [],
    cases: [
      {
        case_key: "past",
        period_start: "2025-01-01",
        evidence: {
          erp_project: { id: 7 },
          supplier_cost_recoveries: [{ status: "confirmed", amount: 100 }],
        },
      },
    ],
    allocations: [
      { case_key: "past", direction: "receipt", amount_gross: 900 },
      { case_key: "past", direction: "cost", amount_gross: 500 },
    ],
    erp: [
      {
        source_table: "financial_entries",
        data: { project_id: 7, kind: "revenue", status: "paid", amount: 1000 },
      },
      {
        source_table: "financial_entries",
        data: { project_id: 7, kind: "expense", status: "paid", amount: 700 },
      },
    ],
  });
  assert.equal(r.entries[0].revenue, 1000);
  assert.equal(r.entries[0].cost, 600);
});
test("actual namespaced ERP source keys prevent historical/current double counts", () => {
  const r = report({
    cases: [{ case_key: "past", evidence: { erp_project: { id: 7 } } }],
    erp: [
      {
        record_key: "totalmanagement:projects:7",
        source_table: "projects",
        data: { id: 7 },
      },
    ],
    links: [
      {
        link_type: "erp_order",
        status: "confirmed",
        order_id: "order",
        source_erp_key: "totalmanagement:projects:7",
      },
    ],
  });
  assert.equal(r.entries.find((e) => e.id === "past")?.duplicate, true);
  assert.equal(summarizeEntries(r.entries).count, 1);
});
test("link to excluded cancelled order does not erase historical case", () => {
  const r = report({
    orders: [
      { id: "order", payment_status: "completed", order_status: "cancelled" },
    ],
    cases: [{ case_key: "past", existing_order_id: "order" }],
  });
  assert.equal(r.entries[0].duplicate, false);
});
test("ERP candidate overlapping a reconstructed case is excluded", () => {
  const r = report({
    orders: [],
    cases: [
      {
        case_key: "original",
        status: "review",
        evidence: { erp_project: { id: 7 } },
      },
      {
        case_key: "candidate",
        status: "candidate",
        evidence: {
          financial_basis: "erp_paid_entries_not_bank_reconciled",
          erp_project: { id: 7 },
        },
      },
    ],
  });
  assert.equal(r.entries.find((e) => e.id === "candidate")?.duplicate, true);
});
test("unknown sales stay unknown; their costs remain in total but outside comparable margin", () => {
  const r = report({
    cases: [{ case_key: "past", period_start: "2025-01-01" }],
    allocations: [{ case_key: "past", direction: "cost", amount_gross: 20000 }],
  });
  const total = summarizeEntries(r.entries);
  assert.equal(total.unknownRevenue, 1);
  assert.equal(total.cost, 31000);
  assert.equal(total.comparableCost, 11000);
  assert.equal(total.unknownRevenueCost, 20000);
  assert.equal(summarizeEntries(r.entries, false).cost, 30000);
});
test("bank cash uses actual KST transaction month, independent of case start", () => {
  const r = report({
    bank: [
      {
        transaction_key: "tx",
        transacted_at: "2026-08-31T16:00:00Z",
        deposit: 100,
        withdrawal: 0,
      },
    ],
    allocations: [
      {
        transaction_key: "tx",
        case_key: "past",
        direction: "receipt",
        amount_gross: 100,
      },
    ],
    cases: [{ case_key: "past", period_start: "2025-01-01" }],
  });
  assert.equal(dayKst("2026-08-31T16:00:00Z"), "2026-09-01");
  assert.equal(r.bankMonths[0].month, "2026-09");
  assert.equal(r.bankMonths[0].allocated, 1);
});
