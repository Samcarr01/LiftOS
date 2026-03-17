'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Trash2, ChevronLeft, Plus, Loader2, Settings2,
  Play,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { ExerciseSelector } from '@/components/exercise-selector';
import { useTemplateExercises, type TemplateExerciseWithDetails } from '@/hooks/use-template-exercises';
import { useTemplates } from '@/hooks/use-templates';
import { useStartWorkout } from '@/hooks/use-start-workout';
import type { ExerciseWithSchema } from '@/types/app';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Sortable exercise row ─────────────────────────────────────────────────────

function SortableExerciseRow({
  item,
  onConfig,
  onRemove,
}: {
  item: TemplateExerciseWithDetails;
  onConfig: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-shadow',
        isDragging && 'opacity-50 shadow-lg',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-8 w-6 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Exercise info — tap to configure */}
      <button className="flex flex-1 min-w-0 flex-col items-start gap-0.5" onClick={onConfig}>
        <span className="truncate text-sm font-medium">{item.exercise.name}</span>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {item.exercise.muscle_groups.slice(0, 2).map((m) => (
              <MuscleGroupBadge key={m} muscle={m} />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{item.default_set_count} sets</span>
        </div>
      </button>

      <button onClick={onConfig} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
        <Settings2 className="h-4 w-4" />
      </button>
      <button onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Exercise config sheet ─────────────────────────────────────────────────────

function ExerciseConfigSheet({
  item,
  open,
  onClose,
  onSave,
}: {
  item: TemplateExerciseWithDetails | null;
  open: boolean;
  onClose: () => void;
  onSave: (patch: { default_set_count?: number; notes?: string | null }) => void;
}) {
  const [sets, setSets] = useState(item?.default_set_count ?? 3);
  const [notes, setNotes] = useState(item?.notes ?? '');

  useEffect(() => {
    if (item) { setSets(item.default_set_count); setNotes(item.notes ?? ''); }
  }, [item]);

  function save() {
    onSave({ default_set_count: sets, notes: notes.trim() || null });
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <SheetTitle className="text-left">{item?.exercise.name}</SheetTitle>
          {item && item.exercise.muscle_groups.length > 0 && (
            <div className="flex gap-1 mt-1">
              {item.exercise.muscle_groups.map((m) => <MuscleGroupBadge key={m} muscle={m} />)}
            </div>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Set count */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Sets</label>
            <div className="mt-1.5 flex items-center gap-4">
              <button
                onClick={() => setSets((v) => Math.max(1, v - 1))}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-xl hover:bg-muted"
              >
                −
              </button>
              <span className="flex-1 text-center text-2xl font-bold">{sets}</span>
              <button
                onClick={() => setSets((v) => Math.min(20, v + 1))}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-xl hover:bg-muted"
              >
                +
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Form cues, target weight…"
              rows={2}
              className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <button
            onClick={save}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { startWorkout } = useStartWorkout();
  const { updateTemplateName } = useTemplates();
  const { exercises, isLoading, addExercise, removeExercise, updateExercise, reorderExercises } =
    useTemplateExercises(id);

  // Template name with debounced auto-save
  const [templateName, setTemplateName] = useState('');
  const [isFetchingName, setIsFetchingName] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Config sheet state
  const [configItem, setConfigItem] = useState<TemplateExerciseWithDetails | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);

  // Fetch template name
  useEffect(() => {
    if (!id) return;
    setIsFetchingName(true);
    void (async () => {
      try {
        const { data } = await supabase.from('workout_templates').select('name').eq('id', id).single();
        if (data) setTemplateName(data.name);
      } finally {
        setIsFetchingName(false);
      }
    })();
  }, [id, supabase]);

  // Debounced name save
  const handleNameChange = useCallback((value: string) => {
    setTemplateName(value);
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await updateTemplateName(id, value);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch {
        setSaveStatus('idle');
        toast.error('Failed to save name');
      }
    }, 500);
  }, [id, updateTemplateName]);

  // DnD sensors — both pointer (mouse) and touch
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = exercises.findIndex((e) => e.id === active.id);
    const newIndex = exercises.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(exercises, oldIndex, newIndex);
    void reorderExercises(id, reordered.map((e) => e.id));
  }

  async function handleAddExercise(exercise: ExerciseWithSchema) {
    try {
      await addExercise(id, exercise);
    } catch {
      toast.error('Failed to add exercise');
    }
  }

  async function handleRemove(itemId: string) {
    try { await removeExercise(itemId); } catch { toast.error('Failed to remove exercise'); }
  }

  async function handleConfigSave(patch: Parameters<typeof updateExercise>[1]) {
    if (!configItem) return;
    try { await updateExercise(configItem.id, patch); } catch { toast.error('Failed to save'); }
  }

  async function handleStartWorkout() {
    if (exercises.length === 0) return;
    setIsStartingWorkout(true);
    try {
      await startWorkout(id);
    } finally {
      setIsStartingWorkout(false);
    }
  }

  if (isFetchingName) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <input
          value={templateName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Workout name"
          className="flex-1 bg-transparent text-xl font-bold tracking-tight outline-none placeholder:text-muted-foreground"
        />

        {saveStatus === 'saving' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        {saveStatus === 'saved' && <span className="shrink-0 text-xs text-muted-foreground">Saved</span>}
      </div>

      <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-semibold">Build this workout your way</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Add the exercises you actually do. Creating your own exercise is the default, and you can still switch to the library inside the picker.
        </p>
      </div>

      <div className="mb-5 rounded-2xl border border-border bg-card p-4">
        <button
          onClick={() => void handleStartWorkout()}
          disabled={isStartingWorkout || exercises.length === 0}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStartingWorkout ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Start This Workout
        </button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {exercises.length === 0
            ? 'Add at least one exercise before starting.'
            : 'Ready when you are. What you log here becomes the baseline for the next AI suggestion.'}
        </p>
      </div>

      {/* Exercise list */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {exercises.map((item) => (
                <SortableExerciseRow
                  key={item.id}
                  item={item}
                  onConfig={() => { setConfigItem(item); setConfigOpen(true); }}
                  onRemove={() => void handleRemove(item.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {exercises.length === 0 && !isLoading && (
        <div className="mb-4 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-semibold">This workout is empty</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Add your first exercise below. Weight and reps, laps, time, or distance all work.
          </p>
        </div>
      )}

      {/* Add Exercise */}
      <div className="mt-4">
        <ExerciseSelector
          onSelect={handleAddExercise}
          defaultMode="create"
          trigger={
            <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
              <Plus className="h-4 w-4" /> Create Or Add Exercise
            </button>
          }
        />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Your own exercises come first. You can switch to the library inside the sheet if you want.
        </p>
      </div>

      {/* Exercise config sheet */}
      <ExerciseConfigSheet
        item={configItem}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSave={handleConfigSave}
      />
    </div>
  );
}
