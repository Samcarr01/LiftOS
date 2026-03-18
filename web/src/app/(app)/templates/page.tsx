'use client';

import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Copy,
  Dumbbell,
  FolderPlus,
  Library,
  Loader2,
  MoreHorizontal,
  Pin,
  PinOff,
  Play,
  Plus,
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
      <div className="content-card">
        <div className="flex items-center gap-3">
          <FolderPlus className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-semibold">Name your workout</span>
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Push Day, Upper A"
            className="h-10 flex-1 rounded-xl border border-white/10 bg-black/15 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setIsCreating(false); setName(''); }}
              className="premium-button-secondary px-3 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              className="premium-button px-3 py-2 text-xs disabled:opacity-60"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
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
    <div className="list-row items-center gap-3">
      <Link href={`/templates/${template.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-card-title">{template.name}</p>
          {template.is_pinned && (
            <Pin className="h-3 w-3 shrink-0 text-primary" />
          )}
        </div>
        <p className="mt-0.5 text-caption">
          {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
          {template.last_used_at
            ? ` · ${formatDistanceToNow(template.last_used_at)}`
            : ''}
        </p>
      </Link>

      <button
        onClick={handleStart}
        disabled={starting}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        title="Start workout"
      >
        {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Start
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
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
      <div className="page-content py-5 md:py-7 space-y-5">
        {/* Header */}
        <div className="page-header">
          <h1 className="page-header-title">Workouts</h1>
          <button
            onClick={() => setAutoOpenCreate(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        {/* Create row */}
        <CreateTemplateRow onCreate={handleCreate} autoOpen={autoOpenCreate} />

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Pinned */}
            {pinned.length > 0 && (
              <section>
                <h2 className="section-title mb-2">Pinned</h2>
                <div className="space-y-2">
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

            {/* All Workouts */}
            <section>
              <h2 className="section-title mb-2">{pinned.length > 0 ? 'All Workouts' : 'Saved Workouts'}</h2>
              {templates.length === 0 ? (
                <div className="content-card py-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Dumbbell className="h-6 w-6 text-primary" />
                  </div>
                  <p className="mt-2 text-card-title">No workouts yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Tap + New above to create your first workout.</p>
                  <button onClick={() => setAutoOpenCreate(true)} className="premium-button mt-3"><Plus className="h-4 w-4" />Create Workout</button>
                </div>
              ) : (
                <div className="space-y-2">
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

            {/* Exercise Library link */}
            <Link
              href="/exercises"
              className="action-card flex items-center gap-3 w-full"
            >
              <Library className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">Exercise Library</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
