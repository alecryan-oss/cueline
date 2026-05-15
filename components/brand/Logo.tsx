import { AudioLinesIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Logo({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const text = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-base';
  const icon = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-6' : 'size-4';
  return (
    <div className={cn('inline-flex items-center gap-1.5 font-semibold tracking-tight', text, className)}>
      <span className="grid place-items-center rounded-md bg-brand p-1 text-brand-foreground">
        <AudioLinesIcon className={icon} />
      </span>
      <span>Cueline</span>
    </div>
  );
}
