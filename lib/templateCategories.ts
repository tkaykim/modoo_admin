export const TEMPLATE_CATEGORIES = ['family', 'pet', 'group', 'logo', 'event'] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  family: '가족',
  pet: '반려동물',
  group: '단체',
  logo: '로고',
  event: '이벤트',
};

export function isTemplateCategory(value: string | null | undefined): value is TemplateCategory {
  return !!value && (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}
