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
  ClipboardList,
  Copy,
  FolderPlus,
  Library,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStartWorkout } from '@/hooks/use-start-workout';
import { useTemplates, type TemplateWithCount } from '@/hooks/use-templates';
import { formatDistanceToNow } from '@/lib/format-date';

/**
 * Opens an action menu on long-press (touch) or right-click (pointer), while
 * leaving a normal tap free to navigate. `consumed()` reports whether the last
 * interaction was a long-press so the click handler can skip navigation.
 */
function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggered = useRef(false);

  function start() {
    triggered.current = false;
    timer.current = setTimeout(() => {
      triggered.current = true;
      onLongPress();
    }, ms);
  }
  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return {
    handlers: {
      onTouchStart: start,
      onTouchEnd: clear,
      onTouchMove: clear,
      onContextMenu: (event: MouseEvent) => {
        event.preventDefault();
        triggered.current = true;
        onLongPress();
      },
    },
    consumed: () => triggered.current,
  };
}

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
            className="h-10 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
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
  isRenaming,
  onRename,
  onCancelRename,
  onOpenActions,
}: {
  template: TemplateWithCount;
  isRenaming: boolean;
  onRename: (name: string) => Promise<void>;
  onCancelRename: () => void;
  onOpenActions: () => void;
}) {
  const router = useRouter();
  const { startWorkout } = useStartWorkout();
  const [starting, setStarting] = useState(false);
  const [renameValue, setRenameValue] = useState(template.name);
  const [savingRename, setSavingRename] = useState(false);
  const longPress = useLongPress(onOpenActions);

  async function handleStart(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setStarting(true);
    try {
      await startWorkout(template.id);
    } finally {
      setStarting(false);
    }
  }

  async function handleRenameSave() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === template.name) { onCancelRename(); return; }
    setSavingRename(true);
    try {
      await onRename(trimmed);
    } finally {
      setSavingRename(false);
    }
  }

  if (isRenaming) {
    return (
      <div className="list-row flex-col items-stretch gap-2 bg-white/[0.07]">
        <input
          autoFocus
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleRenameSave();
            if (event.key === 'Escape') onCancelRename();
          }}
          className="h-10 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-3 text-sm text-foreground outline-none focus:border-primary/50"
        />
        <div className="flex gap-2">
          <button
            onClick={() => void handleRenameSave()}
            disabled={savingRename || !renameValue.trim()}
            className="premium-button px-3 py-2 text-xs disabled:opacity-60"
          >
            {savingRename && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          <button
            onClick={onCancelRename}
            disabled={savingRename}
            className="premium-button-secondary px-3 py-2 text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="list-row items-center gap-3 bg-white/[0.07]">
      {/* Long-press / right-click the card to open actions; tap opens the editor. */}
      <button
        {...longPress.handlers}
        onClick={() => {
          if (longPress.consumed()) return;
          router.push(`/templates/${template.id}`);
        }}
        className="min-w-0 flex-1 text-left"
      >
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
      </button>

      <button
        onClick={handleStart}
        disabled={starting}
        aria-label="Start workout"
        className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Start
      </button>
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
    updateTemplateName,
  } = useTemplates();
  const [autoOpenCreate, setAutoOpenCreate] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<TemplateWithCount | null>(null);

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

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await deleteTemplate(id);
      toast.success('Workout deleted');
      setConfirmDeleteId(null);
    } catch {
      toast.error('Failed to delete workout');
    } finally {
      setDeleting(false);
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

  async function handleRename(id: string, name: string) {
    try {
      await updateTemplateName(id, name);
      setRenamingId(null);
    } catch {
      toast.error('Failed to rename workout');
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
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-2xl bg-primary px-4 text-xs font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          <div className="space-y-6">
            {/* Pinned */}
            {pinned.length > 0 && (
              <section>
                <h2 className="mb-2.5 font-display text-xl font-bold">Pinned</h2>
                <div className="space-y-2">
                  {pinned.map((template) => (
                    <TemplateRow
                      key={template.id}
                      template={template}
                      isRenaming={renamingId === template.id}
                      onRename={(name) => handleRename(template.id, name)}
                      onCancelRename={() => setRenamingId(null)}
                      onOpenActions={() => setActionsFor(template)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* All Workouts */}
            <section>
              <h2 className="mb-2.5 font-display text-xl font-bold">{pinned.length > 0 ? 'All Workouts' : 'Saved Workouts'}</h2>
              {templates.length === 0 ? (
                <div className="content-card py-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[oklch(0.75_0.18_55/0.15)]">
                    <ClipboardList className="h-6 w-6 text-primary" />
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
                      isRenaming={renamingId === template.id}
                      onRename={(name) => handleRename(template.id, name)}
                      onCancelRename={() => setRenamingId(null)}
                      onOpenActions={() => setActionsFor(template)}
                    />
                  ))}
                </div>
              )}
              {templates.length > 0 && (
                <p className="mt-2.5 px-1 text-xs text-muted-foreground">Long-press a workout for more options.</p>
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

      {/* Actions sheet — opened via long-press / right-click */}
      {actionsFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setActionsFor(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-[oklch(0.16_0.015_260)] p-2"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="truncate px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {actionsFor.name}
            </p>
            <button
              onClick={() => { void handleTogglePin(actionsFor.id); setActionsFor(null); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
            >
              {actionsFor.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              {actionsFor.is_pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={() => { setRenamingId(actionsFor.id); setActionsFor(null); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
            >
              <Pencil className="h-4 w-4" />
              Rename
            </button>
            <button
              onClick={() => { void handleDuplicate(actionsFor.id); setActionsFor(null); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </button>
            <button
              onClick={() => { setConfirmDeleteId(actionsFor.id); setActionsFor(null); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation — modal, matching the workout-history pattern */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-[oklch(0.16_0.015_260)] p-5 space-y-4">
            <h3 className="font-display text-lg font-bold">Delete workout?</h3>
            <p className="text-sm text-muted-foreground">
              &ldquo;{templates.find((t) => t.id === confirmDeleteId)?.name ?? 'This workout'}&rdquo; and its
              exercises will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void handleDelete(confirmDeleteId)}
                disabled={deleting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/90 text-sm font-semibold text-white transition-all duration-150 hover:bg-red-500 active:scale-[0.98] disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Workout
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                className="premium-button-secondary w-full justify-center disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
