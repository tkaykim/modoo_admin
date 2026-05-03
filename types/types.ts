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
export type PrintMethod = 'dtf' | 'dtg' | 'screen_printing' | 'embroidery' | 'applique';

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

  order_category?: 'cobuy' | 'regular' | 'salesman_direct' | null;
  cobuy_session_id?: string | null;

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

  // Shareable link token (generated on demand)
  share_token: string | null;

  // Joined order items (for list views)
  order_items?: OrderItem[];

  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  design_id: string | null;
  product_title: string;
  /** Display name from saved design (nullable in DB) */
  design_title: string | null;
  quantity: number;
  price_per_item: number;

  canvas_state: Record<string, CanvasState>;
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
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
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
  role: 'customer' | 'admin' | 'factory';
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

// Delivery settings for cobuy sessions
export interface CoBuyDeliverySettings {
  deliveryAddress?: {
    address: string;
    addressDetail?: string;
    postalCode?: string;
  };
  pickupAddress?: {
    address: string;
    addressDetail?: string;
    postalCode?: string;
  };
  enableIndividualDelivery?: boolean;
  deliveryFee?: number;
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

export interface DesignTemplate {
  id: string;
  product_id: string;
  title: string;
  description: string | null;
  canvas_state: Record<string, CanvasState | string>;
  preview_url: string | null;
  layer_colors: Record<string, string> | null;
  sort_order: number | null;
  is_active: boolean | null;
  type: string; // 'template' | 'cobuy_preset'
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
  max_uses: number | null;
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
  created_at: string;
  updated_at: string;
  // Joined relations
  partner_mall_products?: PartnerMallProduct[];
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

export interface Invoice {
  id: string;
  invoice_number: string;
  include_vat: boolean;
  items: InvoiceItem[];
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  recipient_org: string | null;
  recipient_name: string | null;
  recipient_email: string;
  memo: string | null;
  sent_at: string;
  created_at: string;
}

// ============================================================================
// Editor Chat Types
// ============================================================================

export interface EditorChatMessageSender {
  name: string | null;
  role: 'admin' | 'customer' | 'factory';
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
