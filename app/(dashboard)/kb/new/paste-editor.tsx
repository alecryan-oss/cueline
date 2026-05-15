'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { humanize } from '@/lib/utils';

import { classifyAndChunk, saveDrafts, type ClassifyState, type DraftChunk } from './actions';

export function PasteEditor() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftChunk[]>([]);
  const [classifyState, classifyAction, classifying] = useActionState<ClassifyState, FormData>(
    classifyAndChunk,
    undefined,
  );
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!classifyState) return;
    if (classifyState.ok) {
      setDrafts(classifyState.drafts);
      toast.success(`Generated ${classifyState.drafts.length} draft chunk${classifyState.drafts.length === 1 ? '' : 's'}.`);
    } else {
      toast.error(classifyState.error);
    }
  }, [classifyState]);

  const updateDraft = (id: string, patch: Partial<DraftChunk>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };
  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const onSaveAll = () => {
    if (drafts.length === 0) return;
    startSaving(async () => {
      const result = await saveDrafts(drafts);
      if (result.ok) {
        toast.success(`Saved ${result.count} chunk${result.count === 1 ? '' : 's'}.`);
        setDrafts([]);
        router.push('/kb');
      } else {
        toast.error(result.error);
      }
    });
  };

  if (drafts.length === 0) {
    return (
      <form action={classifyAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="content">Content</Label>
          <Textarea
            id="content"
            name="content"
            rows={14}
            placeholder="Paste a section of your sales playbook, an objection response, a product fact sheet…"
            required
            minLength={20}
          />
          <p className="text-xs text-muted-foreground">
            Up to 50,000 characters. Long pastes are split into ~400-token chunks.
          </p>
        </div>
        <Button type="submit" disabled={classifying}>
          {classifying ? 'Classifying…' : 'Classify & Chunk'}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Review {drafts.length} draft chunk{drafts.length === 1 ? '' : 's'}. Edit tags or remove
          any you don&apos;t want before saving.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDrafts([])} disabled={saving}>
            Discard all
          </Button>
          <Button onClick={onSaveAll} disabled={saving}>
            {saving ? 'Saving…' : `Save ${drafts.length} chunk${drafts.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {drafts.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            onTagsChange={(tags) => updateDraft(d.id, { intent_tags: tags })}
            onTitleChange={(title) => updateDraft(d.id, { title })}
            onDelete={() => removeDraft(d.id)}
            disabled={saving}
          />
        ))}
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  onTagsChange,
  onTitleChange,
  onDelete,
  disabled,
}: {
  draft: DraftChunk;
  onTagsChange: (tags: string[]) => void;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const tagsValue = draft.intent_tags.join(', ');

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`title-${draft.id}`} className="text-xs uppercase text-muted-foreground">
              Title
            </Label>
            <Input
              id={`title-${draft.id}`}
              value={draft.title}
              onChange={(e) => onTitleChange(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`tags-${draft.id}`} className="text-xs uppercase text-muted-foreground">
              Tags (comma separated)
            </Label>
            <Input
              id={`tags-${draft.id}`}
              value={tagsValue}
              onChange={(e) =>
                onTagsChange(
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              disabled={disabled}
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {draft.intent_tags.map((t) => (
                <Badge key={t} variant="secondary">
                  {humanize(t)}
                </Badge>
              ))}
            </div>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Show chunk content ({draft.content.length} chars)
            </summary>
            <p className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-3 text-sm">
              {draft.content}
            </p>
          </details>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          disabled={disabled}
          aria-label="Remove draft"
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}
