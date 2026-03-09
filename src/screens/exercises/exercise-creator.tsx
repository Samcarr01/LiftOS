/**
 * ExerciseCreator
 *
 * Screen for creating (and editing) a custom exercise.
 *
 * Sections:
 *  1. Name
 *  2. Muscle groups (multi-select chips)
 *  3. Tracking type (5 presets + Custom)
 *  4. Custom field builder (only visible in Custom mode)
 *  5. Set preview (live preview of what a set row looks like)
 *  6. Default rest timer (seconds)
 *  7. Notes
 *
 * Validation: ExerciseCreateSchema (Zod) runs before save.
 * On success: calls onSave callback or navigates back.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useExercises } from '@/hooks/use-exercises';
import { MuscleGroupChip } from '@/components/muscle-group-chip';
import { TrackingSchemaValidator } from '@/lib/validation';
import { Analytics } from '@/lib/analytics';
import {
  WEIGHT_REPS,
  BODYWEIGHT_REPS,
  TIME,
  DISTANCE,
  LAPS,
  TRACKING_PRESETS,
} from '@/types';
import type { TrackingField, TrackingSchema, TrackingPresetKey, ExerciseWithSchema } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'cardio', 'other'];

type TrackingMode = TrackingPresetKey | 'CUSTOM';

interface TrackingModeOption {
  key: TrackingMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TRACKING_MODE_OPTIONS: TrackingModeOption[] = [
  { key: 'WEIGHT_REPS',     label: 'Weight + Reps', icon: 'barbell-outline' },
  { key: 'BODYWEIGHT_REPS', label: 'Bodyweight',     icon: 'person-outline' },
  { key: 'TIME',            label: 'Time',           icon: 'time-outline' },
  { key: 'DISTANCE',        label: 'Distance',       icon: 'navigate-outline' },
  { key: 'LAPS',            label: 'Laps',           icon: 'repeat-outline' },
  { key: 'CUSTOM',          label: 'Custom',         icon: 'construct-outline' },
];

interface BlankField {
  key: string;
  label: string;
  type: 'number' | 'text';
  unit: string;
  optional: boolean;
}

function blankField(): BlankField {
  return { key: '', label: '', type: 'number', unit: '', optional: false };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ExerciseCreatorProps {
  /** Called with the newly created exercise. If omitted, navigates back. */
  onSave?: (exercise: ExerciseWithSchema) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExerciseCreator({ onSave }: ExerciseCreatorProps) {
  const { createExercise } = useExercises();

  // ── Form state ─────────────────────────────────────────────────────────────

  const [name, setName] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('WEIGHT_REPS');
  const [customFields, setCustomFields] = useState<BlankField[]>([blankField()]);
  const [restSeconds, setRestSeconds] = useState('90');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [schemaError, setSchemaError] = useState('');

  // ── Derived tracking schema ────────────────────────────────────────────────

  const currentSchema = useMemo<TrackingSchema | null>(() => {
    if (trackingMode === 'CUSTOM') {
      const fields = customFields
        .filter((f) => f.key.trim() && f.label.trim())
        .map<TrackingField>((f) => ({
          key: f.key.trim().toLowerCase().replace(/\s+/g, '_'),
          label: f.label.trim(),
          type: f.type,
          ...(f.unit.trim() ? { unit: f.unit.trim() } : {}),
          optional: f.optional,
        }));
      if (fields.length === 0) return null;
      const result = TrackingSchemaValidator.safeParse({ fields });
      return result.success ? result.data : null;
    }
    return TRACKING_PRESETS[trackingMode as TrackingPresetKey];
  }, [trackingMode, customFields]);

  // ── Muscle group toggle ────────────────────────────────────────────────────

  const toggleGroup = useCallback((group: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  }, []);

  // ── Custom field helpers ───────────────────────────────────────────────────

  const addField = useCallback(() => {
    setCustomFields((prev) => [...prev, blankField()]);
  }, []);

  const removeField = useCallback((index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateField = useCallback((index: number, patch: Partial<BlankField>) => {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    let valid = true;

    // Name validation
    if (!name.trim()) {
      setNameError('Exercise name is required.');
      valid = false;
    } else {
      setNameError('');
    }

    // Schema validation
    if (!currentSchema) {
      setSchemaError(
        trackingMode === 'CUSTOM'
          ? 'Add at least one valid field (key + label required).'
          : 'Select a tracking type.',
      );
      valid = false;
    } else {
      setSchemaError('');
    }

    if (!valid || !currentSchema) return;

    setIsSaving(true);
    try {
      const exercise = await createExercise({
        name: name.trim(),
        muscle_groups: Array.from(selectedGroups),
        tracking_schema: currentSchema,
        unit_config: {},
        default_rest_seconds: Math.max(0, Math.min(600, parseInt(restSeconds, 10) || 90)),
        notes: notes.trim() || null,
      });

      Analytics.exerciseCreated({
        muscle_groups:  Array.from(selectedGroups),
        tracking_mode:  trackingMode,
      });
      if (onSave) {
        onSave(exercise);
      } else {
        router.back();
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Failed to save exercise.';
      Alert.alert('Save Failed', msg);
    } finally {
      setIsSaving(false);
    }
  }, [name, currentSchema, selectedGroups, restSeconds, notes, trackingMode, createExercise, onSave]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fafafa" />
          </Pressable>
          <Text style={styles.headerTitle}>New Exercise</Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#09090b" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Name ─────────────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Exercise Name</Text>
          <TextInput
            style={[styles.input, !!nameError && styles.inputError]}
            value={name}
            onChangeText={(v) => { setName(v); if (nameError) setNameError(''); }}
            placeholder="e.g. Barbell Bench Press"
            placeholderTextColor="#52525b"
            autoCapitalize="words"
            returnKeyType="done"
            maxLength={100}
          />
          {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}

          {/* ── Muscle Groups ─────────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Muscle Groups</Text>
          <View style={styles.chipWrap}>
            {MUSCLE_GROUPS.map((group) => (
              <MuscleGroupChip
                key={group}
                group={group}
                selected={selectedGroups.has(group)}
                onPress={() => toggleGroup(group)}
              />
            ))}
          </View>

          {/* ── Tracking Type ─────────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Tracking Type</Text>
          <View style={styles.trackingGrid}>
            {TRACKING_MODE_OPTIONS.map((opt) => {
              const active = trackingMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.trackingCard, active && styles.trackingCardActive]}
                  onPress={() => {
                    setTrackingMode(opt.key);
                    setSchemaError('');
                  }}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={active ? '#09090b' : '#a1a1aa'}
                  />
                  <Text style={[styles.trackingLabel, active && styles.trackingLabelActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!!schemaError && <Text style={styles.errorText}>{schemaError}</Text>}

          {/* ── Custom Field Builder ──────────────────────────────────────── */}
          {trackingMode === 'CUSTOM' && (
            <View style={styles.customBuilder}>
              <Text style={styles.sectionLabel}>Custom Fields</Text>
              {customFields.map((field, index) => (
                <View key={index} style={styles.fieldRow}>
                  <View style={styles.fieldInputs}>
                    {/* Key */}
                    <View style={styles.fieldCell}>
                      <Text style={styles.fieldCellLabel}>Key</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={field.key}
                        onChangeText={(v) => updateField(index, { key: v })}
                        placeholder="reps"
                        placeholderTextColor="#52525b"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    {/* Label */}
                    <View style={styles.fieldCell}>
                      <Text style={styles.fieldCellLabel}>Label</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={field.label}
                        onChangeText={(v) => updateField(index, { label: v })}
                        placeholder="Reps"
                        placeholderTextColor="#52525b"
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                  <View style={styles.fieldOptions}>
                    {/* Type toggle */}
                    <View style={styles.typeToggle}>
                      {(['number', 'text'] as const).map((t) => (
                        <Pressable
                          key={t}
                          style={[
                            styles.typeBtn,
                            field.type === t && styles.typeBtnActive,
                          ]}
                          onPress={() => updateField(index, { type: t })}
                        >
                          <Text
                            style={[
                              styles.typeBtnText,
                              field.type === t && styles.typeBtnTextActive,
                            ]}
                          >
                            {t === 'number' ? '123' : 'ABC'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {/* Unit */}
                    <TextInput
                      style={[styles.fieldInput, styles.unitInput]}
                      value={field.unit}
                      onChangeText={(v) => updateField(index, { unit: v })}
                      placeholder="unit"
                      placeholderTextColor="#52525b"
                      autoCapitalize="none"
                    />
                    {/* Optional toggle */}
                    <View style={styles.optionalRow}>
                      <Text style={styles.optionalLabel}>Optional</Text>
                      <Switch
                        value={field.optional}
                        onValueChange={(v) => updateField(index, { optional: v })}
                        trackColor={{ false: '#27272a', true: '#a3e635' }}
                        thumbColor="#fafafa"
                      />
                    </View>
                    {/* Remove */}
                    {customFields.length > 1 && (
                      <Pressable onPress={() => removeField(index)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
              <Pressable style={styles.addFieldBtn} onPress={addField}>
                <Ionicons name="add-circle-outline" size={18} color="#a3e635" />
                <Text style={styles.addFieldText}>Add Field</Text>
              </Pressable>
            </View>
          )}

          {/* ── Set Preview ───────────────────────────────────────────────── */}
          {currentSchema && (
            <View style={styles.previewSection}>
              <Text style={styles.sectionLabel}>Set Preview</Text>
              <Text style={styles.previewCaption}>What a set row will look like</Text>
              <View style={styles.previewRow}>
                <View style={styles.previewSetNum}>
                  <Text style={styles.previewSetNumText}>1</Text>
                </View>
                {currentSchema.fields.map((field) => (
                  <View key={field.key} style={styles.previewField}>
                    <Text style={styles.previewValue}>
                      {field.type === 'number' ? (field.unit === 'seconds' ? '60' : field.unit === 'metres' ? '1000' : '8') : 'text'}
                    </Text>
                    <Text style={styles.previewUnit}>
                      {field.unit ?? field.label.toLowerCase()}
                      {field.optional ? '?' : ''}
                    </Text>
                  </View>
                ))}
                <View style={styles.previewCheck}>
                  <Ionicons name="checkmark-circle" size={24} color="#a3e635" />
                </View>
              </View>
            </View>
          )}

          {/* ── Default Rest ──────────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Default Rest (seconds)</Text>
          <View style={styles.restRow}>
            <Pressable
              style={styles.restStepBtn}
              onPress={() => setRestSeconds((v) => String(Math.max(0, (parseInt(v, 10) || 90) - 15)))}
            >
              <Ionicons name="remove" size={20} color="#fafafa" />
            </Pressable>
            <TextInput
              style={styles.restInput}
              value={restSeconds}
              onChangeText={setRestSeconds}
              keyboardType="number-pad"
              maxLength={3}
              textAlign="center"
            />
            <Pressable
              style={styles.restStepBtn}
              onPress={() => setRestSeconds((v) => String(Math.min(600, (parseInt(v, 10) || 90) + 15)))}
            >
              <Ionicons name="add" size={20} color="#fafafa" />
            </Pressable>
            <Text style={styles.restLabel}>sec</Text>
          </View>

          {/* ── Notes ─────────────────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any cues, form notes, or reminders…"
            placeholderTextColor="#52525b"
            multiline
            numberOfLines={3}
            maxLength={500}
            textAlignVertical="top"
          />

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#09090b' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#fafafa',
    marginLeft: 8,
  },
  saveBtn: {
    backgroundColor: '#a3e635',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#09090b', fontWeight: '700', fontSize: 14 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 8 },

  // Section labels
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginBottom: 8 },
  sectionSpacing: { marginTop: 20 },

  // Name input
  input: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fafafa',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { color: '#ef4444', fontSize: 12, marginTop: 4 },

  // Muscle group chips
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // Tracking type grid (2 columns)
  trackingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trackingCard: {
    width: '31%',
    aspectRatio: 1.4,
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  trackingCardActive: {
    backgroundColor: '#a3e635',
    borderColor: '#a3e635',
  },
  trackingLabel: { fontSize: 11, fontWeight: '600', color: '#a1a1aa', textAlign: 'center' },
  trackingLabelActive: { color: '#09090b' },

  // Custom field builder
  customBuilder: { marginTop: 20, gap: 12 },
  fieldRow: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 12,
    gap: 10,
  },
  fieldInputs: { flexDirection: 'row', gap: 8 },
  fieldCell: { flex: 1, gap: 4 },
  fieldCellLabel: { fontSize: 11, color: '#71717a', fontWeight: '500' },
  fieldInput: {
    backgroundColor: '#09090b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#fafafa',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  fieldOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  typeToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden' },
  typeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3f3f46',
  },
  typeBtnActive: { backgroundColor: '#a3e635' },
  typeBtnText: { fontSize: 12, fontWeight: '700', color: '#a1a1aa' },
  typeBtnTextActive: { color: '#09090b' },
  unitInput: { flex: 1, maxWidth: 80 },
  optionalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionalLabel: { fontSize: 12, color: '#71717a' },
  addFieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    borderStyle: 'dashed',
    justifyContent: 'center',
  },
  addFieldText: { color: '#a3e635', fontWeight: '600', fontSize: 14 },

  // Set preview
  previewSection: { marginTop: 20, gap: 6 },
  previewCaption: { fontSize: 12, color: '#52525b', marginTop: -4 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  previewSetNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSetNumText: { color: '#a1a1aa', fontSize: 13, fontWeight: '700' },
  previewField: { flex: 1, alignItems: 'center' },
  previewValue: { color: '#fafafa', fontSize: 16, fontWeight: '700' },
  previewUnit: { color: '#71717a', fontSize: 11 },
  previewCheck: { marginLeft: 4 },

  // Rest timer
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restStepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restInput: {
    width: 72,
    backgroundColor: '#18181b',
    borderRadius: 10,
    paddingVertical: 10,
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  restLabel: { color: '#71717a', fontSize: 14 },

  // Notes
  notesInput: { height: 80, paddingTop: 12 },

  bottomPad: { height: 40 },
});
