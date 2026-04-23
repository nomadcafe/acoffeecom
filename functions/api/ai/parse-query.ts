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

// Hand-written JSON schema mirroring OutputSchema. Forcing tool_choice to this
// single tool is how we get structured output without pulling in the AI SDK
// (which fails to load in Cloudflare Pages Functions even with nodejs_compat).
const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['meetup', 'nearby', 'unknown'] },
    addressA: { type: 'string' },
    addressB: { type: 'string' },
    filters: {
      type: 'object',
      properties: {
        openNow: { type: 'boolean' },
        minRating: { type: 'number', minimum: 0, maximum: 5 },
        priceLevelMax: { type: 'integer', minimum: 0, maximum: 4 },
        radiusKm: { type: 'number', exclusiveMinimum: 0, maximum: 20 },
      },
    },
    vibe: { type: 'string', maxLength: 60 },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['mode', 'filters', 'confidence'],
} as const;

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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_PARSE_MODEL ?? 'claude-sonnet-4-6',
        max_tokens: 512,
        temperature: 0.2,
        system: SYSTEM,
        tools: [
          {
            name: 'parse_query',
            description: 'Emit the structured meetup search parameters for the user query.',
            input_schema: TOOL_INPUT_SCHEMA,
          },
        ],
        tool_choice: { type: 'tool', name: 'parse_query' },
        messages: [
          {
            role: 'user',
            content: `User locale: ${input.locale}\nQuery: ${input.query}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return jsonError(`Anthropic API ${res.status}: ${body.slice(0, 300)}`, 502);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; name?: string; input?: unknown }>;
    };
    const toolUse = json.content?.find((c) => c.type === 'tool_use');
    if (!toolUse?.input) {
      return jsonError('Claude returned no tool_use block', 502);
    }

    const parsed = OutputSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      return jsonError(`Output schema mismatch: ${parsed.error.message}`, 502);
    }

    return Response.json(parsed.data, {
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
