import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { rateLimit, rateLimitResponse } from '../../_lib/rateLimit';

interface Env {
  ANTHROPIC_API_KEY: string;
  AI_PARSE_MODEL?: string;
}

const InputSchema = z.object({
  query: z.string().min(1).max(500),
  locale: z.enum(['en', 'ja', 'zh']).default('en'),
});

const OutputSchema = z.object({
  mode: z.enum(['meetup', 'nearby', 'unknown']),
  addressA: z.string().optional(),
  addressB: z.string().optional(),
  filters: z.object({
    openNow: z.boolean().optional(),
    minRating: z.number().min(0).max(5).optional(),
    priceLevelMax: z.number().int().min(0).max(4).optional(),
    radiusKm: z.number().positive().max(20).optional(),
  }),
  vibe: z.string().max(60).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
});

const SYSTEM = `You extract meetup search parameters from a user's natural-language request.

Rules:
- mode='meetup' when two locations are given; 'nearby' when the user wants places near themselves or a single point; 'unknown' if ambiguous.
- addressA / addressB: copy the place names verbatim, in the user's language. Do NOT translate or normalize.
- filters.openNow: true only if the user explicitly references "now", "tonight", "right now", "still open".
- filters.minRating: 4.0 for "good"/"nice"; 4.3 for "best"/"top-rated"; omit otherwise.
- filters.priceLevelMax: 0=free, 1=$, 2=$$, 3=$$$, 4=$$$$. Omit unless user signals budget ("cheap"→1, "upscale"→3).
- filters.radiusKm: 1-2 if user wants "close to midpoint" / "walking distance"; 5+ for "somewhere flexible"; omit otherwise.
- vibe: ONE short phrase, free-text, user's language. Examples: "quiet, long-stay", "lively, date-night", "good for work".
- confidence: 'high' when both addresses are clear; 'medium' when one is a district/landmark; 'low' when guessing.

Never invent addresses that aren't in the user's text.`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonError('ANTHROPIC_API_KEY not configured', 500);
  }

  const limit = await rateLimit(request, { waitUntil }, {
    bucket: 'parse',
    limit: 60,
    windowSec: 60 * 60,
  });
  if (!limit.ok) return rateLimitResponse(limit);

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  try {
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const { object } = await generateObject({
      model: anthropic(env.AI_PARSE_MODEL ?? 'claude-sonnet-4-6'),
      schema: OutputSchema,
      system: SYSTEM,
      prompt: `User locale: ${input.locale}\nQuery: ${input.query}`,
      temperature: 0.2,
    });

    return Response.json(object, {
      headers: {
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    });
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
