export type CategoryConfig = {
  name: string;
  key: string;
  icon: string;
};

export const CATEGORIES: CategoryConfig[] = [
  { name: "전체", key: "all", icon: "/icons/total.png" },
  { name: "티셔츠", key: "t-shirts", icon: "/icons/tshirt.png" },
  { name: "후드티", key: "hoodie", icon: "/icons/hoodie.png" },
  { name: "자켓", key: "jacket", icon: "/icons/jacket.png" },
  { name: "맨투맨", key: "sweater", icon: "/icons/sweater.png" },
  { name: "후드집업", key: "zipup", icon: "/icons/zipup.png" },
];

export const ALL_CATEGORY = {
  name: "전체",
  key: "all",
  icon: undefined,
};

// Helper function to get icon by category key
export function getCategoryIcon(categoryKey: string): string | undefined {
  if (categoryKey === ALL_CATEGORY.key || categoryKey === ALL_CATEGORY.name) {
    return undefined;
  }

  const category = CATEGORIES.find(
    (cat) => cat.key === categoryKey || cat.name === categoryKey
  );

  return category?.icon;
}

// Helper function to get category name by key
export function getCategoryName(categoryKey: string): string {
  if (categoryKey === ALL_CATEGORY.key) {
    return ALL_CATEGORY.name;
  }

  const category = CATEGORIES.find((cat) => cat.key === categoryKey);
  return category?.name || categoryKey;
}