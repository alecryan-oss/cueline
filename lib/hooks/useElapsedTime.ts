'use client';

import { useEffect, useState } from 'react';

/**
 * Returns "MM:SS" elapsed since `startTime`. Ticks every second while the
 * call is active; if `endTime` is provided, freezes at the duration between
 * start and end.
 */
export function useElapsedTime(
  startTime: string | Date,
  endTime?: string | Date | null,
): string {
  const start = toMs(startTime);
  const end = endTime ? toMs(endTime) : null;

  const [now, setNow] = useState<number>(() => end ?? Date.now());

  useEffect(() => {
    if (end !== null) {
      setNow(end);
      return;
    }
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);

  const totalSec = Math.max(0, Math.floor((now - start) / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function toMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
