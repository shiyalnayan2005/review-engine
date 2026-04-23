import { Env, ScraperAPIResponse, AmazonProductData } from './types';
import { parseWebhookBody, decodeHtmlEntities, sleep } from './lib/utils';
import { generateAIReview } from './lib/ai-client';
import {
	insertProduct,
	insertReviews,
	getPendingReviews,
	updateReviewStatus,
	getProducts,
	getReviews,
	getStats,
	getProductByAsin,
} from './services/db';

// Collection URLs configuration - modify as needed
const COLLECTION_URLS = {
	default: 'https://www.amazon.in/s?srs=17337761031',
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;
		const method = request.method;

		// Serve admin panel
		if (pathname === '/' || pathname === '/admin') {
			return serveAdminPanel();
		}

		// API Routes
		if (pathname.startsWith('/api/')) {
			return handleApiRoutes(request, env, url, pathname, method);
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

async function handleApiRoutes(request: Request, env: Env, url: URL, pathname: string, method: string): Promise<Response> {
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};

	if (method === 'OPTIONS') {
		return new Response(null, { headers: corsHeaders });
	}

	try {
		// Get stats
		if (pathname === '/api/stats' && method === 'GET') {
			const stats = await getStats(env);
			return Response.json(stats, { headers: corsHeaders });
		}

		// Get products with pagination
		if (pathname === '/api/products' && method === 'GET') {
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = parseInt(url.searchParams.get('limit') || '20');
			const search = url.searchParams.get('search') || '';

			const result = await getProducts(env, page, limit, search);
			return Response.json(result, { headers: corsHeaders });
		}

		// Get single product
		if (pathname === '/api/products/detail' && method === 'GET') {
			const asin = url.searchParams.get('asin');
			if (!asin) {
				return Response.json({ error: 'ASIN required' }, { status: 400, headers: corsHeaders });
			}

			const product = await getProductByAsin(env, asin);
			return Response.json(product || null, { headers: corsHeaders });
		}

		// Get reviews with filtering
		if (pathname === '/api/reviews' && method === 'GET') {
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = parseInt(url.searchParams.get('limit') || '20');
			const asin = url.searchParams.get('asin') || undefined;
			const status = url.searchParams.get('status') || undefined;

			const result = await getReviews(env, page, limit, { asin, status });
			return Response.json(result, { headers: corsHeaders });
		}

		// Get collection ASINs
		if (pathname === '/api/collection-asins' && method === 'GET') {
			const collectionKey = url.searchParams.get('key') || 'default';
			const collectionUrl = COLLECTION_URLS[collectionKey as keyof typeof COLLECTION_URLS];

			if (!collectionUrl) {
				return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
			}

			const response = await fetch(collectionUrl, {
				headers: { 'User-Agent': 'Mozilla/5.0' },
			});

			const asins: string[] = [];
			const rewriter = new HTMLRewriter().on('[data-asin]', {
				element(el) {
					const asin = el.getAttribute('data-asin');
					if (asin && asin !== 'null') asins.push(asin);
				},
			});

			await rewriter.transform(response).text();

			return Response.json(
				{
					asins: [...new Set(asins)],
					url: collectionUrl,
				},
				{ headers: corsHeaders },
			);
		}

		// Webhook endpoint
		if (pathname === '/api/webhook' && method === 'POST') {
			const payloads = await parseWebhookBody(request);
			console.log(`Processing ${payloads.length} items from webhook`);

			let processed = 0;

			for (const item of payloads) {
				const asin = item.input;
				const result: AmazonProductData = typeof item.result === 'string' ? JSON.parse(item.result) : item.result;

				await insertProduct(env, {
					asin,
					name: decodeHtmlEntities(result.name || ''),
					average_rating: result.average_rating,
					total_reviews: result.total_reviews,
				});

				if (result.reviews?.length) {
					await insertReviews(env, asin, result.reviews);
				}

				processed++;
			}

			console.log(`Webhook processed: ${processed} items`);
			return Response.json({ success: true, processed }, { headers: corsHeaders });
		}

		// Start processing reviews
		if (pathname === '/api/process/start' && method === 'POST') {
			//@ts-ignore
			const { batchSize = 5 } = await request.json().catch(() => ({}));

			const pending = await getPendingReviews(env, batchSize);

			if (pending.length === 0) {
				return Response.json(
					{
						success: true,
						message: 'No pending reviews',
						processed: 0,
					},
					{ headers: corsHeaders },
				);
			}

			let processed = 0;

			for (const review of pending) {
				try {
					await updateReviewStatus(env, review.id, 'processing');

					const aiBody = await generateAIReview(env, {
						title: review.title || '',
						body: review.body || '',
						rating: review.rating || 4,
					});

					await updateReviewStatus(env, review.id, 'done', aiBody);
					processed++;

					await sleep(500); // Rate limit protection
				} catch (error) {
					console.error(`Failed to process review ${review.id}:`, error);
					await updateReviewStatus(env, review.id, 'failed');
				}
			}

			console.log(`Processed ${processed} reviews`);
			return Response.json({ success: true, processed }, { headers: corsHeaders });
		}

		// Stop processing (mark processing as failed)
		if (pathname === '/api/process/stop' && method === 'POST') {
			const result = await env.review_db.prepare(`UPDATE reviews SET ai_status = 'pending' WHERE ai_status = 'processing'`).run();

			return Response.json(
				{
					success: true,
					reset: result.meta.changes,
				},
				{ headers: corsHeaders },
			);
		}

		// Reprocess failed reviews
		if (pathname === '/api/process/reprocess-failed' && method === 'POST') {
			const result = await env.review_db
				.prepare(`UPDATE reviews SET ai_status = 'pending', ai_body = NULL WHERE ai_status = 'failed'`)
				.run();

			return Response.json(
				{
					success: true,
					reset: result.meta.changes,
				},
				{ headers: corsHeaders },
			);
		}

		return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
	} catch (error) {
		console.error('API Error:', error);
		return Response.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500, headers: corsHeaders });
	}
}

function serveAdminPanel(): Response {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Manager</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 20px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-label { color: #666; font-size: 14px; margin-bottom: 5px; }
        .stat-value { color: #333; font-size: 32px; font-weight: bold; }
        .controls { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .button-group { display: flex; gap: 10px; flex-wrap: wrap; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.3s; }
        .btn-primary { background: #007bff; color: white; }
        .btn-primary:hover { background: #0056b3; }
        .btn-success { background: #28a745; color: white; }
        .btn-success:hover { background: #1e7e34; }
        .btn-danger { background: #dc3545; color: white; }
        .btn-danger:hover { background: #c82333; }
        .btn-warning { background: #ffc107; color: #333; }
        .btn-warning:hover { background: #e0a800; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .tabs { display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 2px solid #dee2e6; }
        .tab { padding: 10px 20px; background: none; border: none; cursor: pointer; font-size: 16px; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px; }
        .tab.active { color: #007bff; border-bottom-color: #007bff; }
        .search-bar { margin-bottom: 20px; display: flex; gap: 10px; }
        .search-input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
        .filter-select { padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
        .table-container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; }
        td { padding: 12px; border-bottom: 1px solid #dee2e6; }
        tr:hover { background: #f8f9fa; }
        .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .status-pending { background: #fff3cd; color: #856404; }
        .status-processing { background: #cce5ff; color: #004085; }
        .status-done { background: #d4edda; color: #155724; }
        .status-failed { background: #f8d7da; color: #721c24; }
        .pagination { display: flex; justify-content: center; gap: 10px; margin-top: 20px; }
        .pagination button { padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px; }
        .pagination button:hover { background: #f8f9fa; }
        .pagination button.active { background: #007bff; color: white; border-color: #007bff; }
        .loading { text-align: center; padding: 40px; color: #666; }
        .message { padding: 10px; margin-bottom: 15px; border-radius: 5px; display: none; }
        .message.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .message.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .review-body { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .batch-input { width: 80px; padding: 8px; margin: 0 10px; border: 1px solid #ddd; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Review Management Dashboard</h1>
        
        <div class="message" id="message"></div>
        
        <div class="stats-grid" id="stats">
            <div class="stat-card">
                <div class="stat-label">Total Products</div>
                <div class="stat-value" id="totalProducts">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Reviews</div>
                <div class="stat-value" id="totalReviews">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Pending</div>
                <div class="stat-value" id="pendingReviews">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Processing</div>
                <div class="stat-value" id="processingReviews">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Completed</div>
                <div class="stat-value" id="completedReviews">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Failed</div>
                <div class="stat-value" id="failedReviews">0</div>
            </div>
        </div>

        <div class="controls">
            <div class="button-group">
                <button class="btn btn-success" onclick="startProcessing()">▶ Start Processing</button>
                <button class="btn btn-danger" onclick="stopProcessing()">⏹ Stop Processing</button>
                <button class="btn btn-warning" onclick="reprocessFailed()">🔄 Reprocess Failed</button>
                <button class="btn btn-primary" onclick="refreshData()">🔄 Refresh</button>
                <label style="margin-left: 20px;">
                    Batch Size: 
                    <input type="number" id="batchSize" class="batch-input" value="5" min="1" max="20">
                </label>
            </div>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="switchTab('products')">Products</button>
            <button class="tab" onclick="switchTab('reviews')">Reviews</button>
        </div>

        <div id="productsPanel">
            <div class="search-bar">
                <input type="text" class="search-input" id="productSearch" placeholder="Search by ASIN or title..." onkeyup="searchProducts()">
                <button class="btn btn-primary" onclick="loadProducts()">Search</button>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>ASIN</th>
                            <th>Title</th>
                            <th>Rating</th>
                            <th>Reviews</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="productsTable">
                        <tr><td colspan="6" class="loading">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="pagination" id="productsPagination"></div>
        </div>

        <div id="reviewsPanel" style="display:none;">
            <div class="search-bar">
                <input type="text" class="search-input" id="reviewAsinFilter" placeholder="Filter by ASIN...">
                <select class="filter-select" id="reviewStatusFilter" onchange="loadReviews()">
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="done">Completed</option>
                    <option value="failed">Failed</option>
                </select>
                <button class="btn btn-primary" onclick="loadReviews()">Filter</button>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>ASIN</th>
                            <th>Reviewer</th>
                            <th>Rating</th>
                            <th>Original</th>
                            <th>AI Generated</th>
                            <th>Status</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody id="reviewsTable">
                        <tr><td colspan="8" class="loading">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="pagination" id="reviewsPagination"></div>
        </div>
    </div>

    <script>
        let currentTab = 'products';
        let productsPage = 1;
        let reviewsPage = 1;
        let processingInterval = null;

        async function apiCall(endpoint, options = {}) {
            try {
                const response = await fetch('/api' + endpoint, options);
                return await response.json();
            } catch (error) {
                showMessage('Error: ' + error.message, 'error');
                throw error;
            }
        }

        function showMessage(text, type) {
            const msg = document.getElementById('message');
            msg.textContent = text;
            msg.className = 'message ' + type;
            msg.style.display = 'block';
            setTimeout(() => msg.style.display = 'none', 5000);
        }

        async function loadStats() {
            const stats = await apiCall('/stats');
            document.getElementById('totalProducts').textContent = stats.total_products || 0;
            document.getElementById('totalReviews').textContent = stats.total_reviews || 0;
            document.getElementById('pendingReviews').textContent = stats.pending || 0;
            document.getElementById('processingReviews').textContent = stats.processing || 0;
            document.getElementById('completedReviews').textContent = stats.completed || 0;
            document.getElementById('failedReviews').textContent = stats.failed || 0;
        }

        async function loadProducts() {
            const search = document.getElementById('productSearch').value;
            const data = await apiCall('/products?page=' + productsPage + '&limit=20&search=' + encodeURIComponent(search));
            
            const tbody = document.getElementById('productsTable');
            if (data.products.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">No products found</td></tr>';
            } else {
                tbody.innerHTML = data.products.map(p => \`
                    <tr>
                        <td><code>\${p.asin}</code></td>
                        <td>\${p.title || '-'}</td>
                        <td>\${p.rating || '-'}</td>
                        <td>\${p.total_reviews || 0}</td>
                        <td>\${new Date(p.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="btn" onclick="viewReviews('\${p.asin}')" style="padding:5px 10px;">View Reviews</button>
                        </td>
                    </tr>
                \`).join('');
            }
            
            renderPagination('products', data.total, productsPage);
        }

        async function loadReviews() {
            const asin = document.getElementById('reviewAsinFilter').value;
            const status = document.getElementById('reviewStatusFilter').value;
            
            let url = '/reviews?page=' + reviewsPage + '&limit=20';
            if (asin) url += '&asin=' + encodeURIComponent(asin);
            if (status) url += '&status=' + encodeURIComponent(status);
            
            const data = await apiCall(url);
            
            const tbody = document.getElementById('reviewsTable');
            if (data.reviews.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;">No reviews found</td></tr>';
            } else {
                tbody.innerHTML = data.reviews.map(r => \`
                    <tr>
                        <td>\${r.id}</td>
                        <td><code>\${r.asin}</code></td>
                        <td>\${r.reviewer_name || '-'}</td>
                        <td>\${r.rating || '-'}★</td>
                        <td class="review-body" title="\${(r.body || '').replace(/"/g, '&quot;')}">\${r.body || '-'}</td>
                        <td class="review-body" title="\${(r.ai_body || '').replace(/"/g, '&quot;')}">\${r.ai_body || '-'}</td>
                        <td><span class="status-badge status-\${r.ai_status}">\${r.ai_status}</span></td>
                        <td>\${new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                \`).join('');
            }
            
            renderPagination('reviews', data.total, reviewsPage);
        }

        function renderPagination(type, total, currentPage) {
            const totalPages = Math.ceil(total / 20);
            const container = document.getElementById(type + 'Pagination');
            
            if (totalPages <= 1) {
                container.innerHTML = '';
                return;
            }
            
            let html = '';
            for (let i = 1; i <= totalPages; i++) {
                if (i === currentPage) {
                    html += \`<button class="active">\${i}</button>\`;
                } else {
                    html += \`<button onclick="goToPage('\${type}', \${i})">\${i}</button>\`;
                }
            }
            
            container.innerHTML = html;
        }

        function goToPage(type, page) {
            if (type === 'products') {
                productsPage = page;
                loadProducts();
            } else {
                reviewsPage = page;
                loadReviews();
            }
        }

        function searchProducts() {
            productsPage = 1;
            loadProducts();
        }

        function viewReviews(asin) {
            switchTab('reviews');
            document.getElementById('reviewAsinFilter').value = asin;
            loadReviews();
        }

        function switchTab(tab) {
            currentTab = tab;
            
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            
            document.getElementById('productsPanel').style.display = tab === 'products' ? 'block' : 'none';
            document.getElementById('reviewsPanel').style.display = tab === 'reviews' ? 'block' : 'none';
            
            if (tab === 'products') {
                loadProducts();
            } else {
                loadReviews();
            }
        }

        async function startProcessing() {
            const batchSize = parseInt(document.getElementById('batchSize').value) || 5;
            const result = await apiCall('/process/start', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({batchSize})
            });
            
            if (result.processed > 0) {
                showMessage(\`Processing \${result.processed} reviews...\`, 'success');
                refreshData();
                
                // Auto-refresh while processing
                if (processingInterval) clearInterval(processingInterval);
                processingInterval = setInterval(refreshData, 3000);
            } else {
                showMessage(result.message || 'No pending reviews', 'success');
            }
        }

        async function stopProcessing() {
            if (processingInterval) {
                clearInterval(processingInterval);
                processingInterval = null;
            }
            
            const result = await apiCall('/process/stop', {method: 'POST'});
            showMessage(\`Stopped processing. Reset \${result.reset} reviews.\`, 'success');
            refreshData();
        }

        async function reprocessFailed() {
            const result = await apiCall('/process/reprocess-failed', {method: 'POST'});
            showMessage(\`Reset \${result.reset} failed reviews to pending.\`, 'success');
            refreshData();
        }

        async function refreshData() {
            await loadStats();
            
            if (currentTab === 'products') {
                await loadProducts();
            } else {
                await loadReviews();
            }
        }

        // Initial load
        refreshData();
        
        // Auto-refresh stats every 10 seconds
        //setInterval(loadStats, 10000);
    </script>
</body>
</html>`;

	return new Response(html, {
		headers: { 'Content-Type': 'text/html' },
	});
}
