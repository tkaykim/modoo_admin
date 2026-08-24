export type JsonRecord = Record<string, unknown>;

export type NaverProductOrderRow = {
  product_order_id: string;
  naver_order_id: string;
  product_order_status: string | null;
  claim_status: string | null;
  last_changed_type: string | null;
  last_changed_at: string | null;
  order_date: string | null;
  payment_date: string | null;
  origin_product_no: number | null;
  channel_product_no: number | null;
  product_name: string | null;
  option_name: string | null;
  option_manage_code: string | null;
  local_product_id: string | null;
  quantity: number;
  unit_price: number;
  total_payment_amount: number;
  buyer_name: string | null;
  buyer_tel: string | null;
  receiver_name: string | null;
  receiver_tel1: string | null;
  receiver_tel2: string | null;
  receiver_zip_code: string | null;
  receiver_base_address: string | null;
  receiver_detail_address: string | null;
  shipping_memo: string | null;
  delivery_method: string | null;
  delivery_company_code: string | null;
  tracking_number: string | null;
  dispatched_at: string | null;
  raw_data: JsonRecord;
  synced_at: string;
  updated_at: string;
};

export type NaverSyncResult = {
  fetched: number;
  upserted: number;
  detail?: Record<string, unknown>;
};

export type NaverPrintTier = {
  code: string;
  name: string;
  optionPrice: number;
};

export type NaverSupplementProduct = {
  code: string;
  name: string;
  price: number;
};

export type NaverSupplementGroup = {
  groupName: string;
  products: NaverSupplementProduct[];
};

export type NaverProductOptionConfig = {
  colorCodes?: string[];
  sizeCodes?: string[];
  printTiers: NaverPrintTier[];
  combinationStockQuantity?: number;
  supplementStockQuantity?: number;
  supplementGroups?: NaverSupplementGroup[];
  maxCombinations?: number;
};

export type NaverProductCreateInput = {
  localProductId: string;
  templateOriginProductNo: number;
  suspended?: boolean;
  name?: string;
  salePrice?: number;
  stockQuantity?: number;
  imageUrls?: string[];
  thumbnailImageUrls?: string[];
  detailImageUrls?: string[];
  detailHtml?: string;
  optionConfig?: NaverProductOptionConfig;
};

export type NaverProductUpdateInput = {
  originProductNo: number;
  suspended?: boolean;
  name?: string;
  salePrice?: number;
  stockQuantity?: number;
  imageUrls?: string[];
  detailHtml?: string;
  optionInfo?: JsonRecord;
  supplementProductInfo?: JsonRecord;
  syncAfter?: boolean;
};

export type NaverProductReconfigureInput = {
  localProductId: string;
  originProductNo: number;
  name: string;
  salePrice: number;
  optionConfig: NaverProductOptionConfig;
  suspended?: boolean;
};

export type NaverDispatchInput = {
  productOrderIds: string[];
  trackingNumber: string;
  dispatchDate?: string;
};
