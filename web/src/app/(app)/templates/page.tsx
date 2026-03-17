'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pin, PinOff, Copy, Trash2, MoreHorizontal, Dumbbell, Loader2, Play, Library } from 'lucide-react';
import { useStartWorkout } from '@/hooks/use-start-workout';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTemplates, type TemplateWithCount } from '@/hooks/use-templates';
import { formatDistanceToNow } from '@/lib/format-date';
import { toast } from 'sonner';

// ── Create template dialog ────────────────────────────────────────────────────

function CreateTemplateRow({
  onCreate,
  autoOpen = false,
}: {
  onCreate: (name: string) => Promise<unknown>;
  autoOpen?: boolean;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoOpened = useRef(false);

  function open() {
    setIsCreating(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  useEffect(() => {
    if (!autoOpen || hasAutoOpened.current) return;
    hasAutoOpened.current = true;
    open();
  }, [autoOpen]);

  async function handleSave() {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onCreate(name.trim());
      setName('');
      setIsCreating(false);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Failed to create workout');
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void handleSave();
    if (e.key === 'Escape') { setIsCreating(false); setName(''); }
  }

  if (isCreating) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-card p-3">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Workout name…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={() => { setIsCreating(false); setName(''); }}
          className="text-xs text-muted-foreground hover:text-foreground px-2"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
          Create
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={open}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Plus className="h-4 w-4" />
      Create workout
    </button>
  );
}

// ── Template row ──────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onDelete,
  onDuplicate,
  onTogglePin,
}: {
  template: TemplateWithCount;
  onDelete: () => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
}) {
  const exerciseLabel = `${template.exercise_count} exercise${template.exercise_count !== 1 ? 's' : ''}`;
  const lastUsed = template.last_used_at ? formatDistanceToNow(template.last_used_at) : 'Never used';
  const { startWorkout } = useStartWorkout();
  const [starting, setStarting] = useState(false);

  async function handleStart(e: React.MouseEvent) {
    e.preventDefault();
    setStarting(true);
    try { await startWorkout(template.id); }
    finally { setStarting(false); }
  }

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-border/80 hover:bg-card/80">
      {/* Icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Dumbbell className="h-4 w-4 text-primary" />
      </div>

      {/* Name + meta — tap to open editor */}
      <Link href={`/templates/${template.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{template.name}</p>
          {template.is_pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {exerciseLabel} · {lastUsed}
        </p>
      </Link>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={starting}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        title="Start workout"
      >
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Start
      </button>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onTogglePin} className="gap-2">
            {template.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {template.is_pinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate} className="gap-2">
            <Copy className="h-4 w-4" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const router = useRouter();
  const { templates, isLoading, createTemplate, deleteTemplate, duplicateTemplate, togglePin } =
    useTemplates();
  const [autoOpenCreate, setAutoOpenCreate] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') !== '1') return;
    setAutoOpenCreate(true);
    window.history.replaceState({}, '', '/templates');
  }, []);

  const pinned = templates.filter((t) => t.is_pinned);
  const all    = templates.filter((t) => !t.is_pinned);

  async function handleCreate(name: string) {
    const template = await createTemplate(name);
    router.push(`/templates/${template.id}`);
    return template;
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteTemplate(id);
      toast.success('Workout deleted');
    } catch {
      toast.error('Failed to delete workout');
    }
  }

  async function handleDuplicate(id: string) {
    try {
      await duplicateTemplate(id);
      toast.success('Workout duplicated');
    } catch {
      toast.error('Failed to duplicate workout');
    }
  }

  async function handleTogglePin(id: string) {
    try { await togglePin(id); } catch { toast.error('Failed to update pin'); }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h1 className="text-2xl font-bold tracking-tight">Workouts</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Create your own workout, add the exercises you actually use, then start it any time without rebuilding the session from scratch.
        </p>
        <div className="mt-4">
          <Link
            href="/exercises"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <Library className="h-4 w-4 text-primary" />
            Manage Exercises
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned section */}
          {pinned.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pinned</h2>
              {pinned.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  onDelete={() => void handleDelete(t.id, t.name)}
                  onDuplicate={() => void handleDuplicate(t.id)}
                  onTogglePin={() => void handleTogglePin(t.id)}
                />
              ))}
            </section>
          )}

          {/* All templates */}
          <section className="space-y-2">
            {pinned.length > 0 && (
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">All Workouts</h2>
            )}
            {all.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onDelete={() => void handleDelete(t.id, t.name)}
                onDuplicate={() => void handleDuplicate(t.id)}
                onTogglePin={() => void handleTogglePin(t.id)}
              />
            ))}
            {templates.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <Dumbbell className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">No workouts yet</p>
                  <p className="text-sm text-muted-foreground">Create your first saved workout below</p>
                </div>
              </div>
            )}
            <CreateTemplateRow onCreate={handleCreate} autoOpen={autoOpenCreate} />
          </section>
        </div>
      )}
    </div>
  );
}
