// 상품별 조건부 할인 룰 평가 유틸.
// modoo_app/lib/discountRules.ts 와 동일하게 유지할 것.

export type DiscountRuleType = 'quantity_threshold';
export type DiscountValueType = 'fixed' | 'percentage';

export interface DiscountRule {
  id: string;
  product_id: string;
  name: string;
  rule_type: DiscountRuleType;
  min_quantity: number;
  discount_type: DiscountValueType;
  discount_value: number;
  active: boolean;
  priority: number;
}

export interface OrderItemForRule {
  id: string;
  product_id: string | null;
  quantity: number;
  price_per_item: number;
}

export interface AppliedRule {
  rule_id: string;
  product_id: string;
  item_id: string;
  name: string;
  applied_amount: number;
  snapshot: DiscountRule;
}

export function evaluateDiscountRules(
  items: OrderItemForRule[],
  rules: DiscountRule[]
): { totalDiscount: number; applied: AppliedRule[] } {
  const applied: AppliedRule[] = [];
  let totalDiscount = 0;

  for (const item of items) {
    if (!item.product_id || item.quantity <= 0) continue;

    const candidates = rules
      .filter(r => r.active && r.product_id === item.product_id && item.quantity >= r.min_quantity)
      .sort((a, b) => b.priority - a.priority || b.min_quantity - a.min_quantity);

    if (candidates.length === 0) continue;

    const rule = candidates[0];
    const itemSubtotal = item.quantity * item.price_per_item;
    const amount = rule.discount_type === 'fixed'
      ? Math.min(rule.discount_value, itemSubtotal)
      : Math.floor(itemSubtotal * (rule.discount_value / 100));

    if (amount <= 0) continue;

    totalDiscount += amount;
    applied.push({
      rule_id: rule.id,
      product_id: rule.product_id,
      item_id: item.id,
      name: rule.name,
      applied_amount: amount,
      snapshot: rule,
    });
  }

  return { totalDiscount, applied };
}
