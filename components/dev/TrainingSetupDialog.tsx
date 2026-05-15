'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TRAINING_SCENARIOS, type TrainingScenarioKey } from '@/lib/dev/trainingScenarios';
import { cn } from '@/lib/utils';

const SCENARIOS = Object.values(TRAINING_SCENARIOS);

const DIFFICULTY_BADGE: Record<string, string> = {
  easy: 'bg-intent-buying/15 text-intent-buying',
  medium: 'bg-intent-info/15 text-intent-info',
  hard: 'bg-intent-objection/15 text-intent-objection',
};

export function TrainingSetupDialog({
  triggerLabel,
  triggerVariant = 'default',
  triggerClassName,
  action,
}: {
  triggerLabel: React.ReactNode;
  triggerVariant?: 'default' | 'outline' | 'secondary';
  triggerClassName?: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<TrainingScenarioKey>('skeptical_smb');
  const [mode, setMode] = useState<'text' | 'voice'>('text');

  const selected = TRAINING_SCENARIOS[scenario];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Train with AI</DialogTitle>
          <DialogDescription>
            Pick a prospect scenario. The AI plays them, you make the pitch, and Cueline coaches
            you in real time — same pipeline as a live call.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="mode" value={mode} />

          <div className="space-y-2">
            <Label htmlFor="scenario">Scenario</Label>
            <Select
              name="scenario"
              value={scenario}
              onValueChange={(v) => setScenario(v as TrainingScenarioKey)}
            >
              <SelectTrigger id="scenario">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
              <Badge className={cn('shrink-0 text-[10px] uppercase', DIFFICULTY_BADGE[selected.difficulty])}>
                {selected.difficulty}
              </Badge>
              <p className="text-xs text-muted-foreground">{selected.description}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  mode === 'text'
                    ? 'border-brand bg-brand/5 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                )}
              >
                <div className="font-medium">Type to chat</div>
                <div className="text-[11px]">Keyboard input</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('voice')}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  mode === 'voice'
                    ? 'border-brand bg-brand/5 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                )}
              >
                <div className="font-medium">🎤 Voice (Chrome/Edge)</div>
                <div className="text-[11px]">Mic + speakers</div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">Your goal for this practice call (optional)</Label>
            <Textarea
              id="goal"
              name="goal"
              rows={2}
              placeholder="e.g. Get past the pricing objection without dropping the price"
              maxLength={500}
            />
          </div>

          <input type="hidden" name="call_type" value="discovery" />

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Start training</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
