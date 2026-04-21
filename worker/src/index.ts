import { fetchProducts } from './services/shopify';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/products') {
			try {
				const params = {
					search: url.searchParams.get('search') ?? '',
					vendor: url.searchParams.get('vendor') ?? '',
					productType: url.searchParams.get('productType') ?? '',
					cursor: url.searchParams.get('cursor') ?? undefined,
				};

				const result = await fetchProducts(env, params);

				return Response.json(result);
			} catch (error) {
				return new Response(`Shopify Error: ${String(error)}`, { status: 500 });
			}
		}

		return new Response('OK');
	},
} satisfies ExportedHandler<Env>;
