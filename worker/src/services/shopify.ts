import { shopifyRequest } from '../lib/shopify-client';

type ShopifyProduct = {
	id: string;
	title: string;
	description: string;
	vendor: string;
	productType: string;
};

type ProductsQuery = {
	products: {
		edges: {
			cursor: string;
			node: ShopifyProduct;
		}[];
		pageInfo: {
			hasNextPage: boolean;
			endCursor: string | null;
		};
	};
};

type FetchProductsParams = {
	search?: string;
	vendor?: string;
	productType?: string;
	cursor?: string;
};

export async function fetchProducts(env: Env, params: FetchProductsParams) {
	const { search = '', vendor = '', productType = '', cursor } = params;

	const filters: string[] = [];

	if (search) filters.push(`title:*${search.replace(/"/g, '')}*`);
	if (vendor) filters.push(`vendor:${vendor}`);
	if (productType) filters.push(`product_type:${productType}`);

	const queryString = filters.join(' ');

	const query = `
    query ($query: String!, $cursor: String) {
      products(first: 20, after: $cursor, query: $query) {
        edges {
          cursor
          node {
            id
            title
            description
            vendor
            productType
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

	const data = await shopifyRequest<ProductsQuery>(env, query, {
		query: queryString,
		cursor: cursor ?? null,
	});

	return {
		products: data.products.edges.map((e) => e.node),
		pageInfo: data.products.pageInfo,
	};
}
