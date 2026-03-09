/**
 * ActiveWorkout — the most critical screen in LiftOS.
 *
 * Layout:
 *  ┌─────────────────────────────┐
 *  │ [←] Template name  MM:SS [Finish] │  ← sticky header
 *  │─────────────────────────────│
 *  │ ExerciseCard 1              │
 *  │ ExerciseCard 2              │  ← scrollable
 *  │ …                           │
 *  │                             │
 *  │ [RestTimer overlay]         │  ← floating, non-blocking
 *  └─────────────────────────────┘
 *
 * Elapsed timer is computed from session.started_at timestamp each tick —
 * survives app backgrounding.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { useCompleteWorkout } from '@/hooks/use-complete-workout';
import { logSetEntry } from '@/lib/offline';
import { Analytics } from '@/lib/analytics';
import { ExerciseCard } from '@/components/active-workout/exercise-card';
import { RestTimer } from '@/components/active-workout/rest-timer';
import { FinishWorkoutDialog } from '@/components/active-workout/finish-workout-dialog';
import { formatDuration } from '@/lib/utils';
import type { SetEntry, SetValues } from '@/types';

export function ActiveWorkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const activeWorkout = useActiveWorkoutStore((s) => s.activeWorkout);
  const addSet = useActiveWorkoutStore((s) => s.addSet);
  const updateSet = useActiveWorkoutStore((s) => s.updateSet);
  const deleteSet = useActiveWorkoutStore((s) => s.deleteSet);
  const completeSet = useActiveWorkoutStore((s) => s.completeSet);
  const startRestTimer = useActiveWorkoutStore((s) => s.startRestTimer);
  const clearWorkout = useActiveWorkoutStore((s) => s.clearWorkout);

  const { completeWorkout, isCompleting } = useCompleteWorkout();

  const [elapsed, setElapsed] = useState(0);
  const [showFinish, setShowFinish] = useState(false);

  // ── Elapsed timer: timestamp-based so it survives backgrounding ──────────
  const startedAt = useMemo(
    () => (activeWorkout ? new Date(activeWorkout.session.started_at).getTime() : 0),
    [activeWorkout?.session.started_at], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick(); // immediate first tick
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // ── Finish workflow ───────────────────────────────────────────────────────
  const handleFinishConfirm = useCallback(() => {
    void completeWorkout(elapsed);
  }, [completeWorkout, elapsed]);

  const handleDiscard = useCallback(() => {
    Alert.alert(
      'Discard Workout?',
      'All logged sets will be lost.',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            clearWorkout();
            router.replace('/(tabs)');
          },
        },
      ],
    );
  }, [clearWorkout, router]);

  // ── Guard: no active workout ──────────────────────────────────────────────
  if (!activeWorkout) {
    return (
      <View style={[styles.empty, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>No active workout.</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const templateName = activeWorkout.session.template_id
    ? 'Workout'
    : 'Quick Workout';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backIconBtn}
          onPress={handleDiscard}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.templateName} numberOfLines={1}>{templateName}</Text>
          <Text style={styles.elapsedText}>{formatDuration(elapsed)}</Text>
        </View>

        <TouchableOpacity
          style={styles.finishBtn}
          onPress={() => setShowFinish(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.finishBtnText}>Finish</Text>
        </TouchableOpacity>
      </View>

      {/* ── Exercise cards ────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 }, // space for rest timer overlay
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeWorkout.exercises.length === 0 ? (
          <View style={styles.emptyExercises}>
            <Text style={styles.emptyExercisesText}>No exercises in this workout.</Text>
            <Text style={styles.emptyExercisesHint}>Use Templates to plan your session.</Text>
          </View>
        ) : (
          activeWorkout.exercises.map((ex) => (
            <ExerciseCard
              key={ex.sessionExercise.id}
              exerciseState={ex}
              onAddSet={() => addSet(ex.sessionExercise.id)}
              onUpdateSet={(setIndex, patch) => {
                updateSet(ex.sessionExercise.id, setIndex, patch);
                // Fire-and-forget: persist value changes locally
                const updatedSet = useActiveWorkoutStore
                  .getState()
                  .activeWorkout?.exercises
                  .find((e) => e.sessionExercise.id === ex.sessionExercise.id)
                  ?.sets.find((s) => s.setIndex === setIndex);
                if (updatedSet?.isCompleted) {
                  void logSetEntry(updatedSet).catch(console.warn);
                }
              }}
              onDeleteSet={(setIndex) => deleteSet(ex.sessionExercise.id, setIndex)}
              onCompleteSet={(setIndex) => {
                completeSet(ex.sessionExercise.id, setIndex);
                // Fire-and-forget: persist completed set to local DB + queue for sync
                const completedSet = useActiveWorkoutStore
                  .getState()
                  .activeWorkout?.exercises
                  .find((e) => e.sessionExercise.id === ex.sessionExercise.id)
                  ?.sets.find((s) => s.setIndex === setIndex);
                if (completedSet) {
                  void logSetEntry(completedSet).catch(console.warn);
                  const w = Number(completedSet.values['weight'] ?? 0);
                  const r = Number(completedSet.values['reps']   ?? 0);
                  Analytics.setLogged({
                    exercise_id: ex.exercise.id,
                    set_type:    completedSet.setType,
                    volume_kg:   w * r,
                  });
                }
              }}
              onStartRest={() => startRestTimer(ex.sessionExercise.id)}
              onAcceptSuggestion={(_values: SetValues) => {
                // suggestion already applied in ExerciseCard.handleAcceptSuggestion
              }}
            />
          ))
        )}
      </ScrollView>

      {/* ── Floating rest timer overlay ────────────────────────────────────── */}
      <RestTimer />

      {/* ── Finish dialog ─────────────────────────────────────────────────── */}
      <FinishWorkoutDialog
        visible={showFinish}
        workout={{ ...activeWorkout, elapsedTimer: elapsed, isCompleting }}
        onConfirm={handleFinishConfirm}
        onCancel={() => setShowFinish(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  backIconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { color: '#64748b', fontSize: 18 },
  headerCenter: { flex: 1, alignItems: 'center' },
  templateName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  elapsedText: {
    color: '#64748b',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  finishBtn: {
    backgroundColor: '#a3e635',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  finishBtnText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 12 },

  // Empty states
  empty: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: { color: '#94a3b8', fontSize: 16 },
  backBtn: {
    backgroundColor: '#a3e635',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtnText: { color: '#0f172a', fontWeight: '700' },
  emptyExercises: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyExercisesText: { color: '#64748b', fontSize: 16, fontWeight: '600' },
  emptyExercisesHint: { color: '#475569', fontSize: 13 },
});
