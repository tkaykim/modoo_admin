import { findMatchingPricingByDimensions } from "./factoryPricing";

export type RecordRow = Record<string, unknown>;
export type FinanceData = Record<string, RecordRow[]>;
export type FinanceEntry = {
  id: string;
  title: string;
  source: "order" | "legacy" | "erp";
  date: string;
  quantity: number;
  revenue: number | null;
  recordedRevenue: number;
  recordedCost: number;
  costSupplement: number;
  vatSupplement: number;
  estimatedRevenue: number;
  estimatedCost: number;
  cost: number;
  missing: string[];
  basis: string[];
  duplicate: boolean;
  link: string;
};
export type BankMonth = {
  month: string;
  deposit: number;
  withdrawal: number;
  count: number;
  allocated: number;
};
export type FinanceOverview = {
  generatedAt: string;
  entries: FinanceEntry[];
  bankMonths: BankMonth[];
  bankRange: { from: string; to: string };
  shippingMedian: number;
};
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const obj = (v: unknown): RecordRow => {
  if (typeof v === "string") {
    try {
      return obj(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as RecordRow)
    : {};
};
const arr = (v: unknown): RecordRow[] => (Array.isArray(v) ? v.map(obj) : []);
const sum = (rows: RecordRow[], key: string) =>
  rows.reduce((s, r) => s + num(r[key]), 0);
const median = (values: number[]) => {
  const v = values.filter((n) => n > 0).sort((a, b) => a - b);
  return v.length
    ? (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2
    : 0;
};
export const dayKst = (v: unknown): string => {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ""
    : new Date(d.getTime() + 32400000).toISOString().slice(0, 10);
};
const by = (rows: RecordRow[], key: string) => {
  const map = new Map<string, RecordRow[]>();
  for (const r of rows) {
    const k = String(r[key]);
    map.set(k, [...(map.get(k) || []), r]);
  }
  return map;
};

/** Report-only scenarios; never write guessed prices back to the cost ledger.
 * Same-side objects share one fee. Missing methods use an explicitly labelled
 * DTF scenario; missing dimensions use the median flat tariff, not garment size.
 */
export function estimatePrint(
  item: RecordRow,
  prices: RecordRow[],
  methods: RecordRow[],
  defaultFactory: string,
) {
  const notes: string[] = [];
  const missing: string[] = [];
  let total = 0;
  let objects = 0;
  const state = obj(item.canvas_state);
  let sides = 0;
  for (const [side, raw] of Object.entries(state)) {
    const canvas = obj(raw);
    if (!Array.isArray(canvas.objects)) {
      missing.push(`${side}: 시안 형식 미확인`);
      continue;
    }
    sides++;
    const groups = new Map<string, RecordRow[]>();
    for (const o of arr(canvas.objects)) {
      if (
        o.excludeFromExport ||
        o.visible === false ||
        num(o.opacity ?? 1) === 0 ||
        obj(o.data).id === "background-product-image"
      )
        continue;
      objects++;
      const storedMethod = str(
        obj(o.data).printMethod || o.printMethod,
      ).replace(/^printing$/, "dtf");
      const method = storedMethod || "dtf";
      if (!storedMethod) notes.push(`${side}: 인쇄방법 미기록 → DTF 가정`);
      groups.set(method, [...(groups.get(method) || []), o]);
    }
    for (const [method, group] of groups) {
      const methodId = methods.find((m) => m.key === method)?.id;
      if (!methodId) {
        missing.push(`${side}: 인쇄방법 미확인`);
        continue;
      }
      const boxes = group.map((o) => {
        const d = obj(o.data);
        const w = num(d.widthMm ?? o.widthMm),
          h = num(d.heightMm ?? o.heightMm);
        const pw = num(o.width) * Math.abs(num(o.scaleX ?? 1)),
          ph = num(o.height) * Math.abs(num(o.scaleY ?? 1));
        const a = (num(o.angle) * Math.PI) / 180,
          bw = Math.abs(pw * Math.cos(a)) + Math.abs(ph * Math.sin(a)),
          bh = Math.abs(pw * Math.sin(a)) + Math.abs(ph * Math.cos(a));
        return {
          w,
          h,
          bw,
          bh,
          x:
            num(o.left) -
            (o.originX === "center" ? bw / 2 : o.originX === "right" ? bw : 0),
          y:
            num(o.top) -
            (o.originY === "center" ? bh / 2 : o.originY === "bottom" ? bh : 0),
        };
      });
      const unknownDimensions =
        boxes.some((b) => b.w <= 0 || b.h <= 0) ||
        (boxes.length > 1 && boxes.some((b) => !b.bw || !b.bh));
      let width = boxes[0].w,
        height = boxes[0].h;
      if (boxes.length > 1 && !unknownDimensions) {
        const ratioX = median(boxes.map((b) => b.w / b.bw)),
          ratioY = median(boxes.map((b) => b.h / b.bh));
        width =
          (Math.max(...boxes.map((b) => b.x + b.bw)) -
            Math.min(...boxes.map((b) => b.x))) *
          ratioX;
        height =
          (Math.max(...boxes.map((b) => b.y + b.bh)) -
            Math.min(...boxes.map((b) => b.y))) *
          ratioY;
      }
      let factory = str(item.assigned_manufacturer_id) || defaultFactory;
      if (
        !prices.some(
          (p) =>
            p.factory_id === factory &&
            p.print_method_id === methodId &&
            p.is_active !== false,
        )
      ) {
        factory = defaultFactory;
        notes.push(`${side}: 배정 공장 단가 미기록 → 기본 공장 단가 준용`);
      }
      const candidates: (RecordRow & {
        max_width_cm: number | null;
        max_height_cm: number | null;
        is_active: boolean;
      })[] = prices
        .filter(
          (p) =>
            p.factory_id === factory &&
            p.print_method_id === methodId &&
            p.is_active !== false,
        )
        .map((p) => ({
          ...p,
          max_width_cm: num(p.max_width_cm) || null,
          max_height_cm: num(p.max_height_cm) || null,
          is_active: true,
        }));
      const quantity = num(item.quantity);
      if (quantity <= 0) {
        missing.push("수량 미확인");
        continue;
      }
      if (unknownDimensions) {
        const unit =
          method === "dtf"
            ? median(
                candidates
                  .filter((p) => p.pricing_model === "flat")
                  .map((p) => num(p.unit_price)),
              )
            : 0;
        if (!unit) {
          missing.push(`${side}: 인쇄 치수·대체 단가 미확인`);
          continue;
        }
        total += Math.round(unit * quantity);
        notes.push(
          `${side}: 인쇄 치수 미기록 → DTF 단가표 중앙값 ${unit.toLocaleString("ko-KR")}원 × ${quantity}벌 추정 (실제 크기 확인 필요)`,
        );
        continue;
      }
      const price = findMatchingPricingByDimensions(
        candidates,
        width / 10,
        height / 10,
      );
      if (!price) {
        missing.push(
          `${side}: ${method} ${Math.round(width / 10)}×${Math.round(height / 10)}cm 단가 미확인`,
        );
        continue;
      }
      const amount =
        price.pricing_model === "flat"
          ? num(price.unit_price) * quantity
          : price.pricing_model === "bulk"
            ? num(price.base_price) +
              Math.max(0, quantity - num(price.base_quantity)) *
                num(price.additional_price_per_piece)
            : 0;
      if (amount <= 0) {
        missing.push(`${side}: 단가 미확인`);
        continue;
      }
      total += Math.round(amount);
      notes.push(
        `${side} ${method} ${Math.round(width / 10)}×${Math.round(height / 10)}cm · ${quantity}벌 · 공급가 ${Math.round(amount).toLocaleString("ko-KR")}원 (현재 단가표 추정${item.assigned_manufacturer_id ? "" : "·기본 공장"})`,
      );
    }
  }
  if (!sides) missing.push("시안 미확인");
  return {
    net: total,
    notes,
    missing,
    blank: sides > 0 && objects === 0 && missing.length === 0,
  };
}

export function buildFinanceOverview(data: FinanceData): FinanceOverview {
  const get = (key: string) => data[key] || [];
  const items = by(get("items"), "order_id"),
    costs = by(get("costs"), "order_item_id"),
    prints = by(get("prints"), "order_item_id");
  const factories = by(get("factories"), "order_item_id"),
    adjustments = by(get("adjustments"), "order_item_id"),
    shipping = by(get("shipping"), "order_id");
  const allocations = by(get("allocations"), "case_key"),
    legacyAdjust = by(get("legacyAdjustments"), "case_key");
  const evidenceAdjust = by(get("evidenceAdjustments"), "order_id");
  const defaultFactory = str(
    get("manufacturers").find((r) => r.name === "전사찍는사람들")?.id,
  );
  const shippingMedian = median(
    get("shipping")
      .filter((r) => r.leg_type === "to_customer" && num(r.amount) <= 50000)
      .map((r) => num(r.amount)),
  );
  const invoiceByItem = by(
    get("links").filter(
      (r) =>
        r.link_type === "invoice_order" &&
        r.status === "confirmed" &&
        r.order_item_id,
    ),
    "order_item_id",
  );
  const entries: FinanceEntry[] = [];
  const liveOrders = new Set(
    get("orders")
      .filter(
        (r) =>
          r.payment_status === "completed" && r.order_status !== "cancelled",
      )
      .map((r) => str(r.id)),
  );
  for (const order of get("orders")) {
    if (
      order.payment_status !== "completed" ||
      order.order_status === "cancelled"
    )
      continue;
    const id = str(order.id),
      orderItems = items.get(id) || [];
    const entry: FinanceEntry = {
      id,
      title:
        orderItems
          .map((i) => str(i.product_title))
          .filter(Boolean)
          .join(" · ") || id,
      source: "order",
      date: dayKst(order.paid_at || order.created_at),
      quantity: sum(orderItems, "quantity"),
      revenue: num(order.total_amount),
      recordedRevenue: num(order.total_amount),
      recordedCost: 0,
      costSupplement: 0,
      vatSupplement: 0,
      estimatedRevenue: 0,
      estimatedCost: 0,
      cost: 0,
      missing: [],
      basis: [],
      duplicate: false,
      link: `/orders/${encodeURIComponent(id)}`,
    };
    if (!order.paid_at) entry.basis.push("결제일 미기록: 주문 생성일 사용");
    if (!orderItems.length) entry.missing.push("주문 품목 없음");
    let vatable = 0;
    for (const item of orderItems) {
      const key = str(item.id),
        apparelRows = costs.get(key) || [],
        printRows = prints.get(key) || [];
      const apparel = sum(apparelRows, "total_cost"),
        print = sum(printRows, "total_cost"),
        factory = sum(factories.get(key) || [], "factory_amount");
      const adjust = sum(adjustments.get(key) || [], "amount");
      entry.recordedCost +=
        apparel + print + adjust + (printRows.length ? 0 : factory);
      vatable += apparel + print + (printRows.length ? 0 : factory);
      if (apparel <= 0)
        entry.missing.push(`${str(item.product_title)}: 의류 원가 미확인`);
      if (apparelRows.some((r) => /추정|준용/.test(str(r.override_reason)))) {
        entry.estimatedCost += apparel;
        entry.basis.push("의류 원가: 기존 백필 추정 포함");
      }
      if (printRows.length && factory > 0)
        entry.basis.push(
          `인쇄 원장 우선: 겹친 공장비 ${factory.toLocaleString("ko-KR")}원 제외 (별도 공임 여부 검토)`,
        );
      if (print > 0 || (!printRows.length && factory > 0)) continue;
      if (adjust !== 0) {
        entry.missing.push(
          `${str(item.product_title)}: 수기 가감액과 인쇄비 중복 여부 미확인`,
        );
        continue;
      }
      const invoice = invoiceByItem.get(key) || [];
      // A confirmed link is usable only when this item has no registered work cost.
      const invoiceNet = sum(invoice, "amount_net");
      if (invoiceNet > 0) {
        entry.costSupplement += invoiceNet;
        vatable += invoiceNet;
        entry.basis.push(
          `연결 청구 공급가 ${invoiceNet.toLocaleString("ko-KR")}원 반영 (미기록 작업비)`,
        );
      } else {
        const estimate = estimatePrint(
          item,
          get("prices"),
          get("methods"),
          defaultFactory,
        );
        entry.costSupplement += estimate.net;
        entry.estimatedCost += estimate.net;
        vatable += estimate.net;
        entry.basis.push(...estimate.notes);
        entry.missing.push(
          ...estimate.missing.map((m) => `${str(item.product_title)}: ${m}`),
        );
        if (estimate.blank)
          entry.basis.push(
            `${str(item.product_title)}: 저장 시안에 인쇄 객체 없음 (무인쇄 가정)`,
          );
      }
    }
    const legs = shipping.get(id) || [];
    entry.recordedCost += sum(legs, "amount");
    if (
      !legs.length &&
      order.shipping_method === "domestic" &&
      shippingMedian > 0
    ) {
      const boxes = Math.max(1, num(order.shipping_box_qty));
      const amount = Math.round(shippingMedian * boxes);
      entry.costSupplement += amount;
      entry.estimatedCost += amount;
      entry.basis.push(
        `배송 실비 미기록: 기존 건당 중앙값 ${shippingMedian.toLocaleString("ko-KR")}원 × ${boxes}상자 추정`,
      );
    } else if (!legs.length && order.shipping_method !== "pickup")
      entry.missing.push("배송 실비 미확인");
    // This report is a gross-amount management comparison; it is not a VAT return.
    entry.vatSupplement = Math.round(vatable * 0.1);
    entry.estimatedCost += entry.vatSupplement;
    entry.basis.push(
      "의류·인쇄·공장 공급가에 VAT 10%를 가정해 고객 결제금액과 비교; 기타 가감·배송은 등록액 사용",
    );
    for (const adjustment of evidenceAdjust.get(id) || []) {
      const sourceLinks = get("links").filter(
        (l) =>
          l.source_line_id === adjustment.source_line_id &&
          l.order_id === id &&
          l.status === "confirmed",
      );
      if (sourceLinks.length) {
        entry.costSupplement += num(adjustment.amount_gross);
        if (adjustment.is_estimate)
          entry.estimatedCost += num(adjustment.amount_gross);
        entry.basis.push(
          `증빙 차감 ${num(adjustment.amount_gross).toLocaleString("ko-KR")}원: ${str(adjustment.reason)}`,
        );
      } else entry.missing.push("차감 증빙의 주문 연결 미확인");
    }
    if (entry.revenue === 0)
      entry.basis.push("매출 0원: 무상·재제작 여부 확인 필요, 비용은 포함");
    entry.cost = Math.round(
      entry.recordedCost + entry.costSupplement + entry.vatSupplement,
    );
    entry.basis = [...new Set(entry.basis)];
    entry.missing = [...new Set(entry.missing)];
    entries.push(entry);
  }
  const erpUsedByLive = new Set(
    get("links")
      .filter(
        (r) =>
          r.link_type === "erp_order" &&
          r.status === "confirmed" &&
          liveOrders.has(str(r.order_id)),
      )
      .map((r) => str(r.source_erp_key)),
  );
  const erpProjectKeys = new Map(
    get("erp")
      .filter((r) => r.source_table === "projects")
      .map((r) => [num(obj(r.data).id), str(r.record_key)]),
  );
  const erpProjectOwners = new Map<number, string>();
  for (const c of get("cases").filter((c) => c.status !== "candidate")) {
    const e = obj(c.evidence);
    for (const p of [obj(e.erp_project), ...arr(e.erp_projects)])
      if (num(p.id)) erpProjectOwners.set(num(p.id), str(c.case_key));
  }
  for (const c of get("cases")) {
    const id = str(c.case_key),
      e = obj(c.evidence),
      cash = allocations.get(id) || [],
      delta = legacyAdjust.get(id) || [];
    const erpOnly =
      e.financial_basis === "erp_paid_entries_not_bank_reconciled";
    const projectIds = [
      ...new Set(
        [obj(e.erp_project), ...arr(e.erp_projects)]
          .map((p) => num(p.id))
          .filter(Boolean),
      ),
    ];
    const projectRecords = get("erp")
      .filter(
        (r) =>
          r.source_table === "financial_entries" &&
          projectIds.includes(num(obj(r.data).project_id)) &&
          obj(r.data).status === "paid",
      )
      .map((r) => obj(r.data));
    const erpRows = projectRecords.length
      ? projectRecords
      : arr(e.erp_entries).filter((r) => r.status === "paid");
    const erpRevenue =
      sum(
        erpRows
          .filter((r) => r.kind === "revenue")
          .map((r) => ({ amount: r.actual_amount ?? r.amount })),
        "amount",
      ) || num(e.erp_paid_revenue_gross);
    const erpCost =
      sum(
        erpRows
          .filter((r) => r.kind === "expense")
          .map((r) => ({ amount: r.actual_amount ?? r.amount })),
        "amount",
      ) || num(e.erp_paid_cost_gross);
    const receipt = sum(
      cash.filter((r) => r.direction === "receipt"),
      "amount_gross",
    );
    const expense =
      sum(
        cash.filter((r) => r.direction !== "receipt"),
        "amount_gross",
      ) + sum(delta, "amount_gross");
    const duplicate =
      Boolean(
        c.existing_order_id && liveOrders.has(str(c.existing_order_id)),
      ) ||
      projectIds.some(
        (pid) =>
          erpUsedByLive.has(erpProjectKeys.get(pid) || "") ||
          get("links").some(
            (l) =>
              l.link_type === "erp_order" &&
              l.status === "confirmed" &&
              liveOrders.has(str(l.order_id)) &&
              num(obj(l.evidence).erp_project_id) === pid,
          ),
      ) ||
      (erpOnly &&
        projectIds.some(
          (pid) =>
            erpProjectOwners.has(pid) && erpProjectOwners.get(pid) !== id,
        ));
    const revenue = Math.max(receipt, erpRevenue) || null;
    const entry: FinanceEntry = {
      id,
      title: str(c.title),
      source: erpOnly ? "erp" : "legacy",
      date: dayKst(c.period_start),
      quantity: num(c.quantity),
      revenue,
      recordedRevenue: receipt,
      recordedCost: expense,
      costSupplement: Math.max(0, erpCost - expense),
      vatSupplement: 0,
      estimatedRevenue: Math.max(0, erpRevenue - receipt),
      estimatedCost:
        Math.max(0, erpCost - expense) +
        sum(
          [...cash, ...delta].filter(
            (r) => r.is_estimate && r.direction !== "receipt",
          ),
          "amount_gross",
        ),
      cost: Math.max(expense, erpCost),
      missing: [],
      basis: [str(c.notes), "과거 거래: 작업 시작일 귀속·VAT 포함 여부 미확인"],
      duplicate,
      link: `/finance/reconciliation#${encodeURIComponent(id)}`,
    };
    if (erpRevenue > receipt)
      entry.basis.push(
        "연결 ERP paid 매출로 입금 미연결분 보완; 은행 매출과 합산하지 않음",
      );
    if (erpCost > expense)
      entry.basis.push(
        "ERP paid 비용과 연결 지출 중 큰 금액 사용; 서로 합산하지 않음",
      );
    if (!revenue) entry.missing.push("고객 매출 미확인");
    if (!entry.cost) entry.missing.push("제작 비용 미확인");
    if (receipt && erpRevenue <= receipt && /일부|부분/.test(str(c.notes)))
      entry.missing.push("고객 입금 일부 연결: 전체 매출 미확인");
    if (duplicate)
      entry.basis.push("기존 거래 연결 또는 ERP 중복으로 통합 합계 제외");
    for (const recovery of arr(e.supplier_cost_recoveries).filter(
      (r) => r.status === "confirmed",
    )) {
      entry.costSupplement -= num(recovery.amount);
      entry.cost -= num(recovery.amount);
      entry.basis.push(
        `공급처 환급 ${num(recovery.amount).toLocaleString("ko-KR")}원: 비용 회수`,
      );
    }
    entries.push(entry);
  }
  const bankMonths = new Map<string, BankMonth>();
  const allocatedKeys = new Set([
    ...get("allocations").map((r) => str(r.transaction_key)),
    ...get("links")
      .filter((r) => r.status === "confirmed")
      .map((r) => str(r.bank_transaction_key)),
  ]);
  for (const tx of get("bank")) {
    const month = dayKst(tx.transacted_at).slice(0, 7);
    if (!month) continue;
    const m = bankMonths.get(month) || {
      month,
      deposit: 0,
      withdrawal: 0,
      count: 0,
      allocated: 0,
    };
    m.deposit += num(tx.deposit);
    m.withdrawal += num(tx.withdrawal);
    m.count++;
    if (allocatedKeys.has(str(tx.transaction_key))) m.allocated++;
    bankMonths.set(month, m);
  }
  const dates = get("bank")
    .map((r) => dayKst(r.transacted_at))
    .filter(Boolean)
    .sort();
  return {
    generatedAt: new Date().toISOString(),
    entries: entries.sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    ),
    bankMonths: [...bankMonths.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
    bankRange: { from: dates[0] || "", to: dates.at(-1) || "" },
    shippingMedian,
  };
}

export function summarizeEntries(
  entries: FinanceEntry[],
  includeEstimates = true,
) {
  const included = entries.filter((e) => !e.duplicate);
  const revenue = included.reduce(
    (s, e) => s + (includeEstimates ? e.revenue || 0 : e.recordedRevenue),
    0,
  );
  const cost = included.reduce(
    (s, e) => s + (includeEstimates ? e.cost : e.recordedCost),
    0,
  );
  const unknown = included.filter(
    (e) =>
      (includeEstimates
        ? e.revenue === null
        : e.source !== "order" && e.recordedRevenue === 0) ||
      e.missing.some((m) => m.includes("전체 매출")),
  );
  const unknownRevenue = unknown.length;
  const unknownIds = new Set(unknown.map((e) => `${e.source}:${e.id}`));
  const comparable = included.filter(
    (e) => !unknownIds.has(`${e.source}:${e.id}`),
  );
  const comparableRevenue = comparable.reduce(
    (s, e) => s + (includeEstimates ? e.revenue || 0 : e.recordedRevenue),
    0,
  );
  const comparableCost = comparable.reduce(
    (s, e) => s + (includeEstimates ? e.cost : e.recordedCost),
    0,
  );
  return {
    count: included.length,
    revenue,
    cost,
    profit: revenue - cost,
    margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
    unknownRevenue,
    comparableCount: comparable.length,
    comparableRevenue,
    comparableCost,
    comparableProfit: comparableRevenue - comparableCost,
    comparableMargin:
      comparableRevenue > 0
        ? ((comparableRevenue - comparableCost) / comparableRevenue) * 100
        : null,
    unknownRevenueCost: unknown.reduce(
      (s, e) => s + (includeEstimates ? e.cost : e.recordedCost),
      0,
    ),
    incomplete: included.filter((e) => e.missing.length).length,
    estimated: included.filter(
      (e) => e.estimatedCost !== 0 || e.estimatedRevenue !== 0,
    ).length,
    supplement: included.reduce(
      (s, e) => s + e.costSupplement + e.vatSupplement,
      0,
    ),
  };
}
