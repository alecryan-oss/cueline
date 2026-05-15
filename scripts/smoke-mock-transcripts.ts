// Validates the mock transcripts meet spec: ≥12 turns, ≥6 filler from contact,
// and prints the cumulative timeline so we can eyeball pacing.
import { MOCK_TRANSCRIPTS } from '../lib/dev/mockTranscripts';

const FILLER_RE = /^(yeah|yep|mm-?hm|ok(ay)?|right|sure|cool|got it|likewise|alright)\.?$/i;

let failed = 0;
for (const [name, turns] of Object.entries(MOCK_TRANSCRIPTS)) {
  const fillerFromContact = turns.filter(
    (t) => t.speaker === 'contact' && FILLER_RE.test(t.text.trim()),
  ).length;
  const totalDelay = turns.reduce((s, t) => s + t.delayMs, 0);
  const ok = turns.length >= 12 && fillerFromContact >= 6;
  console.log(
    `${ok ? '✓' : '✗'} ${name}: turns=${turns.length}, filler-contact=${fillerFromContact}, total_runtime=${(totalDelay / 1000).toFixed(1)}s`,
  );
  if (!ok) failed++;
}
process.exit(failed > 0 ? 1 : 0);
