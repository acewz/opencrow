/**
 * Embedding generator with OpenRouter API provider
 * Reuses existing memory/embeddings.ts infrastructure
 */

import { createLogger } from "../logger";
import { createEmbeddingProvider } from "../memory/embeddings";

const log = createLogger("embedding-generator");

// OpenRouter configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Cached provider instance
let embeddingProvider: ReturnType<typeof createEmbeddingProvider> | null = null;

/**
 * Get or create the embedding provider instance
 */
function getProvider(): ReturnType<typeof createEmbeddingProvider> {
  if (!embeddingProvider) {
    if (!OPENROUTER_API_KEY) {
      throw new Error(
        "OPENROUTER_API_KEY not set, embedding generation unavailable",
      );
    }
    embeddingProvider = createEmbeddingProvider(OPENROUTER_API_KEY);
  }
  return embeddingProvider;
}

/**
 * Generate embedding for a single text
 * Uses OpenRouter API (text-embedding-3-small, 512 dimensions)
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const provider = getProvider();

  try {
    const embeddings = await provider.embed([text]);
    const embedding = embeddings[0];
    if (!embedding) {
      throw new Error("Failed to generate embedding - empty response");
    }
    return embedding;
  } catch (err) {
    log.error("Embedding generation failed", { error: String(err) });
    throw err;
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<Float32Array[]> {
  const provider = getProvider();
  return provider.embed(texts);
}
