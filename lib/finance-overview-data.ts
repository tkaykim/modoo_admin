import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceData, RecordRow } from "./finance-overview";

// All reads use the caller's authenticated client and existing RLS. Never truncate silently.
export async function loadFinanceData(
  db: SupabaseClient,
): Promise<FinanceData> {
  const specs: [string, string, string, string][] = [
    [
      "orders",
      "orders",
      "id,created_at,paid_at,payment_status,order_status,total_amount,shipping_method,shipping_box_qty",
      "id",
    ],
    [
      "items",
      "order_items",
      "id,order_id,product_title,quantity,assigned_manufacturer_id,canvas_state",
      "id",
    ],
    [
      "costs",
      "order_item_costs",
      "id,order_item_id,total_cost,override_reason",
      "id",
    ],
    ["prints", "order_item_print_costs", "id,order_item_id,total_cost", "id"],
    [
      "factories",
      "order_item_factory_settlements",
      "order_item_id,factory_amount",
      "order_item_id",
    ],
    [
      "adjustments",
      "order_item_cost_adjustments",
      "id,order_item_id,amount,reason",
      "id",
    ],
    ["shipping", "order_shipping_legs", "id,order_id,amount,leg_type", "id"],
    [
      "cases",
      "legacy_order_cases",
      "case_key,title,period_start,quantity,status,existing_order_id,evidence,notes",
      "case_key",
    ],
    [
      "allocations",
      "legacy_order_cash_allocations",
      "allocation_key,case_key,transaction_key,direction,amount_gross,is_estimate",
      "allocation_key",
    ],
    [
      "legacyAdjustments",
      "legacy_order_cost_adjustments",
      "adjustment_key,case_key,amount_gross,is_estimate",
      "adjustment_key",
    ],
    [
      "evidenceAdjustments",
      "cost_evidence_adjustments",
      "adjustment_key,order_id,source_line_id,amount_gross,is_estimate,reason",
      "adjustment_key",
    ],
    [
      "links",
      "cost_evidence_links",
      "link_key,link_type,order_id,order_item_id,source_erp_key,source_line_id,bank_transaction_key,status,amount_net,evidence",
      "link_key",
    ],
    [
      "erp",
      "cost_erp_source_records",
      "record_key,source_table,data",
      "record_key",
    ],
    [
      "bank",
      "cost_bank_transactions",
      "transaction_key,transacted_at,deposit,withdrawal",
      "transaction_key",
    ],
    [
      "prices",
      "factory_print_method_pricing",
      "id,factory_id,print_method_id,size,pricing_model,unit_price,base_price,base_quantity,additional_price_per_piece,is_active,max_width_cm,max_height_cm",
      "id",
    ],
    ["methods", "print_methods", "id,key", "id"],
    ["manufacturers", "manufacturers", "id,name", "id"],
  ];
  const results = await Promise.all(
    specs.map(async ([key, table, columns, order]) => {
      const rows: RecordRow[] = [];
      const size = table === "order_items" ? 100 : 500;
      for (let offset = 0; ; offset += size) {
        const { data, error, count } = await db
          .from(table)
          .select(columns, { count: "exact" })
          .order(order)
          .range(offset, offset + size - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        const page = (data || []) as unknown as RecordRow[];
        rows.push(...page);
        if (count !== null && rows.length >= count) break;
        if (!page.length) {
          if (count && rows.length < count)
            throw new Error(`${table}: incomplete read`);
          break;
        }
        if (page.length < size && count !== null && rows.length < count)
          throw new Error(`${table}: page limit mismatch`);
        if (offset > 100000)
          throw new Error(`${table}: reporting range too large`);
      }
      return [key, rows] as const;
    }),
  );
  return Object.fromEntries(results);
}
