import { strFromU8, unzipSync } from 'fflate';

export function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, '/')
		.replace(/&nbsp;/g, ' ');
}

export async function parseWebhookBody(request: Request): Promise<any[]> {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
		const buffer = new Uint8Array(await request.arrayBuffer());
		const files = unzipSync(buffer);
		const results: any[] = [];

		for (const filename in files) {
			const content = strFromU8(files[filename]);
			const lines = content.split('\n').filter(Boolean);

			for (const line of lines) {
				try {
					results.push(JSON.parse(line));
				} catch (err) {
					console.error('Invalid JSONL line:', line.substring(0, 100));
				}
			}
		}

		return results;
	}

	const text = await request.text();
	return text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => {
			try {
				return JSON.parse(l);
			} catch {
				return null;
			}
		})
		.filter(Boolean);
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
