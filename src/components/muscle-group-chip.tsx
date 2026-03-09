/**
 * MuscleGroupChip
 *
 * Coloured chip displaying a muscle group name.
 * - `selected` controls whether the group colour is applied (default: true).
 * - `onPress` makes the chip interactive (toggling selection).
 * - `small` renders a compact version for exercise list rows.
 */

import { Pressable, Text, StyleSheet } from 'react-native';

// ── Colour map ────────────────────────────────────────────────────────────────

const MUSCLE_COLORS: Record<string, { bg: string; text: string }> = {
  chest:     { bg: '#881337', text: '#fda4af' }, // rose-900 / rose-300
  back:      { bg: '#1e3a5f', text: '#93c5fd' }, // blue-900 / blue-300
  shoulders: { bg: '#431407', text: '#fdba74' }, // orange-950 / orange-300
  biceps:    { bg: '#4c1d95', text: '#c4b5fd' }, // violet-900 / violet-300
  triceps:   { bg: '#164e63', text: '#67e8f9' }, // cyan-900 / cyan-300
  legs:      { bg: '#14532d', text: '#86efac' }, // green-900 / green-300
  core:      { bg: '#713f12', text: '#fde047' }, // yellow-900 / yellow-300
  cardio:    { bg: '#831843', text: '#f9a8d4' }, // pink-900 / pink-300
  other:     { bg: '#27272a', text: '#a1a1aa' }, // zinc-800 / zinc-400
};

const UNSELECTED = { bg: '#18181b', text: '#52525b' }; // zinc-900 / zinc-600

// ── Component ─────────────────────────────────────────────────────────────────

interface MuscleGroupChipProps {
  group: string;
  /** Whether the chip is in its "active/selected" state. Defaults to true. */
  selected?: boolean;
  /** When provided the chip is pressable (interactive toggle). */
  onPress?: () => void;
  /** Compact variant for tight spaces (e.g. exercise list rows). */
  small?: boolean;
}

export function MuscleGroupChip({
  group,
  selected = true,
  onPress,
  small = false,
}: MuscleGroupChipProps) {
  const normalised = group.toLowerCase();
  const colors = selected
    ? (MUSCLE_COLORS[normalised] ?? MUSCLE_COLORS.other)
    : UNSELECTED;

  const label = group.charAt(0).toUpperCase() + group.slice(1);

  const chip = (
    <Text
      style={[
        styles.text,
        small && styles.textSmall,
        { color: colors.text },
      ]}
    >
      {label}
    </Text>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.chip,
          small && styles.chipSmall,
          { backgroundColor: colors.bg },
        ]}
        hitSlop={4}
      >
        {chip}
      </Pressable>
    );
  }

  return (
    <Text
      style={[
        styles.chip,
        styles.noPress,
        small && styles.chipSmall,
        { backgroundColor: colors.bg, color: colors.text },
        small && styles.textSmall,
      ]}
    >
      {label}
    </Text>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  noPress: {
    // When chip is static (Text element acts as badge)
    overflow: 'hidden',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  textSmall: {
    fontSize: 11,
    fontWeight: '600',
  },
});
