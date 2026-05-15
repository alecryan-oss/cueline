// Sentence-aware text splitter for KB ingest. Dependency-free.
//
// Strategy: split into sentences via punctuation regex, group sentences into
// chunks targeting ~400 tokens (~1600 chars at ~4 chars/token), with one
// sentence of overlap between adjacent prose chunks. A trailing chunk smaller
// than `minChars` is merged into the previous one to avoid stub chunks.
//
// TODO(rag): docs/rag.md says "no overlap on Q&A pairs". Add a Q&A detector
// (lines starting with `Q:` / `A:` or `Question:` / `Answer:`) before the
// sentence split and emit each pair as its own chunk.

export type ChunkOptions = {
  /** Target chunk size in tokens. Default 400 → ~1600 chars. */
  targetTokens?: number;
  /** Sentences of overlap between adjacent chunks. Default 1. */
  overlapSentences?: number;
  /** Below this character count, a trailing chunk is merged back. Default 800. */
  minChars?: number;
};

const CHARS_PER_TOKEN = 4;

export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const targetChars = (opts.targetTokens ?? 400) * CHARS_PER_TOKEN;
  const overlap = Math.max(0, opts.overlapSentences ?? 1);
  const minChars = opts.minChars ?? 800;

  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let i = 0;
  while (i < sentences.length) {
    const startIdx = i;
    const buf: string[] = [];
    let len = 0;
    while (i < sentences.length && len < targetChars) {
      const sentence = sentences[i]!;
      buf.push(sentence);
      len += sentence.length + 1;
      i++;
    }
    chunks.push(buf.join(' '));
    // Step back for overlap, but always make forward progress past startIdx.
    if (i < sentences.length) {
      i = Math.max(i - overlap, startIdx + 1);
    }
  }

  // Merge a runt tail back into its predecessor.
  if (chunks.length > 1) {
    const tail = chunks[chunks.length - 1]!;
    if (tail.length < minChars) {
      const prev = chunks[chunks.length - 2]!;
      chunks.splice(chunks.length - 2, 2, `${prev} ${tail}`);
    }
  }

  return chunks;
}
