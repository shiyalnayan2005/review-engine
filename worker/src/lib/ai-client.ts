export async function generateAIReview(env: Env, input: { title: string; body: string; rating: number }): Promise<string> {
	// Extract key nouns from the original review (simple approach)
	const words = (input.body || '').toLowerCase().split(/\s+/);
	const keyNouns = words
		.filter((w) => w.length > 3 && !['this', 'that', 'with', 'have', 'from', 'they', 'what', 'when'].includes(w))
		.slice(0, 5);

	const prompt = `Rewrite this product review as if a different person is describing the same experience.

    Original:
    "${input.body}"
    
    Strict rules (must follow):
    - Keep the SAME meaning and sentiment
    - Keep these keywords: ${keyNouns.join(', ')}
    - Rating remains ${input.rating} stars
    - DO NOT reuse full sentences or sentence structure
    - DO NOT keep more than 4 consecutive words from the original
    - Rewrite from scratch (not editing the original)
    - Change wording heavily (70%+ different)
    - Keep it short (1–2 sentences max)
    - Use natural, casual human tone
    - Avoid generic phrases like "This product is great"
    - Vary sentence structure (combine, split, or reorder ideas)
    
    Example transformation:
    Original:
    "This shelf is great. We bought it because we have baseboard heaters and needed something the right size that goes over the top."
    
    Good rewrite:
    "Needed something to fit over our baseboard heater and this ended up working perfectly—size is just right."
    
    Bad rewrite:
    "This shelf is great. We bought it because we have baseboard heaters..."
    
    Output ONLY the rewritten review.
  `;

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }],
				generationConfig: {
					temperature: 0.9, // Even more variety
					maxOutputTokens: 150,
				},
			}),
		},
	);

	const data: any = await response.json();
	const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || input.body;

	// If the generated text is too similar to original, return original with tiny change
	if (text === input.body || text.includes('This shelf is great')) {
		const variations = [
			input.body.replace('great', 'exactly what I needed'),
			input.body.replace('We bought it', 'Picked this up'),
			input.body.replace('works great', 'does the job perfectly'),
		];
		return variations[Math.floor(Math.random() * variations.length)];
	}

	return text.trim();
}
