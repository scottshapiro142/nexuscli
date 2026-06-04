/**
 * OpenRouter sampler — the original v0.2/v0.3 path.
 *
 * Wraps the OpenAI-compatible OpenRouter endpoint. Centralizes the client,
 * default headers, model selection, and response_format handling so the four
 * generators don't each carry their own copy.
 */

import OpenAI from "openai";
import { requireOpenRouterKey } from "@/lib/kernel/config";
import type { SampleRequest, Sampler } from "../sampler";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export const openrouterSampler: Sampler = {
  kind: "openrouter",
  canSample: true,
  async complete(args: SampleRequest) {
    const apiKey = requireOpenRouterKey();
    const client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://nexus.local",
        "X-Title": "Nexus",
      },
    });

    const model = process.env.NEXUS_MODEL ?? DEFAULT_MODEL;
    const response = await client.chat.completions.create({
      model,
      max_tokens: args.maxTokens,
      ...(args.jsonObject ? { response_format: { type: "json_object" as const } } : {}),
      messages: [{ role: "user", content: args.prompt }],
    });

    return response.choices[0]?.message?.content?.trim() ?? "";
  },
};
