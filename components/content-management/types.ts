export type SectionKey = 'reviews' | 'examples' | 'heroBanners' | 'announcements' | 'faqs' | 'inquiries' | 'chatbotInquiries';

export type ProductSummary = {
  id: string;
  title: string;
};

export type ReviewRecord = {
  id: string;
  product_id: string;
  rating: number;
  title: string;
  content: string;
  author_name: string;
  is_verified_purchase: boolean | null;
  is_best: boolean | null;
  best_order: number | null;
  helpful_count: number | null;
  review_image_urls: string[] | null;
  created_at: string;
  updated_at: string;
  product?: ProductSummary | null;
};

export type ReviewFormState = {
  id?: string | null;
  product_id: string;
  rating: number;
  title: string;
  content: string;
  author_name: string;
  is_verified_purchase: boolean;
  is_best: boolean;
  review_image_urls: string[];
};

export type ProductionExampleRecord = {
  id: string;
  product_id: string;
  title: string;
  description: string;
  image_url: string;
  sort_order: number;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  product?: ProductSummary | null;
};

export type HeroBannerRecord = {
  id: string;
  title: string;
  subtitle: string;
  image_link: string | null;
  redirect_link: string | null;
  sort_order: number;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

export type AnnouncementCategory = 'notice' | 'fabric' | 'printing' | 'order_guide';

export type AnnouncementRecord = {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  is_published: boolean | null;
  image_links: string[] | null;
  created_at: string;
  updated_at: string;
};

export type FaqRecord = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  tags: string[] | null;
  sort_order: number;
  is_published: boolean | null;
  created_at: string;
  updated_at: string;
};

export type InquiryStatus = 'pending' | 'ongoing' | 'completed';

export type InquiryProductRecord = {
  id: string;
  product_id: string;
  product?: ProductSummary | null;
};

export type InquiryReplyRecord = {
  id: string;
  content: string;
  admin_id: string | null;
  created_at: string;
};

export type InquiryRecord = {
  id: string;
  user_id: string | null;
  title: string;
  content: string;
  status: InquiryStatus;
  is_admin: boolean | null;
  group_name: string | null;
  manager_name: string | null;
  phone: string | null;
  kakao_id: string | null;
  desired_date: string | null;
  expected_qty: number | null;
  fabric_color: string | null;
  file_urls: string[] | null;
  created_at: string;
  updated_at: string;
  inquiry_products?: InquiryProductRecord[] | null;
  inquiry_replies?: InquiryReplyRecord[] | null;
};

export type ExampleFormState = {
  id?: string | null;
  product_id: string;
  title: string;
  description: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
};

export type AnnouncementFormState = {
  id?: string | null;
  title: string;
  content: string;
  category: AnnouncementCategory;
  is_published: boolean;
  image_links: string[];
};

export type HeroBannerFormState = {
  id?: string | null;
  title: string;
  subtitle: string;
  image_link: string;
  redirect_link: string;
  sort_order: number;
  is_active: boolean;
};

export type FaqFormState = {
  id?: string | null;
  question: string;
  answer: string;
  category: string;
  tags: string;
  sort_order: number;
  is_published: boolean;
};

// Popup Banner Types
export type PopupBannerRecord = {
  id: string;
  title: string;
  image_url: string;
  redirect_url: string | null;
  sort_order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

export type PopupBannerFormState = {
  id?: string | null;
  title: string;
  image_url: string;
  redirect_url: string;
  sort_order: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
};

// Chatbot Inquiry Types
export type ChatbotInquiryStatus = 'pending' | 'contacted' | 'completed' | 'cancelled';

export type ChatbotInquiryRecord = {
  id: string;
  clothing_type: string;
  quantity: number;
  priorities: string[];
  needed_date: string | null;
  needed_date_flexible: boolean;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string;
  status: ChatbotInquiryStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};
