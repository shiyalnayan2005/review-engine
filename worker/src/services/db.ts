import { Product, Review } from '../types';

export async function insertProduct(env: Env, data: any): Promise<void> {
	await env.review_db
		.prepare(
			`
      INSERT OR IGNORE INTO products (asin, title, rating, total_reviews)
      VALUES (?, ?, ?, ?)
    `,
		)
		.bind(data.asin, data.name || null, data.average_rating || null, data.total_reviews || null)
		.run();
}

export async function insertReviews(env: Env, asin: string, reviews: any[]): Promise<number> {
	const stmt = env.review_db.prepare(`
    INSERT INTO reviews (asin, reviewer_name, rating, title, body)
    VALUES (?, ?, ?, ?, ?)
  `);

	const batch = reviews.map((r) => {
		const title = r.title
			? r.title
					.split('\n')
					.map((line: string) => line.trim())
					.find((line: string) => !line.includes('out of 5 stars') && line.trim())
			: '';
		const review = r.review
			? r.review
					.split('\n')
					.map((line: string) => line.trim())
					.filter(Boolean)
					.find((line: string) => !line.includes('The media could not be loaded') && !line.includes('Read more') && line.trim())
			: '';
		return stmt.bind(asin, r.username || 'Anonymous', parseFloat(r.stars) || 0, title, review);
	});

	const results = await env.review_db.batch(batch);
	return results.filter((r: any) => r.success).length;
}

export async function getPendingReviews(env: Env, limit = 5): Promise<Review[]> {
	const result = await env.review_db
		.prepare(
			`
      SELECT * FROM reviews 
      WHERE ai_status = 'pending' 
      ORDER BY created_at ASC 
      LIMIT ?
    `,
		)
		.bind(limit)
		.all<Review>();

	return result.results;
}

export async function updateReviewStatus(env: Env, id: number, status: string, ai_body: string = ''): Promise<void> {
	await env.review_db.prepare(`UPDATE reviews SET ai_status = ?, ai_body = ? WHERE id = ?`).bind(status, ai_body, id).run();
}

export async function getProducts(env: Env, page = 1, limit = 20, search = ''): Promise<{ products: Product[]; total: number }> {
	const offset = (page - 1) * limit;

	let whereClause = '';
	let params: any[] = [];

	if (search) {
		whereClause = `WHERE asin LIKE ? OR title LIKE ?`;
		params = [`%${search}%`, `%${search}%`, limit, offset];
	} else {
		params = [limit, offset];
	}

	const products = await env.review_db
		.prepare(
			`
      SELECT * FROM products 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `,
		)
		.bind(...params)
		.all<Product>();

	const countResult = await env.review_db
		.prepare(`SELECT COUNT(*) as total FROM products ${whereClause ? whereClause.split('LIMIT')[0] : ''}`)
		.bind(...(search ? [`%${search}%`, `%${search}%`] : []))
		.first<{ total: number }>();

	return {
		products: products.results,
		total: countResult?.total || 0,
	};
}

export async function getReviews(
	env: Env,
	page = 1,
	limit = 20,
	filters: { asin?: string; status?: string } = {},
): Promise<{ reviews: Review[]; total: number }> {
	const offset = (page - 1) * limit;

	let whereConditions: string[] = [];
	let params: any[] = [];

	if (filters.asin) {
		whereConditions.push('asin = ?');
		params.push(filters.asin);
	}

	if (filters.status) {
		whereConditions.push('ai_status = ?');
		params.push(filters.status);
	}

	const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

	const reviews = await env.review_db
		.prepare(
			`
      SELECT * FROM reviews 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `,
		)
		.bind(...params, limit, offset)
		.all<Review>();

	const countResult = await env.review_db
		.prepare(`SELECT COUNT(*) as total FROM reviews ${whereClause}`)
		.bind(...params)
		.first<{ total: number }>();

	return {
		reviews: reviews.results,
		total: countResult?.total || 0,
	};
}

export async function getStats(env: Env): Promise<any> {
	const result = await env.review_db
		.prepare(
			`
      SELECT 
        (SELECT COUNT(*) FROM products) as total_products,
        (SELECT COUNT(*) FROM reviews) as total_reviews,
        (SELECT COUNT(*) FROM reviews WHERE ai_status = 'pending') as pending,
        (SELECT COUNT(*) FROM reviews WHERE ai_status = 'processing') as processing,
        (SELECT COUNT(*) FROM reviews WHERE ai_status = 'done') as completed,
        (SELECT COUNT(*) FROM reviews WHERE ai_status = 'failed') as failed
    `,
		)
		.first();

	return result || {};
}

export async function getProductByAsin(env: Env, asin: string): Promise<Product | null> {
	return await env.review_db.prepare(`SELECT * FROM products WHERE asin = ?`).bind(asin).first<Product>();
}
