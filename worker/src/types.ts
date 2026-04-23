export interface Product {
	id: number;
	asin: string;
	title: string | null;
	rating: number | null;
	total_reviews: number | null;
	created_at: string;
}

export interface Review {
	id: number;
	asin: string;
	reviewer_name: string | null;
	rating: number | null;
	title: string | null;
	body: string | null;
	ai_body: string | null;
	ai_status: 'pending' | 'processing' | 'done' | 'failed';
	created_at: string;
}

export interface Env {
	review_db: D1Database;
	GEMINI_API_KEY: string;
	SHOPIFY_STORE: string;
	SHOPIFY_ACCESS_TOKEN: string;
}

export interface ScraperAPIResponse {
	input: string;
	result: string | AmazonProductData;
}

export interface AmazonProductData {
	asin?: string;
	name?: string;
	average_rating?: number;
	total_reviews?: number;
	reviews?: AmazonReview[];
}

export interface AmazonReview {
	username?: string;
	stars?: string | number;
	title?: string;
	review?: string;
}
