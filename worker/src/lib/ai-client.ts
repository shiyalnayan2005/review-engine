export async function generateAIReview(env: Env, input: { title: string; body: string; rating: number }): Promise<string> {
	const prompt = `Rewrite this Amazon review to sound like a natural human wrote it. Keep the same meaning and rating (${input.rating} stars). Make it conversational and authentic.

Original Title: ${input.title || 'No title'}
Original Review: ${input.body || 'No content'}

Return only the rewritten review text, no JSON or extra formatting.`;

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }],
				generationConfig: {
					temperature: 0.7,
					maxOutputTokens: 500,
				},
			}),
		},
	);

	const data: any = await response.json();
	return data?.candidates?.[0]?.content?.parts?.[0]?.text || input.body;
}
