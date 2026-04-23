import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { z } from 'zod';

interface Env {
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  AI_SUMMARY_MODEL?: string;
}

const InputSchema = z.object({
  placeName: z.string().min(1).max(200),
  reviews: z
    .array(
      z.object({
        text: z.string().min(1).max(5000),
        rating: z.number().min(0).max(5).optional(),
      }),
    )
    .min(1)
    .max(20),
  locale: z.enum(['en', 'ja', 'zh']).default('en'),
});

const SYSTEM = `You summarize café reviews for someone deciding whether to meet a friend there.

Style:
- Reply in the user's locale.
- Max 2 short lines, <= 120 chars total.
- Focus on: atmosphere (quiet/lively), seating room, wifi reliability, food/coffee quality, crowd patterns.
- Use middle-dot (·) to join phrases, not bullets or newlines within a line.
- No star ratings, no marketing filler, no "users say", no hedging like "it seems".

Only state things grounded in the supplied reviews. If reviews disagree, prefer the most recent-sounding signal.`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return jsonError('GOOGLE_GENERATIVE_AI_API_KEY not configured', 500);
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
    const { text } = await generateText({
      model: google(env.AI_SUMMARY_MODEL ?? 'gemini-2.5-flash'),
      system: SYSTEM,
      prompt: `User locale: ${input.locale}\n\nCafé: ${input.placeName}\n\nReviews:\n${input.reviews
        .map(
          (r, i) =>
            `[${i + 1}]${r.rating != null ? ` (${r.rating.toFixed(1)}★)` : ''} ${r.text}`,
        )
        .join('\n\n')}`,
      temperature: 0.4,
    });

    return Response.json(
      { summary: text.trim() },
      {
        headers: {
          // Summaries for a specific place_id are stable; a CDN layer can cache.
          'cache-control': 'public, max-age=2592000, s-maxage=2592000',
          'access-control-allow-origin': '*',
        },
      },
    );
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Upstream model error', 502);
  }
};

export const onRequestOptions: PagesFunction = () =>
  new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  });

function jsonError(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { 'access-control-allow-origin': '*' } },
  );
}
