/**
 * RestTimer — floating non-blocking countdown overlay.
 * Appears when any exercise's restTimer.isRunning = true.
 * Ticks via setInterval; vibrates on completion.
 * Persists across scroll (rendered in the workout screen root).
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Vibration, Animated,
} from 'react-native';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { formatDuration } from '@/lib/utils';

export function RestTimer() {
  const exercises = useActiveWorkoutStore((s) => s.activeWorkout?.exercises ?? []);
  const tickRestTimer = useActiveWorkoutStore((s) => s.tickRestTimer);
  const stopRestTimer = useActiveWorkoutStore((s) => s.stopRestTimer);

  // Find the first running timer
  const running = exercises.find((ex) => ex.restTimer.isRunning);
  const prevRunningRef = useRef<typeof running>(undefined);

  // Vibrate when timer just finished
  useEffect(() => {
    if (prevRunningRef.current?.restTimer.isRunning && !running) {
      Vibration.vibrate([0, 200, 100, 200, 100, 400]);
    }
    prevRunningRef.current = running;
  });

  // Tick down every second
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      tickRestTimer(running.sessionExercise.id);
    }, 1000);
    return () => clearInterval(id);
  }, [running?.sessionExercise.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress animation
  const progressAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!running) return;
    const total = running.sessionExercise.rest_seconds ?? running.exercise.default_rest_seconds;
    const fraction = total > 0 ? running.restTimer.remaining / total : 0;
    Animated.timing(progressAnim, {
      toValue: fraction,
      duration: 950,
      useNativeDriver: false,
    }).start();
  }, [running?.restTimer.remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!running) return null;

  const { remaining } = running.restTimer;
  const totalSeconds = running.sessionExercise.rest_seconds ?? running.exercise.default_rest_seconds;
  const exerciseName = running.exercise.name;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const timerColor = remaining <= 10 ? '#f87171' : remaining <= 30 ? '#fbbf24' : '#a3e635';

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.pill}>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[styles.progressBar, { width: progressWidth, backgroundColor: timerColor }]}
          />
        </View>

        <View style={styles.content}>
          <View style={styles.info}>
            <Text style={styles.label}>REST</Text>
            <Text style={styles.exerciseLabel} numberOfLines={1}>{exerciseName}</Text>
          </View>

          <Text style={[styles.countdown, { color: timerColor }]}>
            {formatDuration(remaining)}
          </Text>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => stopRestTimer(running.sessionExercise.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.skipText}>Skip ›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    zIndex: 100,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#334155',
  },
  progressBar: {
    height: 3,
    borderRadius: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  info: { flex: 1 },
  label: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  exerciseLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  countdown: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  skipBtn: {
    paddingHorizontal: 4,
    height: 44,
    justifyContent: 'center',
  },
  skipText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
});
