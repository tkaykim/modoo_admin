import { determinePrintSize, type PrintSizeBucket } from './calibrationMath';

// Copied from modoo_admin/lib/printPricingConfig.ts DEFAULT_PRINT_PRICING.dtf.sizes
// (R5: avoid importing because that file's getPrintPricingConfig has cached mutable state)
const DTF_PRICES: Record<PrintSizeBucket, number> = {
  '10x10': 4000,
  A4: 5000,
  A3: 7000,
};

export function dtfPrice(widthMm: number, heightMm: number): { bucket: PrintSizeBucket; price: number } {
  const bucket = determinePrintSize(widthMm, heightMm);
  return { bucket, price: DTF_PRICES[bucket] };
}
