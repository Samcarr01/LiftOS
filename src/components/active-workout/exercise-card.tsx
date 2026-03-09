/**
 * ExerciseCard — one card per exercise in the active workout.
 *
 * Shows: exercise name, muscle badge, AI suggestion banner,
 * column headers (Last | Current), all set rows, Add Set + Rest timer buttons,
 * and an expandable notes section.
 *
 * Superset grouping is shown via a coloured left border.
 * Cards collapse when all sets are complete.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  LayoutAnimation,
} from 'react-native';
import { MuscleGroupChip } from '@/components/muscle-group-chip';
import { SetRow } from './set-row';
import { AISuggestionBanner } from './ai-suggestion-banner';
import { PlateauWarning } from './plateau-warning';
import { Analytics } from '@/lib/analytics';
import type { ActiveExerciseState, SetEntry, SetValues } from '@/types';

// ── Superset colours ──────────────────────────────────────────────────────────

const SUPERSET_COLORS = ['#a3e635', '#fb923c', '#c084fc', '#38bdf8', '#f472b6', '#34d399'];

function supersetColor(groupId: string | null): string | null {
  if (!groupId) return null;
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = (hash * 31 + groupId.charCodeAt(i)) | 0;
  return SUPERSET_COLORS[Math.abs(hash) % SUPERSET_COLORS.length];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  exerciseState: ActiveExerciseState;
  onAddSet: () => void;
  onUpdateSet: (setIndex: number, patch: Partial<SetEntry>) => void;
  onDeleteSet: (setIndex: number) => void;
  onCompleteSet: (setIndex: number) => void;
  onStartRest: () => void;
  onAcceptSuggestion: (values: SetValues) => void;
}

// ── ExerciseCard ──────────────────────────────────────────────────────────────

export function ExerciseCard({
  exerciseState,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onCompleteSet,
  onStartRest,
  onAcceptSuggestion,
}: ExerciseCardProps) {
  const { sessionExercise, exercise, sets, lastPerformanceSets, aiSuggestion, restTimer } =
    exerciseState;

  const [showNotes,        setShowNotes]        = useState(false);
  const [notes,            setNotes]            = useState(sessionExercise.notes ?? '');
  const [aiDismissed,      setAiDismissed]      = useState(false);
  const [plateauDismissed, setPlateauDismissed] = useState(false);
  const [collapsed,        setCollapsed]        = useState(false);

  const accentColor = supersetColor(sessionExercise.superset_group_id);
  const allComplete = sets.length > 0 && sets.every((s) => s.isCompleted);

  // Auto-collapse when all sets done
  React.useEffect(() => {
    if (allComplete && !collapsed) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCollapsed(true);
    }
  }, [allComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCollapse = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((v) => !v);
  }, []);

  const toggleNotes = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowNotes((v) => !v);
  }, []);

  // Fill next uncompleted set with suggestion values
  const handleAcceptSuggestion = useCallback(
    (values: SetValues) => {
      const nextSet = sets.find((s) => !s.isCompleted);
      if (nextSet) {
        onUpdateSet(nextSet.setIndex, {
          values: { ...nextSet.values, ...values },
        });
      }
      onAcceptSuggestion(values);
      setAiDismissed(true);
      Analytics.suggestionAccepted({ exercise_id: exercise.id });
    },
    [sets, onUpdateSet, onAcceptSuggestion, exercise.id],
  );

  const handleDismissSuggestion = useCallback(() => {
    setAiDismissed(true);
    Analytics.suggestionDismissed({ exercise_id: exercise.id });
  }, [exercise.id]);

  const fields = useMemo(() => exercise.tracking_schema.fields, [exercise.tracking_schema]);
  const restSeconds = sessionExercise.rest_seconds ?? exercise.default_rest_seconds;

  return (
    <View style={[styles.card, accentColor && { borderLeftColor: accentColor }]}>
      {/* ── Card header ──────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.header} onPress={toggleCollapse} activeOpacity={0.8}>
        <View style={styles.headerLeft}>
          <Text style={styles.exerciseName} numberOfLines={1}>{exercise.name}</Text>
          <View style={styles.chips}>
            {exercise.muscle_groups.slice(0, 3).map((mg) => (
              <MuscleGroupChip key={mg} group={mg as Parameters<typeof MuscleGroupChip>[0]['group']} small />
            ))}
            {allComplete && (
              <View style={styles.doneBadge}>
                <Text style={styles.doneText}>✓ Done</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.collapseIcon}>{collapsed ? '▼' : '▲'}</Text>
      </TouchableOpacity>

      {!collapsed && (
        <>
          {/* ── Plateau warning ───────────────────────────────────────── */}
          {aiSuggestion?.plateau_flag &&
            aiSuggestion.plateau_intervention &&
            !plateauDismissed && (
            <View style={styles.bannerWrapper}>
              <PlateauWarning
                sessionsStalled={aiSuggestion.plateau_sessions_stalled ?? 0}
                intervention={aiSuggestion.plateau_intervention}
                onDismiss={() => setPlateauDismissed(true)}
              />
            </View>
          )}

          {/* ── AI suggestion banner ──────────────────────────────────── */}
          {aiSuggestion && !aiDismissed && (
            <View style={styles.bannerWrapper}>
              <AISuggestionBanner
                suggestion={aiSuggestion}
                onAccept={handleAcceptSuggestion}
                onDismiss={handleDismissSuggestion}
              />
            </View>
          )}

          {/* ── Column headers ────────────────────────────────────────── */}
          <View style={styles.colHeader}>
            <View style={styles.typeBadgeSpace} />
            <View style={styles.lastColHeader}>
              <Text style={styles.colHeaderText}>Last</Text>
            </View>
            <View style={styles.dividerSpace} />
            <View style={styles.currentColHeader}>
              {fields.map((f) => (
                <Text key={f.key} style={styles.colHeaderText} numberOfLines={1}>
                  {f.label}
                </Text>
              ))}
            </View>
            <View style={styles.checkboxSpace} />
          </View>

          {/* ── Set rows ──────────────────────────────────────────────── */}
          {sets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              lastValues={lastPerformanceSets?.[set.setIndex - 1] ?? null}
              fields={fields}
              onUpdate={(patch) => onUpdateSet(set.setIndex, patch)}
              onDelete={() => onDeleteSet(set.setIndex)}
              onComplete={() => onCompleteSet(set.setIndex)}
            />
          ))}

          {/* ── Footer: Add Set + Rest Timer + Notes ─────────────────── */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.addSetBtn} onPress={onAddSet} activeOpacity={0.8}>
              <Text style={styles.addSetText}>+ Add Set</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.restBtn, restTimer.isRunning && styles.restBtnActive]}
              onPress={onStartRest}
              activeOpacity={0.8}
            >
              <Text style={[styles.restText, restTimer.isRunning && styles.restTextActive]}>
                {restTimer.isRunning
                  ? `⏱ ${Math.floor(restTimer.remaining / 60)}:${String(restTimer.remaining % 60).padStart(2, '0')}`
                  : `⏱ ${restSeconds}s`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notesBtn}
              onPress={toggleNotes}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.notesIcon, showNotes && styles.notesIconActive]}>≡</Text>
            </TouchableOpacity>
          </View>

          {/* ── Notes input ───────────────────────────────────────────── */}
          {showNotes && (
            <View style={styles.notesContainer}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Exercise notes…"
                placeholderTextColor="#475569"
                style={styles.notesInput}
                multiline
                numberOfLines={2}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: '#334155',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: { flex: 1, gap: 6 },
  exerciseName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  chips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  doneBadge: {
    backgroundColor: '#052e16',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  doneText: { color: '#22c55e', fontSize: 11, fontWeight: '700' },
  collapseIcon: { color: '#475569', fontSize: 12, marginLeft: 8 },

  // AI banner wrapper
  bannerWrapper: { paddingHorizontal: 12, paddingTop: 4 },

  // Column headers
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
    gap: 8,
  },
  typeBadgeSpace: { width: 36 },
  lastColHeader: { width: 72, alignItems: 'flex-end' },
  dividerSpace: { width: 1 },
  currentColHeader: { flex: 1, flexDirection: 'row', gap: 4 },
  checkboxSpace: { width: 44 },
  colHeaderText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
    textAlign: 'center',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
    gap: 8,
  },
  addSetBtn: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  addSetText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  restBtn: {
    height: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  restBtnActive: { borderColor: '#a3e635', backgroundColor: '#1a2e0a' },
  restText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  restTextActive: { color: '#a3e635' },
  notesBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notesIcon: { color: '#475569', fontSize: 20, fontWeight: '700' },
  notesIconActive: { color: '#a3e635' },

  // Notes
  notesContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  notesInput: {
    color: '#94a3b8',
    fontSize: 13,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
