export function createPageUrl(pageName: string, params?: Record<string, string | number | boolean | null | undefined>) {
	const base = '/' + pageName.toLowerCase().replace(/ /g, '-');
	if (!params) return base;
	const searchParams = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null) return;
		searchParams.set(key, String(value));
	});
	const query = searchParams.toString();
	return query ? `${base}?${query}` : base;
}