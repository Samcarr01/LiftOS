/**
 * SetRow — one row per set within an exercise card.
 *
 * Layout: [type badge] | [Last values (grey)] | [Current inputs] | [✓ checkbox]
 * Swipe left to delete.
 * Tap type badge to cycle: working → warmup → drop → working.
 * Prefilled values (from last session) are highlighted in lime.
 */
import React, { useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { NumericInput } from './numeric-input';
import type { SetEntry, SetValues, TrackingField } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SetRowProps {
  set: SetEntry;
  lastValues: SetValues | null;
  fields: TrackingField[];
  onUpdate: (patch: Partial<SetEntry>) => void;
  onDelete: () => void;
  onComplete: () => void;
}

// ── Set type cycling ──────────────────────────────────────────────────────────

const SET_TYPE_CYCLE: SetEntry['setType'][] = ['working', 'warmup', 'drop', 'top', 'failure'];

const SET_TYPE_LABEL: Record<SetEntry['setType'], string> = {
  working: 'W',
  warmup: 'WU',
  top: 'T',
  drop: 'D',
  failure: 'F',
};

const SET_TYPE_COLORS: Record<SetEntry['setType'], { bg: string; text: string }> = {
  working: { bg: '#1a2e0a', text: '#a3e635' },
  warmup: { bg: '#431407', text: '#fb923c' },
  top: { bg: '#422006', text: '#fbbf24' },
  drop: { bg: '#2e1065', text: '#c084fc' },
  failure: { bg: '#450a0a', text: '#f87171' },
};

function nextSetType(current: SetEntry['setType']): SetEntry['setType'] {
  const idx = SET_TYPE_CYCLE.indexOf(current);
  return SET_TYPE_CYCLE[(idx + 1) % SET_TYPE_CYCLE.length];
}

// ── Delete action (swipe right-to-left) ───────────────────────────────────────

function RightDeleteAction({ onDelete }: { onDelete: () => void }) {
  return (
    <TouchableOpacity style={styles.deleteAction} onPress={onDelete} activeOpacity={0.8}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );
}

// ── SetRow ────────────────────────────────────────────────────────────────────

export function SetRow({ set, lastValues, fields, onUpdate, onDelete, onComplete }: SetRowProps) {
  const swipeRef = useRef<Swipeable>(null);
  const isPrefilled = set.loggedAt === '' && !set.isCompleted && Object.keys(set.values).length > 0;

  const handleCycleType = useCallback(() => {
    onUpdate({ setType: nextSetType(set.setType) });
  }, [set.setType, onUpdate]);

  const handleComplete = useCallback(async () => {
    if (set.isCompleted) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onComplete();
  }, [set.isCompleted, onComplete]);

  const handleFieldChange = useCallback(
    (key: string, value: number | string) => {
      onUpdate({ values: { ...set.values, [key]: value } });
    },
    [set.values, onUpdate],
  );

  const handleDelete = useCallback(() => {
    swipeRef.current?.close();
    onDelete();
  }, [onDelete]);

  const typeStyle = SET_TYPE_COLORS[set.setType];

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={() => <RightDeleteAction onDelete={handleDelete} />}
      rightThreshold={60}
      overshootRight={false}
    >
      <View style={[styles.row, set.isCompleted && styles.rowCompleted]}>
        {/* Set type badge (tap to cycle) */}
        <TouchableOpacity
          style={[styles.typeBadge, { backgroundColor: typeStyle.bg }]}
          onPress={handleCycleType}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[styles.typeText, { color: typeStyle.text }]}>
            {set.setIndex}
          </Text>
          <Text style={[styles.typeLabel, { color: typeStyle.text }]}>
            {SET_TYPE_LABEL[set.setType]}
          </Text>
        </TouchableOpacity>

        {/* Last session values (read-only, greyed) */}
        <View style={styles.lastCol}>
          {fields.map((field) => {
            const lastVal = lastValues?.[field.key];
            return (
              <Text key={field.key} style={styles.lastValue} numberOfLines={1}>
                {lastVal !== undefined ? String(lastVal) : '—'}
              </Text>
            );
          })}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Current inputs */}
        <View style={styles.currentCol}>
          {fields.map((field) => (
            <NumericInput
              key={field.key}
              field={field}
              value={set.values[field.key] as number | string | undefined}
              onChange={(v) => handleFieldChange(field.key, v)}
              highlighted={isPrefilled}
              completed={set.isCompleted}
            />
          ))}
        </View>

        {/* Completion checkbox */}
        <TouchableOpacity
          style={[styles.checkbox, set.isCompleted && styles.checkboxDone]}
          onPress={handleComplete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {set.isCompleted && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
      </View>
    </Swipeable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#0f172a',
    gap: 8,
    minHeight: 52,
  },
  rowCompleted: {
    opacity: 0.7,
  },

  // Type badge
  typeBadge: {
    width: 36,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeText: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  typeLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Last column
  lastCol: {
    width: 72,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },
  lastValue: {
    color: '#475569',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },

  // Divider
  divider: {
    width: 1,
    height: 28,
    backgroundColor: '#1e293b',
  },

  // Current column
  currentCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Checkbox
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  checkboxDone: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  checkmark: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },

  // Delete swipe action
  deleteAction: {
    backgroundColor: '#7f1d1d',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    minWidth: 80,
  },
  deleteText: {
    color: '#fca5a5',
    fontSize: 14,
    fontWeight: '700',
  },
});
