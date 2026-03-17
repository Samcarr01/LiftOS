'use client';

import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Dumbbell,
  Flame,
  FolderPlus,
  Library,
  Loader2,
  MoreHorizontal,
  Pin,
  PinOff,
  Play,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStartWorkout } from '@/hooks/use-start-workout';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTemplates, type TemplateWithCount } from '@/hooks/use-templates';
import { formatDistanceToNow } from '@/lib/format-date';

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

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') void handleSave();
    if (event.key === 'Escape') {
      setIsCreating(false);
      setName('');
    }
  }

  if (isCreating) {
    return (
      <div className="premium-card page-reveal delay-2 px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary">
            <FolderPlus className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold">Name your workout</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep it plain and specific so it is easy to spot when you want to train.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Push Day, Upper A, Long Run"
            className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/15 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsCreating(false);
                setName('');
              }}
              className="premium-button-secondary flex-1 px-4"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              className="premium-button flex-1 px-4 disabled:opacity-60"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={open}
      className="premium-card page-reveal delay-2 flex w-full items-center gap-4 px-4 py-5 text-left"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary">
        <FolderPlus className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl font-semibold">Create a new workout</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Build a saved workout once, then reuse it whenever you want to log that session again.
        </p>
      </div>
      <span className="status-pill border-primary/20 bg-primary/10 text-primary">New</span>
    </button>
  );
}

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
  const { startWorkout } = useStartWorkout();
  const [starting, setStarting] = useState(false);

  async function handleStart(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setStarting(true);
    try {
      await startWorkout(template.id);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="elevated-surface page-reveal flex items-center gap-4 px-4 py-4 transition-transform duration-300 hover:-translate-y-0.5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary shadow-[0_22px_40px_-26px_rgba(91,163,255,0.8)]">
        <Dumbbell className="h-5 w-5" />
      </div>

      <Link href={`/templates/${template.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-display text-lg font-semibold">{template.name}</p>
          {template.is_pinned && (
            <span className="status-pill border-primary/20 bg-primary/10 text-primary">Pinned</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
          {template.last_used_at
            ? ` · Used ${formatDistanceToNow(template.last_used_at)}`
            : ' · Ready to start'}
        </p>
      </Link>

      <button
        onClick={handleStart}
        disabled={starting}
        className="premium-button shrink-0 px-4 py-2.5 disabled:opacity-60"
        title="Start workout"
      >
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Start
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onTogglePin} className="gap-2">
            {template.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {template.is_pinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate} className="gap-2">
            <Copy className="h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  meta,
}: {
  icon: ReactNode;
  title: string;
  meta?: string;
}) {
  return (
    <div className="section-heading">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/6 text-primary">
          {icon}
        </div>
        <div>
          <h2 className="section-title">{title}</h2>
          {meta && <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/75">{meta}</p>}
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const {
    templates,
    isLoading,
    createTemplate,
    deleteTemplate,
    duplicateTemplate,
    togglePin,
  } = useTemplates();
  const [autoOpenCreate, setAutoOpenCreate] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') !== '1') return;
    setAutoOpenCreate(true);
    window.history.replaceState({}, '', '/templates');
  }, []);

  const pinned = templates.filter((template) => template.is_pinned);
  const all = templates.filter((template) => !template.is_pinned);

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
    try {
      await togglePin(id);
    } catch {
      toast.error('Failed to update pin');
    }
  }

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7">
        <section className="page-hero">
          <span className="hero-kicker">Workouts</span>
          <h1 className="page-title mt-4">Build your repeatable training sessions</h1>
          <p className="page-subtitle mt-3">
            Create the workouts you actually run, pin the important ones, and jump straight into logging without rebuilding each session from scratch.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-[1.3fr_1fr]">
            <button
              onClick={() => setAutoOpenCreate(true)}
              className="quick-action-card page-reveal"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                <FolderPlus className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-foreground">Create Workout</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start a new saved session for lifting, runs, laps, or anything else you track.
                </p>
              </div>
            </button>

            <Link href="/exercises" className="quick-action-card page-reveal delay-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                <Library className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-foreground">Your Exercises</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Browse the exercise list you have created and clean up duplicates.
                </p>
              </div>
            </Link>
          </div>
        </section>

        <div className="mt-8 space-y-8">
          <section className="section-shell">
            <SectionHeader
              icon={<Sparkles className="h-4 w-4" />}
              title="Workout Builder"
              meta={`${templates.length} saved`}
            />
            <CreateTemplateRow onCreate={handleCreate} autoOpen={autoOpenCreate} />
          </section>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">
              {pinned.length > 0 && (
                <section className="section-shell">
                  <SectionHeader
                    icon={<Flame className="h-4 w-4" />}
                    title="Pinned Workouts"
                    meta="quick access"
                  />
                  <div className="space-y-3">
                    {pinned.map((template) => (
                      <TemplateRow
                        key={template.id}
                        template={template}
                        onDelete={() => void handleDelete(template.id, template.name)}
                        onDuplicate={() => void handleDuplicate(template.id)}
                        onTogglePin={() => void handleTogglePin(template.id)}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section className="section-shell">
                <SectionHeader
                  icon={<Dumbbell className="h-4 w-4" />}
                  title={pinned.length > 0 ? 'All Workouts' : 'Saved Workouts'}
                  meta={templates.length === 0 ? 'start here' : 'ready to log'}
                />

                {templates.length === 0 ? (
                  <div className="premium-card page-reveal delay-2 flex flex-col items-center gap-3 px-5 py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/14 text-primary">
                      <Dumbbell className="h-7 w-7" />
                    </div>
                    <h2 className="font-display text-2xl font-semibold">No workouts saved yet</h2>
                    <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                      Create your first workout above, then reuse it whenever you want to train that session again.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {all.map((template) => (
                      <TemplateRow
                        key={template.id}
                        template={template}
                        onDelete={() => void handleDelete(template.id, template.name)}
                        onDuplicate={() => void handleDuplicate(template.id)}
                        onTogglePin={() => void handleTogglePin(template.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
