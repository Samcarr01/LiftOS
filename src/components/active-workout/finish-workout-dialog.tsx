/**
 * FinishWorkoutDialog — confirmation modal before ending a workout.
 * Shows a quick summary: exercises, total sets, elapsed duration.
 */
import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Pressable,
} from 'react-native';
import { formatDuration } from '@/lib/utils';
import type { ActiveWorkoutState } from '@/types';

interface FinishWorkoutDialogProps {
  visible: boolean;
  workout: ActiveWorkoutState;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FinishWorkoutDialog({
  visible, workout, onConfirm, onCancel,
}: FinishWorkoutDialogProps) {
  const totalSets = workout.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.isCompleted).length,
    0,
  );
  const totalSetsPending = workout.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => !s.isCompleted).length,
    0,
  );
  const exerciseCount = workout.exercises.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Finish Workout?</Text>
            <Text style={styles.subtitle}>
              {formatDuration(workout.elapsedTimer)} elapsed
            </Text>
          </View>

          {/* Summary stats */}
          <View style={styles.stats}>
            <StatRow label="Exercises" value={String(exerciseCount)} />
            <StatRow label="Sets completed" value={String(totalSets)} accent />
            {totalSetsPending > 0 && (
              <StatRow
                label="Sets unfinished"
                value={String(totalSetsPending)}
                warning
              />
            )}
          </View>

          {totalSetsPending > 0 && (
            <Text style={styles.warning}>
              {totalSetsPending} set{totalSetsPending !== 1 ? 's' : ''} not logged — they won't be saved.
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Keep Going</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={onConfirm}
              activeOpacity={0.8}
              disabled={workout.isCompleting}
            >
              <Text style={styles.confirmText}>
                {workout.isCompleting ? 'Finishing…' : 'Finish Workout'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StatRow({
  label, value, accent, warning,
}: {
  label: string; value: string; accent?: boolean; warning?: boolean;
}) {
  return (
    <View style={statStyles.row}>
      <Text style={statStyles.label}>{label}</Text>
      <Text
        style={[
          statStyles.value,
          accent && statStyles.valueAccent,
          warning && statStyles.valueWarning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: { color: '#94a3b8', fontSize: 15 },
  value: { color: '#f8fafc', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  valueAccent: { color: '#a3e635' },
  valueWarning: { color: '#fbbf24' },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    width: '100%',
    maxWidth: 380,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  stats: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
    gap: 4,
  },
  warning: {
    color: '#fbbf24',
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 10,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cancelText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#a3e635',
  },
  confirmText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
});
