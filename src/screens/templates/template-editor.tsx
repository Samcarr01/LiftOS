/**
 * TemplateEditor
 *
 * Edit a workout template: rename it, add / remove / reorder exercises,
 * configure each exercise's set count, rest timer, and superset group.
 *
 * Key behaviours:
 *  - Template name auto-saves (debounced 500ms)
 *  - Exercise list is drag-to-reorder (DraggableFlatList)
 *  - Reorder is optimistic: local state updates instantly, DB syncs in background
 *  - Tap exercise row → bottom sheet config (set count, rest, superset, notes)
 *  - Add Exercise → registers callback + navigates to ExerciseSelector
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useTemplates } from '@/hooks/use-templates';
import { useTemplateExercises, type TemplateExerciseWithDetails, type UpdateTemplateExercisePatch } from '@/hooks/use-template-exercises';
import { MuscleGroupChip } from '@/components/muscle-group-chip';
import { supabase } from '@/lib/supabase';
import {
  registerExerciseCallback,
} from '@/store/exercise-selection-store';
import type { WorkoutTemplateRow } from '@/types/database';

// ── Superset colour ────────────────────────────────────────────────────────────

const SUPERSET_COLORS = ['#a3e635', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b'];

function supersetColor(groupId: string): string {
  const hash = groupId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return SUPERSET_COLORS[hash % SUPERSET_COLORS.length];
}

// ── Config bottom sheet ────────────────────────────────────────────────────────

interface ConfigSheetProps {
  item: TemplateExerciseWithDetails | null;
  onClose: () => void;
  onUpdate: (id: string, patch: UpdateTemplateExercisePatch) => void;
  onRemove: (id: string) => void;
}

function ConfigSheet({ item, onClose, onUpdate, onRemove }: ConfigSheetProps) {
  const [setCount, setSetCount] = useState(item?.default_set_count ?? 3);
  const [restSecs, setRestSecs] = useState(item?.rest_seconds ?? null);
  const [supersetGroup, setSupersetGroup] = useState(item?.superset_group_id ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');

  // Sync when item changes (opening a different exercise)
  useEffect(() => {
    if (item) {
      setSetCount(item.default_set_count);
      setRestSecs(item.rest_seconds);
      setSupersetGroup(item.superset_group_id ?? '');
      setNotes(item.notes ?? '');
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;

  const handleDone = () => {
    onUpdate(item.id, {
      default_set_count: setCount,
      rest_seconds: restSecs,
      superset_group_id: supersetGroup.trim() || null,
      notes: notes.trim() || null,
    });
    onClose();
  };

  const handleRemove = () => {
    onClose();
    Alert.alert(
      'Remove Exercise',
      `Remove "${item.exercise.name}" from this template?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemove(item.id),
        },
      ],
    );
  };

  const restStr = restSecs !== null ? String(restSecs) : '';

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.sheetOverlay} onPress={handleDone}>
        <Pressable style={styles.sheetCard} onPress={() => {}}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          <Text style={styles.sheetTitle} numberOfLines={1}>
            {item.exercise.name}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
            {/* Set count */}
            <Text style={styles.sheetLabel}>Sets</Text>
            <View style={styles.stepperRow}>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setSetCount((v) => Math.max(1, v - 1))}
              >
                <Ionicons name="remove" size={20} color="#fafafa" />
              </Pressable>
              <Text style={styles.stepperValue}>{setCount}</Text>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setSetCount((v) => Math.min(20, v + 1))}
              >
                <Ionicons name="add" size={20} color="#fafafa" />
              </Pressable>
            </View>

            {/* Rest timer */}
            <Text style={[styles.sheetLabel, styles.labelSpacing]}>Rest Timer (seconds)</Text>
            <View style={styles.stepperRow}>
              <Pressable
                style={styles.stepperBtn}
                onPress={() =>
                  setRestSecs((v) => (v !== null ? Math.max(0, v - 15) : null))
                }
                disabled={restSecs === null}
              >
                <Ionicons name="remove" size={20} color={restSecs === null ? '#3f3f46' : '#fafafa'} />
              </Pressable>
              <TextInput
                style={styles.restInput}
                value={restStr}
                onChangeText={(v) => setRestSecs(v === '' ? null : Math.max(0, parseInt(v, 10) || 0))}
                keyboardType="number-pad"
                maxLength={3}
                textAlign="center"
                placeholder="—"
                placeholderTextColor="#52525b"
              />
              <Pressable
                style={styles.stepperBtn}
                onPress={() =>
                  setRestSecs((v) => (v !== null ? Math.min(600, v + 15) : 60))
                }
              >
                <Ionicons name="add" size={20} color="#fafafa" />
              </Pressable>
            </View>

            {/* Superset group */}
            <Text style={[styles.sheetLabel, styles.labelSpacing]}>Superset Group</Text>
            <TextInput
              style={styles.sheetInput}
              value={supersetGroup}
              onChangeText={setSupersetGroup}
              placeholder="e.g. A  (leave blank for none)"
              placeholderTextColor="#52525b"
              autoCapitalize="characters"
              maxLength={10}
            />
            {supersetGroup.trim() ? (
              <View style={[styles.supersetPreview, { borderLeftColor: supersetColor(supersetGroup.trim()) }]}>
                <Text style={styles.supersetPreviewText}>
                  Group {supersetGroup.trim()} colour preview
                </Text>
              </View>
            ) : null}

            {/* Notes */}
            <Text style={[styles.sheetLabel, styles.labelSpacing]}>Notes (optional)</Text>
            <TextInput
              style={[styles.sheetInput, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Form cues, weight targets…"
              placeholderTextColor="#52525b"
              multiline
              numberOfLines={3}
              maxLength={500}
              textAlignVertical="top"
            />

            {/* Remove button */}
            <Pressable style={styles.removeBtn} onPress={handleRemove}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={styles.removeBtnText}>Remove from Template</Text>
            </Pressable>

            <View style={styles.sheetPad} />
          </ScrollView>

          <Pressable style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Exercise row (draggable) ────────────────────────────────────────────────────

interface ExerciseRowProps {
  item: TemplateExerciseWithDetails;
  drag: () => void;
  isActive: boolean;
  onConfigure: (item: TemplateExerciseWithDetails) => void;
}

function ExerciseRow({ item, drag, isActive, onConfigure }: ExerciseRowProps) {
  const hasSuperSet = !!item.superset_group_id;
  const borderColor = hasSuperSet ? supersetColor(item.superset_group_id!) : 'transparent';
  const groups = item.exercise.muscle_groups.slice(0, 2);

  return (
    <ScaleDecorator activeScale={0.97}>
      <Pressable
        style={[
          styles.exerciseRow,
          isActive && styles.exerciseRowActive,
          hasSuperSet && { borderLeftColor: borderColor },
        ]}
        onPress={() => onConfigure(item)}
        onLongPress={drag}
        delayLongPress={200}
      >
        {/* Superset left border (always shown, transparent if no group) */}
        <View style={[styles.supersetBorder, { backgroundColor: borderColor }]} />

        {/* Info */}
        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName} numberOfLines={1}>
            {item.exercise.name}
          </Text>
          <View style={styles.exerciseMeta}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.default_set_count} sets</Text>
            </View>
            {item.rest_seconds !== null && (
              <View style={styles.badge}>
                <Ionicons name="time-outline" size={11} color="#71717a" />
                <Text style={styles.badgeText}>{item.rest_seconds}s</Text>
              </View>
            )}
            {groups.map((g) => (
              <MuscleGroupChip key={g} group={g} small />
            ))}
          </View>
        </View>

        {/* Drag handle */}
        <Ionicons name="reorder-three-outline" size={22} color="#52525b" />
      </Pressable>
    </ScaleDecorator>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface TemplateEditorProps {
  templateId: string;
}

export function TemplateEditor({ templateId }: TemplateEditorProps) {
  const { updateTemplateName } = useTemplates();
  const { exercises, isLoading, addExercise, removeExercise, updateExercise, reorderExercises } =
    useTemplateExercises(templateId);

  const [templateName, setTemplateName] = useState('');
  const [templateLoading, setTemplateLoading] = useState(true);
  const [configItem, setConfigItem] = useState<TemplateExerciseWithDetails | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Load template ────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data } = (await supabase
        .from('workout_templates')
        .select('*')
        .eq('id', templateId)
        .single()) as { data: WorkoutTemplateRow | null; error: unknown };
      if (data) setTemplateName(data.name);
      setTemplateLoading(false);
    };
    void load();
  }, [templateId]);

  // ── Name auto-save (debounced 500ms) ─────────────────────────────────────

  const handleNameChange = useCallback(
    (value: string) => {
      setTemplateName(value);
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        if (value.trim()) {
          void updateTemplateName(templateId, value);
        }
      }, 500);
    },
    [templateId, updateTemplateName],
  );

  // ── Add exercise via ExerciseSelector ────────────────────────────────────

  const handleAddExercise = useCallback(() => {
    registerExerciseCallback((exercise) => {
      void addExercise(templateId, exercise);
    });
    router.push('/(tabs)/templates/exercise-selector' as never);
  }, [templateId, addExercise]);

  // ── Reorder ───────────────────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    ({ data }: { data: TemplateExerciseWithDetails[] }) => {
      void reorderExercises(
        templateId,
        data.map((e) => e.id),
      );
    },
    [templateId, reorderExercises],
  );

  // ── Render item ───────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<TemplateExerciseWithDetails>) => (
      <ExerciseRow
        item={item}
        drag={drag}
        isActive={isActive}
        onConfigure={setConfigItem}
      />
    ),
    [],
  );

  // ── Handle config update ──────────────────────────────────────────────────

  const handleUpdate = useCallback(
    (id: string, patch: UpdateTemplateExercisePatch) => {
      void updateExercise(id, patch);
    },
    [updateExercise],
  );

  const handleRemove = useCallback(
    (id: string) => {
      void removeExercise(id);
    },
    [removeExercise],
  );

  if (templateLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#a3e635" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fafafa" />
          </Pressable>
          <TextInput
            style={styles.nameInput}
            value={templateName}
            onChangeText={handleNameChange}
            placeholder="Template name…"
            placeholderTextColor="#52525b"
            autoCapitalize="words"
            maxLength={100}
            returnKeyType="done"
          />
        </View>

        {/* Hint */}
        {exercises.length > 1 && (
          <Text style={styles.dragHint}>Hold and drag to reorder</Text>
        )}

        {/* Exercise list */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#a3e635" />
          </View>
        ) : (
          <DraggableFlatList
            data={exercises}
            onDragEnd={handleDragEnd}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="barbell-outline" size={48} color="#27272a" />
                <Text style={styles.emptyTitle}>No exercises yet</Text>
                <Text style={styles.emptySubtitle}>
                  Tap "Add Exercise" below to build your template
                </Text>
              </View>
            }
          />
        )}

        {/* Add exercise button */}
        <View style={styles.addExerciseBar}>
          <Pressable style={styles.addExerciseBtn} onPress={handleAddExercise}>
            <Ionicons name="add-circle" size={22} color="#09090b" />
            <Text style={styles.addExerciseText}>Add Exercise</Text>
          </Pressable>
        </View>

        {/* Config sheet */}
        <ConfigSheet
          item={configItem}
          onClose={() => setConfigItem(null)}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#09090b' },
  container: { flex: 1, backgroundColor: '#09090b' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    gap: 8,
  },
  backBtn: { padding: 4 },
  nameInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#fafafa',
    paddingVertical: 4,
  },

  // Drag hint
  dragHint: {
    fontSize: 12,
    color: '#3f3f46',
    textAlign: 'center',
    paddingVertical: 6,
    fontStyle: 'italic',
  },

  // Exercise list
  listContent: { flexGrow: 1, paddingBottom: 16 },
  separator: { height: 1, backgroundColor: '#18181b', marginHorizontal: 16 },

  // Exercise row
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#09090b',
    gap: 10,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  exerciseRowActive: { backgroundColor: '#18181b', opacity: 0.95 },
  supersetBorder: { width: 3, height: '100%', borderRadius: 2, marginRight: 2 },
  exerciseInfo: { flex: 1, gap: 6 },
  exerciseName: { fontSize: 16, fontWeight: '600', color: '#fafafa' },
  exerciseMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#27272a',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, color: '#a1a1aa', fontWeight: '600' },

  // Empty state
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#71717a' },
  emptySubtitle: { fontSize: 14, color: '#52525b', textAlign: 'center', maxWidth: 240 },

  // Center (loading)
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Add exercise bar
  addExerciseBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    backgroundColor: '#09090b',
  },
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#a3e635',
    borderRadius: 14,
    paddingVertical: 14,
  },
  addExerciseText: { color: '#09090b', fontWeight: '700', fontSize: 16 },

  // Config sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 0,
    maxHeight: '80%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#27272a',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#fafafa', marginBottom: 4 },
  sheetScroll: { maxHeight: 400 },
  sheetLabel: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginBottom: 8 },
  labelSpacing: { marginTop: 20 },

  // Stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 24, fontWeight: '700', color: '#fafafa', minWidth: 40, textAlign: 'center' },
  restInput: {
    width: 72,
    backgroundColor: '#09090b',
    borderRadius: 10,
    paddingVertical: 10,
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },

  // Superset
  sheetInput: {
    backgroundColor: '#09090b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fafafa',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  supersetPreview: {
    marginTop: 8,
    borderLeftWidth: 4,
    borderRadius: 4,
    paddingLeft: 10,
    paddingVertical: 6,
    backgroundColor: '#09090b',
  },
  supersetPreviewText: { fontSize: 12, color: '#71717a' },

  // Notes
  notesInput: { height: 72, paddingTop: 10, textAlignVertical: 'top' },

  // Remove
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
  },
  removeBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },

  sheetPad: { height: 20 },

  // Done button
  doneBtn: {
    backgroundColor: '#a3e635',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginVertical: 16,
  },
  doneBtnText: { color: '#09090b', fontWeight: '700', fontSize: 16 },
});
