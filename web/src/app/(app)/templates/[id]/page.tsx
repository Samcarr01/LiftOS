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
import {
  ExerciseSelector,
  type ExerciseSelectionOptions,
} from '@/components/exercise-selector';
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
        'elevated-surface flex items-center gap-4 px-4 py-4 transition-all duration-300',
        isDragging && 'scale-[0.99] opacity-70 shadow-2xl',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-9 w-7 cursor-grab items-center justify-center rounded-xl text-muted-foreground/50 active:cursor-grabbing touch-none hover:bg-white/5"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Exercise info — tap to configure */}
      <button className="flex flex-1 min-w-0 flex-col items-start gap-0.5" onClick={onConfig}>
        <span className="truncate font-display text-lg font-semibold">{item.exercise.name}</span>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex gap-1">
            {item.exercise.muscle_groups.slice(0, 2).map((m) => (
              <MuscleGroupBadge key={m} muscle={m} />
            ))}
          </div>
          <span className="status-pill">{item.default_set_count} sets</span>
        </div>
      </button>

      <button onClick={onConfig} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground">
        <Settings2 className="h-4 w-4" />
      </button>
      <button onClick={onRemove} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
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
      <SheetContent side="bottom" className="rounded-t-[30px] border-t border-white/10 bg-[linear-gradient(180deg,rgba(10,18,34,0.98),rgba(10,18,34,0.94))] p-0 shadow-[0_-30px_80px_-40px_rgba(2,10,28,0.95)]">
        <SheetHeader className="border-b border-white/10 px-5 pb-4 pt-6">
          <span className="hero-kicker w-fit">Exercise Settings</span>
          <SheetTitle className="font-display pt-3 text-left text-2xl">{item?.exercise.name}</SheetTitle>
          {item && item.exercise.muscle_groups.length > 0 && (
            <div className="mt-2 flex gap-1">
              {item.exercise.muscle_groups.map((m) => <MuscleGroupBadge key={m} muscle={m} />)}
            </div>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Set count */}
          <div className="premium-card px-4 py-4">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Starting Sets</label>
            <div className="mt-3 flex items-center gap-4">
              <button
                onClick={() => setSets((v) => Math.max(1, v - 1))}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-xl hover:bg-white/5"
              >
                −
              </button>
              <span className="flex-1 text-center font-display text-3xl font-semibold">{sets}</span>
              <button
                onClick={() => setSets((v) => Math.min(20, v + 1))}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-xl hover:bg-white/5"
              >
                +
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="premium-card px-4 py-4">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Form cues, target weight…"
              rows={3}
              className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus-visible:outline-none"
            />
          </div>

          <button
            onClick={save}
            className="premium-button w-full justify-center"
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

  async function handleAddExercise(
    exercise: ExerciseWithSchema,
    options: ExerciseSelectionOptions,
  ) {
    try {
      await addExercise(id, exercise, {
        default_set_count: options.defaultSetCount,
      });
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
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        {/* Compact header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            value={templateName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Workout name"
            className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold outline-none placeholder:text-muted-foreground"
          />
          {saveStatus === 'saving' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {saveStatus === 'saved' && <span className="text-xs text-emerald-400">Saved</span>}
          <button
            onClick={() => void handleStartWorkout()}
            disabled={isStartingWorkout || exercises.length === 0}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isStartingWorkout ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Start
          </button>
        </div>

        {/* Exercises */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="section-title">Exercises ({exercises.length})</h2>
          </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={exercises.map((exercise) => exercise.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {exercises.map((item) => (
                      <SortableExerciseRow
                        key={item.id}
                        item={item}
                        onConfig={() => {
                          setConfigItem(item);
                          setConfigOpen(true);
                        }}
                        onRemove={() => void handleRemove(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {exercises.length === 0 && !isLoading && (
              <div className="content-card py-8 text-center">
                <p className="text-sm font-semibold">No exercises yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Add your first exercise below.</p>
              </div>
            )}
        </section>

        {/* Add exercise */}
        <ExerciseSelector
          onSelect={handleAddExercise}
          defaultMode="create"
          trigger={
            <button className="list-row w-full">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/14 text-primary">
                <Plus className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">Add Exercise</span>
            </button>
          }
        />
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
