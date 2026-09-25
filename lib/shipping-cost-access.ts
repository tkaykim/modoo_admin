import { isSuperAdmin } from './auth-helpers';

/** Carrier responses can contain contract freight. Customer order delivery fees
 * are revenue, so use this only on carrier/standalone-shipment payloads. */
export function redactShippingCosts<T>(value: T, role: unknown): T {
  if (isSuperAdmin(role)) return value;
  const strip = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(strip);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.entries(input as Record<string, unknown>)
      .filter(([key]) => /^(fare_ty|fareTy)$/.test(key) || !/fare|delivery_?fee|cost|charge|운임/i.test(key))
      .map(([key, entry]) => [key, strip(entry)]));
  };
  return strip(value) as T;
}
