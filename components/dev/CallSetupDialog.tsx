'use client';

import { useState } from 'react';

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

export type CallTypeOption = {
  value: string;
  label: string;
  goalPlaceholder: string;
};

const CALL_TYPE_OPTIONS: CallTypeOption[] = [
  {
    value: 'discovery',
    label: 'Discovery call',
    goalPlaceholder: 'e.g. Qualify their pain points, current stack, and budget range',
  },
  {
    value: 'sales_pitch',
    label: 'Sales pitch',
    goalPlaceholder: 'e.g. Get them excited enough to book a demo with their VP',
  },
  {
    value: 'demo',
    label: 'Demo',
    goalPlaceholder: 'e.g. Walk through live-call assist, address questions, get to ROI',
  },
  {
    value: 'follow_up',
    label: 'Follow-up',
    goalPlaceholder: "e.g. Recap last call's open questions, push for next step",
  },
  {
    value: 'negotiation',
    label: 'Negotiation',
    goalPlaceholder: 'e.g. Defend the Growth tier price, offer 3-month pilot if needed',
  },
  {
    value: 'closing',
    label: 'Closing',
    goalPlaceholder: 'e.g. Get signature on order form, confirm onboarding start date',
  },
];

export function CallSetupDialog({
  triggerLabel,
  triggerVariant = 'default',
  triggerClassName,
  action,
  hiddenFields,
}: {
  triggerLabel: React.ReactNode;
  triggerVariant?: 'default' | 'outline' | 'secondary';
  triggerClassName?: string;
  action: (formData: FormData) => Promise<void>;
  hiddenFields?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [callType, setCallType] = useState<string>('discovery');

  const placeholder =
    CALL_TYPE_OPTIONS.find((o) => o.value === callType)?.goalPlaceholder ?? '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up the call</DialogTitle>
          <DialogDescription>
            Tell Cueline what kind of call this is and what you&apos;re trying to achieve.
            The suggestion model uses both to bias toward relevant cues.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {hiddenFields
            ? Object.entries(hiddenFields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))
            : null}
          <div className="space-y-2">
            <Label htmlFor="call_type">Call type</Label>
            <Select name="call_type" value={callType} onValueChange={setCallType}>
              <SelectTrigger id="call_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALL_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal">Goal for this call</Label>
            <Textarea
              id="goal"
              name="goal"
              rows={3}
              placeholder={placeholder}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              One line. The model uses this to interpret the prospect&apos;s words.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Start call</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
