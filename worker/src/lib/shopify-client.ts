type ShopifyError = {
	message: string;
	extensions?: Record<string, any>;
};

type ShopifyResponse<T> = {
	data?: T;
	errors?: ShopifyError[];
};

const API_VERSION = '2024-10';

export async function shopifyRequest<T>(env: Env, query: string, variables?: Record<string, unknown>, retry = 0): Promise<T> {
	const res = await fetch(`https://${env.SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
		},
		body: JSON.stringify({ query, variables }),
	});

	if (!res.ok) {
		const text = await res.text();

		if (res.status === 429 && retry < 3) {
			await delay(500 * (retry + 1));
			return shopifyRequest(env, query, variables, retry + 1);
		}

		throw new Error(`Shopify HTTP ${res.status}: ${text}`);
	}

	const json = (await res.json()) as ShopifyResponse<T>;

	if (json.errors?.length) {
		const throttled = json.errors.some((e) => e.message.toLowerCase().includes('throttle'));

		if (throttled && retry < 3) {
			await delay(500 * (retry + 1));
			return shopifyRequest(env, query, variables, retry + 1);
		}

		throw new Error(json.errors.map((e) => e.message).join(', '));
	}

	if (!json.data) {
		throw new Error('Empty Shopify response');
	}

	return json.data;
}

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
