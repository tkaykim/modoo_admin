export const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || 'Failed to fetch');
  }
  const payload = await res.json();
  return payload?.data;
};
