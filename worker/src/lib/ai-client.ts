export async function generateAIReview(env: Env, input: { title: string; body: string; rating: number }): Promise<string> {
	// Extract key nouns from the original review (simple approach)
	const words = (input.body || '').toLowerCase().split(/\s+/);
	const keyNouns = words
		.filter((w) => w.length > 3 && !['this', 'that', 'with', 'have', 'from', 'they', 'what', 'when'].includes(w))
		.slice(0, 5);

	const prompt = `You are rewriting a product review.

    Your job is to produce a NEW version that sounds like a different person wrote it.
    
    Original:
    "${input.body}"
    
    MANDATORY RULES:
    - Keep the same meaning and sentiment
    - Keep these keywords: ${keyNouns.join(', ')}
    - Rating: ${input.rating} stars
    - DO NOT reuse sentence structure
    - DO NOT reuse phrases longer than 3 words
    - DO NOT start with similar wording
    - DO NOT keep the same sentence order
    - You MUST restructure the idea completely
    
    STYLE:
    - Casual, human, slightly imperfect
    - Can merge ideas into 1 sentence or split differently
    - Should feel like a quick personal comment
    
    LENGTH:
    - More then one line than current lines count
    
    CRITICAL:
    If your output looks similar to the original, REWRITE it again completely before returning.
    
    Example:
    Bad:
    "This shelf is great. We bought it..."
    
    Good:
    "Finding something to fit over our baseboard heater was tricky, but this ended up being the perfect size and works really well."
    
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
