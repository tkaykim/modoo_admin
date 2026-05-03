import type {
  ProductionExampleRecord,
  HeroBannerRecord,
  AnnouncementRecord,
  AnnouncementCategory,
  FaqRecord,
  ReviewRecord,
  ExampleFormState,
  HeroBannerFormState,
  AnnouncementFormState,
  FaqFormState,
  ReviewFormState,
  PopupBannerRecord,
  PopupBannerFormState,
  InquiryStatus,
  ChatbotInquiryStatus,
  ChatbotInquiryRecord,
} from './types';
import { formatKstDateLong, isTodayKst } from '@/lib/kst';

export const ANNOUNCEMENT_CATEGORIES: Record<AnnouncementCategory, string> = {
  notice: '공지',
  fabric: '원단 안내',
  printing: '인쇄방법 안내',
  order_guide: '주문 가이드',
};

export const EXAMPLE_IMAGE_BUCKET = 'products';
export const EXAMPLE_IMAGE_FOLDER = 'production-examples';
export const BANNER_IMAGE_BUCKET = 'products';
export const BANNER_IMAGE_FOLDER = 'hero-banners';
export const ANNOUNCEMENT_IMAGE_BUCKET = 'products';
export const ANNOUNCEMENT_IMAGE_FOLDER = 'announcements';
export const REVIEW_IMAGE_BUCKET = 'products';
export const REVIEW_IMAGE_FOLDER = 'reviews';
export const POPUP_BANNER_IMAGE_BUCKET = 'products';
export const POPUP_BANNER_IMAGE_FOLDER = 'popup-banners';

export const emptyExampleForm: ExampleFormState = {
  product_id: '',
  title: '',
  description: '',
  image_url: '',
  sort_order: 0,
  is_active: true,
};

export const emptyHeroBannerForm: HeroBannerFormState = {
  title: '',
  subtitle: '',
  image_link: '',
  redirect_link: '',
  sort_order: 0,
  is_active: true,
};

export const emptyAnnouncementForm: AnnouncementFormState = {
  title: '',
  content: '',
  category: 'notice',
  is_published: true,
  image_links: [],
};

export const emptyFaqForm: FaqFormState = {
  question: '',
  answer: '',
  category: '',
  tags: '',
  sort_order: 0,
  is_published: true,
};

export const emptyPopupBannerForm: PopupBannerFormState = {
  title: '',
  image_url: '',
  redirect_url: '',
  sort_order: 0,
  is_active: true,
  start_date: '',
  end_date: '',
};

export const emptyReviewForm: ReviewFormState = {
  product_id: '',
  rating: 5,
  title: '',
  content: '',
  author_name: '',
  is_verified_purchase: false,
  is_best: false,
  review_image_urls: [],
};

export const formatDate = (dateString: string) => formatKstDateLong(dateString);

export const isToday = (dateString: string) => isTodayKst(dateString);

export const sortExamples = (examples: ProductionExampleRecord[]) => {
  return [...examples].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

export const sortHeroBanners = (banners: HeroBannerRecord[]) => {
  return [...banners].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

export const sortPopupBanners = (banners: PopupBannerRecord[]) => {
  return [...banners].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

export const sortAnnouncements = (announcements: AnnouncementRecord[]) => {
  return [...announcements].sort((a, b) => {
    if (a.created_at === b.created_at) return 0;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

export const sortFaqs = (faqs: FaqRecord[]) => {
  return [...faqs].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

export const sortReviews = (reviews: ReviewRecord[]) => {
  return [...reviews].sort((a, b) => {
    // Best reviews first
    if (a.is_best && !b.is_best) return -1;
    if (!a.is_best && b.is_best) return 1;
    // Then by date
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

export const parseFaqTags = (value: string) => {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
};

export const getStatusStyle = (status: InquiryStatus) => {
  const styles: Record<InquiryStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    ongoing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
  };
  return styles[status];
};

export const getStatusLabel = (status: InquiryStatus) => {
  const labels: Record<InquiryStatus, string> = {
    pending: '대기중',
    ongoing: '진행중',
    completed: '완료',
  };
  return labels[status];
};

// Chatbot Inquiry Utilities
export const getChatbotInquiryStatusStyle = (status: ChatbotInquiryStatus) => {
  const styles: Record<ChatbotInquiryStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    contacted: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };
  return styles[status];
};

export const getChatbotInquiryStatusLabel = (status: ChatbotInquiryStatus) => {
  const labels: Record<ChatbotInquiryStatus, string> = {
    pending: '대기중',
    contacted: '연락완료',
    completed: '완료',
    cancelled: '취소',
  };
  return labels[status];
};

export const sortChatbotInquiries = (inquiries: ChatbotInquiryRecord[]) => {
  return [...inquiries].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};
