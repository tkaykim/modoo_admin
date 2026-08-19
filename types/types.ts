export interface Product {
  id: string;
  title: string;
  base_price: number;
  configuration: ProductSide[];
  size_options: SizeOption[] | null;
  category: string | null;
  thumbnail_image_link?: string[] | null;
  description_image?: string[] | null;
  sizing_chart_image?: string | null;
  sizing_data?: SizingData | null;
  product_code?: string | null;
  discount_rates?: Array<{ min_quantity: number; discount_rate: number }> | null;
  manufacturer_id?: string | null;
  manufacturers?: { id: string; name: string } | null;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
  keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface SizingData {
  unit: string;
  headers: string[];
  rows: Record<string, (number | string)[]>;
  order?: string[];
}

export interface Manufacturer {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface ManufacturerColor {
  id: string;
  manufacturer_id: string;
  name: string;
  hex: string;
  color_code: string;
  label: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductColor {
  id: string;
  product_id: string;
  manufacturer_color_id: string;
  is_active: boolean | null;
  sort_order: number | null;
  side_mockups?: Record<string, string> | null;
  created_at: string | null;
  updated_at: string | null;
  manufacturer_colors?: ManufacturerColor;
}

export interface ProductConfig {
  id?: string;
  title?: string;
  base_price?: number;
  sides: ProductSide[];
}

/** @deprecated Use partner_mall_presets table instead */
export type LogoAnchor = 'left-chest' | 'right-chest' | 'center';

/** @deprecated Use partner_mall_presets table instead */
export interface DefaultLogoPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: LogoAnchor;
}

export interface ProductSide {
  id: string;
  name: string;
  imageUrl: string;
  printArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  layers?: ProductLayer[];
  realLifeDimensions?: {
    productWidthMm: number;
    /** 인쇄영역의 실제 가로(mm). 환산 1순위 — printArea.width(px)와 함께 native mm/px 산출. */
    printAreaWidthMm?: number;
    /** 인쇄영역의 실제 세로(mm). */
    printAreaHeightMm?: number;
  };
  /** @deprecated Use partner_mall_presets table instead */
  defaultLogoPlacement?: DefaultLogoPlacement;
}

export interface ProductLayer {
  id: string;
  name: string;
  imageUrl: string;
  colorOptions: Array<{
    hex: string;
    colorCode: string;
  }>;
  zIndex: number;
}

// Print method types - includes transfer methods and bulk methods
export type PrintMethod =
  | 'dtf'
  | 'dtg'
  | 'screen_printing'
  | 'embroidery'
  | 'applique'
  | 'pu'
  | 'dtp'
  | 'sublimation';

export type FactoryPricingModel = 'flat' | 'bulk';

/**
 * Customer-facing print pricing — mirrors FactoryPrintMethodPricing structure
 * but global (no factory_id). Used by future modoo_app editor to price
 * customer-visible print costs at order time.
 */
export interface CustomerPrintMethodPricing {
  id: string;
  print_method_id: string;
  size: string;
  max_width_cm: number | null;
  max_height_cm: number | null;
  pricing_model: FactoryPricingModel;
  unit_price: number | null;
  base_price: number | null;
  base_quantity: number | null;
  additional_price_per_piece: number | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  print_methods?: {
    id: string;
    key: string;
    name: string;
  } | null;
}

export type FactoryCostSource = 'auto_match' | 'manual' | 'negotiated' | 'override';

/**
 * One artwork (printed design) applied to an order_item.
 * An order_item can have N artworks (e.g. front DTF + back embroidery).
 * customer_* fields freeze the customer-visible price at order time;
 * factory_* fields hold the cost paid to the assigned factory.
 * Margin per artwork = customer_total - factory_total.
 * order_items.factory_amount is auto-synced to SUM(factory_total) via DB trigger.
 */
export interface OrderItemArtwork {
  id: string;
  order_item_id: string;
  print_method_id: string | null;
  placement: string | null;
  size_label: string | null;
  width_cm: number | null;
  height_cm: number | null;
  applied_quantity: number | null;
  customer_unit_price: number | null;
  customer_total: number | null;
  customer_pricing_snapshot: Record<string, unknown> | null;
  factory_pricing_row_id: string | null;
  factory_unit_price: number | null;
  factory_total: number | null;
  factory_cost_source: FactoryCostSource | null;
  /** 추가금액 (예: 단면 28cm 이상 가산금). 합계 = 단가×수량 + additional_amount */
  additional_amount: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  print_methods?: {
    id: string;
    key: string;
    name: string;
  } | null;
}

export interface FactoryPrintMethodPricing {
  id: string;
  factory_id: string;
  print_method_id: string;
  /** Free-form label like '25x25', 'A4', '10x10' — display + identity within (factory, method) */
  size: string;
  /** Max printable width in cm — used for artwork→size auto-matching */
  max_width_cm: number | null;
  /** Max printable height in cm — used for artwork→size auto-matching */
  max_height_cm: number | null;
  pricing_model: FactoryPricingModel;
  unit_price: number | null;
  base_price: number | null;
  base_quantity: number | null;
  additional_price_per_piece: number | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  print_methods?: {
    id: string;
    key: string;
    name: string;
  } | null;
}

export interface PrintMethodRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  pricing: Record<string, number | { basePrice: number; baseQuantity: number; additionalPricePerPiece: number }> | null;
  created_at: string;
  updated_at: string;
}

export interface ProductPrintMethod {
  id: string;
  product_id: string;
  print_method_id: string;
  created_at: string;
  print_methods?: PrintMethodRecord;
}

// Size categories for printing
export type PrintSize = '10x10' | 'A4' | 'A3';

// Pricing configuration for transfer methods (DTF, DTG)
export interface TransferPricing {
  method: 'dtf' | 'dtg';
  sizes: {
    '10x10': number;
    A4: number;
    A3: number;
  };
}

// Pricing configuration for bulk methods (screen printing, embroidery, applique)
export interface BulkPricing {
  method: 'screen_printing' | 'embroidery' | 'applique';
  sizes: {
    '10x10': {
      basePrice: number;
      baseQuantity: number;
      additionalPricePerPiece: number;
    };
    A4: {
      basePrice: number;
      baseQuantity: number;
      additionalPricePerPiece: number;
    };
    A3: {
      basePrice: number;
      baseQuantity: number;
      additionalPricePerPiece: number;
    };
  };
}

// Full print pricing configuration
export interface PrintPricingConfig {
  dtf: TransferPricing;
  dtg: TransferPricing;
  screen_printing: BulkPricing;
  embroidery: BulkPricing;
  applique: BulkPricing;
}

export interface CustomFont {
  fontFamily: string;
  displayName?: string;
  fontSubfamily?: string;
  postscriptName?: string;
  fingerprint?: string;
  intrinsicWeight?: number;
  intrinsicStyle?: 'normal' | 'italic';
  fileName: string;
  url: string;
  path?: string;
  uploadedAt?: string;
  format?: string;
}

// Size option with display label and internal code
export interface SizeOption {
  label: string;      // Display name (e.g., "S", "M", "L")
  size_code: string;  // Internal code for admin/factory (e.g., "001", "ABC")
}

export interface Order {
  id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;

  // 받는 분 — 송장·배송 안내 전용 채널.
  // 금액·계좌·영수증은 절대 이쪽으로 보내지 않는다(리셀러 주문에서 원가 노출됨).
  recipient_name?: string | null;
  recipient_phone?: string | null;
  recipient_same_as_orderer?: boolean;

  order_category?: 'cobuy' | 'regular' | 'salesman_direct' | 'quick' | 'surcharge' | null;
  cobuy_session_id?: string | null;
  // 간이주문(문의 연결) / 차액주문(원주문 연결)
  inquiry_id?: string | null;
  parent_order_id?: string | null;

  shipping_method: 'domestic' | 'international' | 'pickup';
  country_code: string | null;
  state: string | null;
  city: string | null;
  postal_code: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  delivery_fee: number;

  payment_method: 'toss' | 'paypal' | 'card' | 'admin' | 'bank_transfer' | 'free';
  payment_key: string | null;
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded';

  order_status: 'payment_pending' | 'payment_completed' | 'in_production' | 'shipping' | 'delivered' | 'cancelled' | 'partially_cancelled';
  total_amount: number;

  // Pricing adjustment fields (admin custom orders)
  original_amount: number | null;
  custom_unit_price: number | null;
  admin_discount: number;
  admin_surcharge: number;
  coupon_discount: number;
  applied_coupon_id: string | null;
  pricing_note: string | null;

  // Customer payment link token (for customer online payment)
  payment_link_token: string | null;

  // Per-field toggles for customer self-input on payment page
  customer_editable_fields?: {
    quantities?: boolean;
    customerInfo?: boolean;
    shipping?: boolean;
  } | null;

  // @deprecated — factory fields moved to OrderItem for per-item assignment
  assigned_manufacturer_id?: string | null;
  factory_status?: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'shipped' | 'cancelled' | null;
  deadline?: string | null;
  factory_amount?: number | null;
  factory_payment_date?: string | null;
  factory_payment_status?: 'pending' | 'completed' | 'cancelled' | null;

  // Refund reason (set when order is refunded)
  refund_reason: string | null;

  // Customer note and attachments
  customer_note: string | null;
  attachment_urls: string[];

  // Shipping tracking
  tracking_number: string | null;
  tracking_carrier: string | null;

  // Logen integration
  logen_registered_at: string | null;
  logen_slip_printed: boolean;
  // 실제 발송 박스 수(기본 1) — 상품 수량과 별개. 접수 시 관리자가 입력.
  shipping_box_qty?: number | null;
  // 로젠 접수 세대 번호(기본 1). 접수 취소 시 +1되며 재접수는 "-R<seq>" 접미사 번호로 등록.
  logen_reg_seq?: number | null;
  // 다박스 접수 시 두 번째 이후 박스의 송장번호 목록(첫 송장은 tracking_number).
  extra_tracking_numbers?: string[] | null;

  // Shareable link token (generated on demand)
  share_token: string | null;

  // Joined order items (for list views)
  order_items?: OrderItem[];

  // 영업담당자 (실적 귀속)
  salesman_id?: string | null;
  /** Joined: salesman_profiles row */
  attributed_salesman?: AssigneeSalesman | null;

  // 파트너몰 경유 주문 (실적 자동 귀속의 근거)
  partner_mall_id?: string | null;
  /** Joined: partner_malls row */
  partner_mall?: { id: string; name: string | null; slug: string | null } | null;

  // 비로그인 게스트 주문(예: /mall/[slug] 원클릭)
  guest_email?: string | null;
  guest_phone?: string | null;
  guest_name?: string | null;

  created_at: string;
  updated_at: string;
}

export interface AssigneeSalesman {
  id: string;
  display_name: string | null;
  salesman_code: string | null;
  status?: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  design_id: string | null;
  product_title: string;
  /** Display name from saved design (nullable in DB) */
  design_title: string | null;
  /** factory-allocation 시 자동 생성된 Drive 작업사진 폴더 */
  work_drive_folder_id?: string | null;
  work_drive_folder_url?: string | null;
  quantity: number;
  price_per_item: number;

  canvas_state: Record<string, CanvasState>;
  /** Frozen snapshot of products.configuration at order time. Renderers prefer
   *  this over the live product.configuration so later mockup/printArea edits do
   *  not retro-change this order's rendering. Auto-filled by DB trigger on insert
   *  + one-time backfill (2026-06-04). Null/absent → fall back to live config. */
  configuration_snapshot?: ProductSide[] | null;
  color_selections: Record<string, any>;
  item_options: {
    size_id?: string;
    size_name?: string;
    color_id?: string;
    color_name?: string;
    color_hex?: string;
    color_code?: string;
    variants?: Array<{
      size_id?: string;
      size_name?: string;
      color_id?: string;
      color_name?: string;
      color_hex?: string;
      color_code?: string;
      quantity?: number;
    }>;
  };
  thumbnail_url: string | null;

  // Order file downloads (JSONB)
  image_urls?: Record<string, Array<{ url: string; path?: string; uploadedAt?: string }>> | string | null;
  text_svg_exports?: Record<string, unknown> | string | null;

  // Custom fonts used in the design
  custom_fonts?: CustomFont[] | string | null;

  // Retouch request flag
  retouch_requested?: boolean;

  // Design proof status
  design_status: 'pending' | 'in_progress' | 'design_shared' | 'revision_requested' | 'confirmed';
  design_shared_at: string | null;
  design_confirmed_at: string | null;
  design_revision_note: string | null;

  // Purchase order tracking
  purchase_order_status: 'pending' | 'ordered' | 'received' | 'cancelled';
  purchase_ordered_at: string | null;

  // Factory assignment (per-item)
  assigned_manufacturer_id: string | null;
  factory_status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'shipped' | 'cancelled' | null;
  factory_amount: number | null;
  deadline: string | null;
  factory_payment_date: string | null;
  factory_payment_status: 'pending' | 'completed' | 'cancelled' | null;

  // Joined from products table
  products?: { product_code: string | null } | null;

  // Joined manufacturer info
  manufacturers?: { id: string; name: string; email: string | null } | null;

  created_at: string;
  updated_at: string;
}

export interface CanvasState {
  version?: string;
  objects: CanvasObject[];
  background?: string;
  backgroundImage?: any;
  productColor?: string;
  layerColors?: Record<string, unknown>;
}

export interface CanvasObject {
  type: string;
  left: number;
  top: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;

  // Text specific
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontDisplayName?: string;
  fontWeight?: string;

  // Image specific
  src?: string;

  // Additional properties
  [key: string]: any;
}

export interface ExtractedColor {
  hex: string;
  name?: string;
  count?: number;
}

export interface ObjectDimensions {
  objectId?: string;
  sideId?: string;
  rawType?: string;
  objectType: string;
  widthMm: number;
  heightMm: number;
  fill?: string;
  text?: string;
  colors?: string[];
  preview?: string;
  fontFamily?: string;
  fontDisplayName?: string;
  fontFileStyle?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  stroke?: string;
  strokeWidth?: number;
  textAlign?: string;
  lineHeight?: number;
  // CurvedText specific
  curveIntensity?: number;
  // Print method
  printMethod?: PrintMethod;
  // Background removal request
  backgroundRemovalRequested?: boolean;
}

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  phone_number: string | null;
  role: 'customer' | 'admin' | 'factory' | 'super_admin' | 'marketing_manager';
  manufacturer_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Factory {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  address: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string | null;
  rating: number;
  title: string;
  content: string;
  author_name: string;
  is_verified_purchase: boolean | null;
  helpful_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionExample {
  id: string;
  product_id: string;
  title: string;
  description: string;
  image_url: string;
  sort_order: number;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Inquiry {
  id: string;
  user_id: string | null;
  title: string;
  content: string;
  status: 'pending' | 'ongoing' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface InquiryProduct {
  id: string;
  inquiry_id: string;
  product_id: string;
  created_at: string;
}

export interface InquiryReply {
  id: string;
  inquiry_id: string;
  admin_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export type CoBuyStatus = 'gathering' | 'gather_complete' | 'order_complete' | 'manufacturing' | 'manufacture_complete' | 'delivering' | 'delivery_complete' | 'cancelled';

// Pricing tier for quantity-based discounts
export interface CoBuyPricingTier {
  minQuantity: number;
  pricePerItem: number;
}

// Address information for CoBuy delivery settings (aligned with modoo_app)
export interface CoBuyAddressInfo {
  roadAddress: string;
  jibunAddress?: string;
  postalCode: string;
  addressDetail?: string;
}

// Delivery settings for cobuy sessions
// `enabled` doubles as "allowIndividualDelivery": when true, participants can
// choose individual delivery (+5,000원). When false (default), all participants
// receive goods via the organizer's bulk shipment to `deliveryAddress`.
export interface CoBuyDeliverySettings {
  enabled: boolean;
  deliveryFee: number;
  pickupLocation?: string;
  deliveryAddress?: CoBuyAddressInfo;
  pickupAddress?: CoBuyAddressInfo;
}

export interface CoBuyCustomField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'dropdown';
  label: string;
  required: boolean;
  fixed?: boolean;
  options?: string[];
}

export interface CoBuySession {
  id: string;
  user_id: string;
  saved_design_screenshot_id: string;
  title: string;
  description: string | null;
  status: CoBuyStatus;
  share_token: string;
  start_date: string;
  end_date: string;
  max_participants: number | null;
  current_participant_count: number;
  custom_fields: CoBuyCustomField[];
  cobuy_image_urls: string[] | null;
  payment_mode: 'individual' | 'survey';
  size_prices: Record<string, number> | null;
  delivery_settings: CoBuyDeliverySettings | null;
  bulk_order_id: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    email: string | null;
    phone_number?: string | null;
  } | null;
  cancellation_requested_at?: string | null;
  saved_design_screenshots?: {
    preview_url: string | null;
    price_per_item?: number | null;
  } | null;
}

export interface CoBuySelectedItem {
  size: string;
  quantity: number;
}

export type CoBuyDeliveryMethod = 'pickup' | 'delivery';

export type CoBuyPickupStatus = 'pending' | 'picked_up';

export interface CoBuyDeliveryInfo {
  recipientName: string;
  phone: string;
  postalCode: string;
  address: string;
  addressDetail: string;
  memo?: string;
}

export interface CoBuyParticipant {
  id: string;
  cobuy_session_id: string;
  name: string;
  email: string;
  phone: string | null;
  field_responses: Record<string, string>;
  selected_size: string;
  selected_size_code: string | null;
  selected_items: CoBuySelectedItem[];
  total_quantity: number;
  delivery_method: CoBuyDeliveryMethod | null;
  delivery_info: CoBuyDeliveryInfo | null;
  delivery_fee: number;
  pickup_status: CoBuyPickupStatus;
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded' | 'not_required';
  payment_key: string | null;
  payment_amount: number | null;
  paid_at: string | null;
  joined_at: string;
}

// ============================================================================
// CoBuy Request Types (Request-based CoBuy flow)
// ============================================================================

export type CoBuyRequestStatus =
  | 'draft'             // User filled basic info, may still be designing
  | 'pending'           // User submitted, waiting for admin
  | 'in_progress'       // Admin is working on the design
  | 'design_shared'     // Admin shared the design link to user
  | 'feedback'          // User left feedback
  | 'confirmed'         // Price and design confirmed
  | 'session_created'   // CoBuy session has been created
  | 'rejected';         // Admin rejected the request

export type CoBuyRequestAdminStatus =
  | 'not_reviewed'      // 미확인
  | 'reviewing'         // 확인중
  | 'quote_sent'        // 견적발송
  | 'contract_done'     // 계약완료
  | 'on_hold'           // 보류
  | 'cancelled';        // 취소

export interface CoBuyRequestSchedulePreferences {
  preferredStartDate?: string;
  preferredEndDate?: string;
  receiveByDate?: string;
}

export interface CoBuyRequestQuantityExpectations {
  estimatedQuantity?: number;
  minQuantity?: number;
  maxQuantity?: number;
}

export interface CoBuyRequest {
  id: string;
  user_id: string | null;
  product_id: string;
  title: string;
  description: string | null;
  freeform_canvas_state: Record<string, unknown>;
  freeform_color_selections: Record<string, unknown>;
  freeform_preview_url: string | null;
  status: CoBuyRequestStatus;
  admin_design_id: string | null;
  admin_design_preview_url: string | null;
  confirmed_price: number | null;
  cobuy_session_id: string | null;
  share_token: string;
  schedule_preferences: CoBuyRequestSchedulePreferences | null;
  quantity_expectations: CoBuyRequestQuantityExpectations | null;
  delivery_preferences: Record<string, unknown> | null;
  custom_fields: CoBuyCustomField[];
  is_public: boolean;
  uploaded_image_paths: string[];
  promo_image_url: string | null;
  admin_status: CoBuyRequestAdminStatus;
  admin_notes: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  product?: {
    id: string;
    title: string;
    thumbnail_image_link?: string[] | null;
  };
  profiles?: {
    email: string | null;
    name?: string | null;
  } | null;
}

export interface CoBuyRequestComment {
  id: string;
  request_id: string;
  user_id: string;
  content: string;
  is_admin: boolean;
  created_at: string;
  profiles?: {
    email: string | null;
    name?: string | null;
  } | null;
}

// ============================================================================
// Legacy slot types — used by single (no group) templates only.
// New group-bound templates use CompositionSlot + PlacementMap below.
// ============================================================================
export interface ImageSlot {
  slot_id: string;
  side_id: string;
  label: string;
  default_image_url: string;
  aspect_ratio: number;
  print_method_id: string;
  accepts: 'photo' | 'logo';
  bg_removal_default?: boolean;
}

export interface TextSlot {
  slot_id: string;
  side_id: string;
  label: string;
  placeholder?: string;
  max_length?: number;
  lock_style: boolean;
}

// ============================================================================
// Composition + Placement (group-based templates)
// ============================================================================

export interface CompositionTextSlot {
  slot_id: string;
  kind: 'text';
  label: string;
  default_text: string;
  placeholder?: string;
  max_length?: number;
  lock_style: boolean;
  font_family?: string;
  font_weight?: string;
  font_color?: string;
  print_method_id?: string;
}

export interface CompositionImageSlot {
  slot_id: string;
  kind: 'image';
  label: string;
  default_image_url: string;
  aspect_ratio: number;
  accepts: 'photo' | 'logo';
  bg_removal_default?: boolean;
  print_method_id?: string;
}

export type CompositionSlot = CompositionTextSlot | CompositionImageSlot;

export interface DesignComposition {
  slots: CompositionSlot[];
}

/** Per-instance placement of a composition slot on a product canvas. Normalized 0-1. */
export interface PlacementEntry {
  side_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  origin_x?: 'left' | 'center' | 'right';
  origin_y?: 'top' | 'center' | 'bottom';
  print_method_id?: string;
  font_family?: string;
  font_color?: string;
  font_weight?: string;
}

export type PlacementMap = Record<string, PlacementEntry>;

export interface DesignTemplate {
  id: string;
  product_id: string;
  template_group_id: string | null;
  title: string;
  description: string | null;
  canvas_state: Record<string, CanvasState | string>;
  preview_url: string | null;
  layer_colors: Record<string, string> | null;
  sort_order: number | null;
  is_active: boolean | null;
  type: string; // 'template' | 'cobuy_preset'
  category: string | null;
  tags: string[];
  is_featured: boolean;
  // Legacy single-template slot manifests
  image_slots: ImageSlot[];
  text_slots: TextSlot[];
  /** @deprecated */
  placement_map: PlacementMap;
  /** Which side of the product this instance places the group on. */
  side_id: string | null;
  /** Group transform on product canvas (normalized 0-1 within printArea). */
  transform: GroupTransform | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Slot Manifest — entries inside the group artwork that customers can replace.
// ============================================================================
export interface SlotManifestTextEntry {
  object_id: string;
  kind: 'text';
  label: string;
  placeholder?: string;
  max_length?: number;
  lock_style: boolean;
}

export interface SlotManifestImageEntry {
  object_id: string;
  kind: 'image';
  label: string;
  aspect_ratio?: number;
  accepts: 'photo' | 'logo';
  bg_removal_default?: boolean;
  print_method_id?: string;
}

export type SlotManifestEntry = SlotManifestTextEntry | SlotManifestImageEntry;

export interface ArtworkCanvasSize {
  width: number;
  height: number;
}

export interface GroupTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  origin_x?: 'left' | 'center' | 'right';
  origin_y?: 'top' | 'center' | 'bottom';
}

export interface TemplateGroup {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  preview_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  /** Fabric.js canvas JSON of the group's actual artwork. */
  artwork_state: Record<string, unknown>;
  artwork_canvas_size: ArtworkCanvasSize;
  slot_manifest: SlotManifestEntry[];
  /** @deprecated */
  design_composition?: DesignComposition;
  created_at: string;
  updated_at: string;
}

export interface SavedDesign {
  id: string;
  user_id: string;
  product_id: string;
  title: string | null;
  color_selections: Record<string, Record<string, string>>;
  canvas_state: Record<string, CanvasState | string>;
  preview_url: string | null;
  price_per_item: number;
  image_urls: Record<string, Array<{ url: string; path?: string; uploadedAt?: string }>> | null;
  text_svg_exports: Record<string, string> | null;
  custom_fonts: CustomFont[] | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  user?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  product?: {
    id: string;
    title: string;
    thumbnail_image_link: string[] | null;
  } | null;
}

// ============================================================================
// Coupon Types
// ============================================================================

export type CouponDiscountType = 'percentage' | 'fixed_amount';

export interface Coupon {
  id: string;
  code: string;
  display_name: string | null;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  /** 전체 사용 한도(전 사용자 합산). null = 무제한 */
  max_uses: number | null;
  /** 1인당 사용 횟수 제한. null = 무제한, 정수 = 해당 횟수 */
  max_uses_per_user: number | null;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
  valid_days_after_registration: number | null;
  created_at: string;
  updated_at: string;
}

export interface CouponUsage {
  id: string;
  coupon_id: string;
  user_id: string;
  registered_at: string;
  expires_at: string | null;
  used_at: string | null;
  order_id: string | null;
  discount_applied: number | null;
  /** 해당 유저가 이 쿠폰을 실제 사용(결제)한 횟수 */
  uses_count: number;
  created_at: string;
  // Joined relations
  coupon?: Coupon;
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
}

// ============================================================================
// Partner Mall Types
// ============================================================================

export interface LogoPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PartnerMall {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string;
  original_logo_url: string | null;
  is_active: boolean;
  share_token: string | null;
  /** 영업담당자 — partner_malls.salesman_id (modoo_salesman 단체 소유주) */
  salesman_id?: string | null;
  /** Joined: salesman_profiles via salesman_id */
  attributed_salesman?: AssigneeSalesman | null;
  /** modoo_salesman 단체 메타데이터 (의사결정권자 등) */
  team_meta?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  partner_mall_products?: PartnerMallProduct[];
  partner_mall_assets?: PartnerMallAsset[];
}

export type PartnerMallAssetType = 'logo' | 'image' | 'document' | 'reference';

export type PartnerMallActorRole = 'salesman' | 'admin' | 'guest' | 'owner';

export interface PartnerMallAsset {
  id: string;
  partner_mall_id?: string;
  asset_type: PartnerMallAssetType;
  url: string;
  name: string | null;
  description: string | null;
  file_size: number | null;
  mime_type: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
  created_by_role?: PartnerMallActorRole | null;
  created_by_fingerprint?: string | null;
  created_at: string;
}

export interface PartnerMallProduct {
  id: string;
  partner_mall_id: string;
  product_id: string;
  display_name: string | null;
  manufacturer_color_id: string | null;
  color_hex: string | null;
  color_name: string | null;
  color_code: string | null;
  logo_placements: Record<string, LogoPlacement>;  // keyed by side_id
  canvas_state: Record<string, unknown>;
  preview_url: string | null;
  price: number | null;
  created_by_role?: PartnerMallActorRole | null;
  created_by_fingerprint?: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  product?: Product;
  partner_mall?: PartnerMall;
}

export interface PartnerMallPreset {
  id: string;
  product_id: string;
  name: string;
  placement: LogoPlacement;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Invoice Types (거래명세서)
// ============================================================================

export interface InvoiceItem {
  name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  /** 규격 */
  spec?: string;
  /** 행 단위 비고 */
  remarks?: string;
  /** 월 (선택, 공란 가능) */
  month?: string;
  /** 일 (선택, 공란 가능) */
  day?: string;
}

export type InvoiceDocumentType = 'transaction_statement' | 'tax_invoice' | 'cash_receipt' | 'payment_receipt';
export type InvoiceStatus = 'draft' | 'issued' | 'sent' | 'external_issued' | 'void';
export type CashReceiptMethod = 'phone' | 'business' | 'card';

/** 세금계산서 공급받는자(사업자) 정보 */
export interface InvoiceRecipientBusiness {
  biz_no?: string;     // 사업자등록번호
  org?: string;        // 상호
  ceo?: string;        // 대표자
  address?: string;    // 사업장 주소
  biz_type?: string;   // 업태
  biz_item?: string;   // 종목
}

export interface Invoice {
  id: string;
  invoice_number: string;
  document_type: InvoiceDocumentType;
  order_id: string | null;
  status: InvoiceStatus;
  include_vat: boolean;
  items: InvoiceItem[];
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  recipient_org: string | null;
  recipient_name: string | null;
  recipient_email: string;
  recipient_business: InvoiceRecipientBusiness | null;
  cash_receipt_method: CashReceiptMethod | null;
  cash_receipt_identifier: string | null;
  issue_date: string | null;
  memo: string | null;
  sent_at: string;
  created_at: string;
  // 향후 홈택스/대행 실발행 연동(Phase A)
  external_provider: string | null;
  external_doc_id: string | null;
  external_status: string | null;
  external_issued_at: string | null;
}

// ============================================================================
// Editor Chat Types
// ============================================================================

export interface EditorChatMessageSender {
  name: string | null;
  role: 'admin' | 'customer' | 'factory' | 'super_admin' | 'marketing_manager';
  email: string;
}

export interface EditorChatMessage {
  id: string;
  order_item_id: string;
  sender_id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'resolved';
  attachment_urls: string[];
  created_at: string;
  updated_at: string;
  sender?: EditorChatMessageSender;
}
