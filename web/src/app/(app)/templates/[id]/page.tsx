'use client';

import { useState, useRef, useCallback, useEffect, memo, useMemo } from 'react';
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
  Play, Link2, Unlink2, Check,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import {
  ExerciseSelector,
  type ExerciseSelectionOptions,
} from '@/components/exercise-selector';
import { useTemplateExercises, type TemplateExerciseWithDetails } from '@/hooks/use-template-exercises';
import { useTemplates } from '@/hooks/use-templates';
import { useStartWorkout } from '@/hooks/use-start-workout';
import type { ExerciseWithSchema } from '@/types/app';
import {
  TRACKING_PRESETS,
  TRACKING_PRESET_LABELS,
  type TrackingPresetKey,
} from '@/types/tracking';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ALL_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Core', 'Calves', 'Cardio', 'Forearms'];
const PRESET_KEYS = Object.keys(TRACKING_PRESETS) as TrackingPresetKey[];

function detectPresetKey(exercise: ExerciseWithSchema): TrackingPresetKey | null {
  const fieldKeys = exercise.tracking_schema.fields.map((f) => f.key).sort().join(',');
  for (const key of PRESET_KEYS) {
    const presetKeys = TRACKING_PRESETS[key].fields.map((f) => f.key).sort().join(',');
    if (fieldKeys === presetKeys) return key;
  }
  return null;
}

// ── Sortable exercise row ─────────────────────────────────────────────────────

const SortableExerciseRow = memo(function SortableExerciseRow({
  item,
  onConfig,
  onRemove,
  supersetPosition,
}: {
  item: TemplateExerciseWithDetails;
  onConfig: () => void;
  onRemove: () => void;
  supersetPosition: 'none' | 'first' | 'middle' | 'last';
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    // Promote to own layer during drag; disable expensive backdrop-blur
    ...(isDragging ? { willChange: 'transform', backdropFilter: 'none', WebkitBackdropFilter: 'none', zIndex: 50 } : {}),
  };
  const inSuperset = supersetPosition !== 'none';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'elevated-surface flex items-center gap-4 px-4 py-4',
        isDragging && 'opacity-80 shadow-2xl ring-1 ring-primary/30',
        inSuperset && 'border-l-2 border-l-primary/60',
        supersetPosition === 'first' && 'rounded-b-none border-b-0',
        supersetPosition === 'middle' && 'rounded-none border-b-0',
        supersetPosition === 'last' && 'rounded-t-none',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-9 w-7 cursor-grab items-center justify-center rounded-2xl text-muted-foreground/50 active:cursor-grabbing touch-none hover:bg-white/[0.08]"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Exercise info — tap to configure */}
      <button className="flex flex-1 min-w-0 cursor-pointer flex-col items-start gap-0.5 focus-visible:outline-none" onClick={onConfig}>
        <span className="truncate text-card-title">{item.exercise.name}</span>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex gap-1">
            {item.exercise.muscle_groups.slice(0, 2).map((m) => (
              <MuscleGroupBadge key={m} muscle={m} />
            ))}
          </div>
          <span className="text-overline">{item.default_set_count} sets</span>
        </div>
      </button>

      <button onClick={onConfig} aria-label="Configure exercise" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-white/10 text-muted-foreground active:bg-white/[0.08] hover:bg-white/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Settings2 className="h-4 w-4" />
      </button>
      <button onClick={onRemove} aria-label="Remove exercise" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-white/10 text-muted-foreground active:bg-destructive/10 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
});

// ── Superset link button between exercise rows ────────────────────────────────

function SupersetLinkButton({
  linked,
  onToggle,
}: {
  linked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={linked ? 'Unlink superset' : 'Link as superset'}
      className={cn(
        'mx-auto flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        linked
          ? 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/25'
          : 'border-white/10 bg-white/[0.04] text-muted-foreground hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground',
      )}
    >
      {linked ? <Unlink2 className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
      {linked ? 'Unlink' : 'Superset'}
    </button>
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
  onSave: (templatePatch: { default_set_count?: number }, exercisePatch: { name?: string; muscle_groups?: string[]; tracking_schema?: { fields: { key: string; label: string; type: 'number' | 'text'; optional: boolean; unit?: string }[] }; notes?: string | null } | null) => void;
}) {
  const [sets, setSets] = useState(item?.default_set_count ?? 3);
  const [name, setName] = useState(item?.exercise.name ?? '');
  const [muscles, setMuscles] = useState<string[]>(item?.exercise.muscle_groups ?? []);
  const [preset, setPreset] = useState<TrackingPresetKey>(
    (item ? detectPresetKey(item.exercise) : null) ?? 'WEIGHT_REPS',
  );
  const [exerciseNotes, setExerciseNotes] = useState(item?.exercise.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setSets(item.default_set_count);
      setName(item.exercise.name);
      setMuscles(item.exercise.muscle_groups);
      setPreset(detectPresetKey(item.exercise) ?? 'WEIGHT_REPS');
      setExerciseNotes(item.exercise.notes ?? '');
    }
  }, [item]);

  function toggleMuscle(m: string) {
    setMuscles((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      // Check if exercise-level fields changed
      const exerciseChanged = item && (
        name.trim() !== item.exercise.name
        || JSON.stringify(muscles) !== JSON.stringify(item.exercise.muscle_groups)
        || preset !== (detectPresetKey(item.exercise) ?? 'WEIGHT_REPS')
        || (exerciseNotes.trim() || null) !== (item.exercise.notes ?? null)
      );

      onSave(
        { default_set_count: sets },
        exerciseChanged ? {
          name: name.trim(),
          muscle_groups: muscles,
          tracking_schema: TRACKING_PRESETS[preset],
          notes: exerciseNotes.trim() || null,
        } : null,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <SheetContent side="bottom" className="flex !h-[100dvh] flex-col p-0">
        <SheetHeader className="border-b border-border px-4 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <SheetTitle>Edit Exercise</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-8 pt-4 gap-6">
          {/* Exercise name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Exercise name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-xl border-white/10 bg-white/[0.06] px-4 text-base"
            />
          </div>

          {/* Muscle groups */}
          <div className="space-y-2.5">
            <label className="text-sm font-semibold">
              Muscle groups
              {muscles.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {muscles.length} selected
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_MUSCLES.map((m) => {
                const selected = muscles.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMuscle(m)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-150',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-[0_0_12px_-3px_oklch(0.75_0.18_55/0.4)]'
                        : 'border border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground',
                    )}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tracking type */}
          <div className="space-y-2.5">
            <label className="text-sm font-semibold">What do you track?</label>
            <div className="grid grid-cols-2 gap-2.5">
              {PRESET_KEYS.map((key) => {
                const selected = preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-all duration-150',
                      selected
                        ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_-4px_oklch(0.75_0.18_55/0.3)]'
                        : 'border-white/[0.08] bg-white/[0.04] text-foreground hover:border-white/[0.14] hover:bg-white/[0.07]',
                    )}
                  >
                    {selected && (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <span>{TRACKING_PRESET_LABELS[key]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Starting sets */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Starting sets</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSets((v) => Math.max(1, v - 1))}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 text-xl hover:bg-white/[0.08]"
              >
                −
              </button>
              <span className="flex-1 text-center font-display text-2xl font-semibold">{sets}</span>
              <button
                onClick={() => setSets((v) => Math.min(20, v + 1))}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 text-xl hover:bg-white/[0.08]"
              >
                +
              </button>
            </div>
          </div>

          {/* Exercise notes */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Exercise notes <span className="font-normal text-muted-foreground">(shown during workout)</span></label>
            <textarea
              value={exerciseNotes}
              onChange={(e) => setExerciseNotes(e.target.value)}
              placeholder="reps = each arm, use slow eccentric…"
              rows={2}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/40 focus-visible:outline-none"
            />
          </div>

          {/* Save button */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
            className="premium-button mt-auto justify-center disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
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
  const { exercises, isLoading, fetchTemplateExercises, addExercise, removeExercise, updateExercise, reorderExercises } =
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

  const sortableIds = useMemo(() => exercises.map((e) => e.id), [exercises]);

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

  async function toggleSupersetLink(indexA: number, indexB: number) {
    const a = exercises[indexA];
    const b = exercises[indexB];
    if (!a || !b) return;

    const sameGroup = a.superset_group_id && a.superset_group_id === b.superset_group_id;

    if (sameGroup) {
      // Unlink: check if removing this link splits a group
      const groupId = a.superset_group_id!;
      const groupMembers = exercises.filter((e) => e.superset_group_id === groupId);
      if (groupMembers.length <= 2) {
        // Only 2 members — remove group from both
        try {
          await Promise.all(
            groupMembers.map((e) => updateExercise(e.id, { superset_group_id: null })),
          );
        } catch { toast.error('Failed to unlink'); }
      } else {
        // Split: remove group from b and everything after b in the group
        try {
          const bIdx = exercises.indexOf(b);
          const toUnlink = exercises.filter(
            (e, i) => e.superset_group_id === groupId && i >= bIdx,
          );
          await Promise.all(
            toUnlink.map((e) => updateExercise(e.id, { superset_group_id: null })),
          );
        } catch { toast.error('Failed to unlink'); }
      }
    } else {
      // Link: use existing group if one has one, otherwise create new
      const groupId = a.superset_group_id ?? b.superset_group_id ?? crypto.randomUUID();
      try {
        const updates: Promise<void>[] = [];
        if (a.superset_group_id !== groupId) updates.push(updateExercise(a.id, { superset_group_id: groupId }));
        if (b.superset_group_id !== groupId) updates.push(updateExercise(b.id, { superset_group_id: groupId }));
        await Promise.all(updates);
      } catch { toast.error('Failed to link'); }
    }
  }

  function getSupersetPosition(index: number): 'none' | 'first' | 'middle' | 'last' {
    const item = exercises[index];
    if (!item?.superset_group_id) return 'none';
    const gid = item.superset_group_id;
    const prev = exercises[index - 1]?.superset_group_id === gid;
    const next = exercises[index + 1]?.superset_group_id === gid;
    if (prev && next) return 'middle';
    if (prev) return 'last';
    if (next) return 'first';
    return 'none'; // solo member — shouldn't happen but safe
  }

  async function handleConfigSave(
    templatePatch: { default_set_count?: number; notes?: string | null },
    exercisePatch: { name?: string; muscle_groups?: string[]; tracking_schema?: { fields: { key: string; label: string; type: 'number' | 'text'; optional: boolean; unit?: string }[] }; notes?: string | null } | null,
  ) {
    if (!configItem) return;
    try {
      // Update template_exercises row (set count, template notes)
      await updateExercise(configItem.id, templatePatch);

      // Update exercises row if exercise-level fields changed
      if (exercisePatch) {
        const { error: dbErr } = await supabase
          .from('exercises')
          .update(exercisePatch)
          .eq('id', configItem.exercise_id);
        if (dbErr) throw dbErr;

        // Re-fetch to sync the joined exercise data
        await fetchTemplateExercises(id);
      }
    } catch { toast.error('Failed to save'); }
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
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          {saveStatus === 'saved' && <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">Saved</span>}
          <button
            onClick={() => void handleStartWorkout()}
            disabled={isStartingWorkout || exercises.length === 0}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {exercises.map((item, index) => {
                      const pos = getSupersetPosition(index);
                      const showLabel = pos === 'first';
                      const showLinkButton = index < exercises.length - 1;
                      const isLinkedWithNext = item.superset_group_id != null &&
                        item.superset_group_id === exercises[index + 1]?.superset_group_id;

                      return (
                        <div key={item.id}>
                          {showLabel && (
                            <div className="mb-1 flex items-center gap-2 px-1">
                              <Link2 className="h-3 w-3 text-primary" />
                              <span className="text-xs font-semibold text-primary">Superset</span>
                            </div>
                          )}
                          <SortableExerciseRow
                            item={item}
                            supersetPosition={pos}
                            onConfig={() => {
                              setConfigItem(item);
                              setConfigOpen(true);
                            }}
                            onRemove={() => void handleRemove(item.id)}
                          />
                          {showLinkButton && (
                            <div className="flex justify-center py-1">
                              <SupersetLinkButton
                                linked={isLinkedWithNext}
                                onToggle={() => void toggleSupersetLink(index, index + 1)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {exercises.length === 0 && !isLoading && (
              <div className="content-card py-10 text-center">
                <p className="text-card-title">No exercises yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your first exercise below.</p>
              </div>
            )}
        </section>

        {/* Add exercise */}
        <ExerciseSelector
          onSelect={handleAddExercise}
          defaultMode="create"
          trigger={
            <button className="list-row w-full">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[oklch(0.75_0.18_55/0.15)] text-primary">
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
