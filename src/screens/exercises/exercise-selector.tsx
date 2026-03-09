/**
 * ExerciseSelector
 *
 * Screen for browsing, searching, and selecting an exercise.
 *
 * Features:
 *  - Instant local search (no server round-trip) filtered by name
 *  - Muscle group filter chips (tappable; clears with "All")
 *  - Exercise list with muscle group badges and tracking type icon
 *  - "Create New" button → navigates to ExerciseCreator
 *  - On exercise tap: fires the registered callback (for template editor)
 *    or logs to console (standalone / test mode)
 *
 * Cross-screen callback pattern:
 *   Caller registers via registerExerciseCallback(fn) before navigating here.
 *   On selection, resolveExerciseSelection(exercise) fires that callback.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useExercises } from '@/hooks/use-exercises';
import { MuscleGroupChip } from '@/components/muscle-group-chip';
import {
  resolveExerciseSelection,
  hasExerciseCallback,
} from '@/store/exercise-selection-store';
import type { ExerciseWithSchema, TrackingField } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive a tracking type icon from an exercise's tracking schema fields. */
function trackingIcon(fields: TrackingField[]): keyof typeof Ionicons.glyphMap {
  const keys = fields.map((f) => f.key);
  if (keys.includes('laps'))     return 'repeat-outline';
  if (keys.includes('distance')) return 'navigate-outline';
  if (keys.includes('weight'))   return 'barbell-outline';
  if (keys.includes('duration')) return 'time-outline';
  if (keys.includes('reps'))     return 'person-outline';
  return 'construct-outline';
}

const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'cardio', 'other'];

// ── Props ─────────────────────────────────────────────────────────────────────

interface ExerciseSelectorProps {
  /** Direct callback — used when embedded in a sheet/modal. */
  onSelect?: (exercise: ExerciseWithSchema) => void;
}

// ── Exercise row ──────────────────────────────────────────────────────────────

interface ExerciseRowProps {
  exercise: ExerciseWithSchema;
  onPress: (exercise: ExerciseWithSchema) => void;
}

function ExerciseRow({ exercise, onPress }: ExerciseRowProps) {
  const icon = trackingIcon(exercise.tracking_schema.fields);
  const visibleGroups = exercise.muscle_groups.slice(0, 3);

  return (
    <Pressable
      style={({ pressed }) => [styles.exerciseRow, pressed && styles.exerciseRowPressed]}
      onPress={() => onPress(exercise)}
    >
      {/* Tracking type icon */}
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color="#a3e635" />
      </View>

      {/* Name + muscle groups */}
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName} numberOfLines={1}>
          {exercise.name}
        </Text>
        {visibleGroups.length > 0 && (
          <View style={styles.groupChips}>
            {visibleGroups.map((g) => (
              <MuscleGroupChip key={g} group={g} small />
            ))}
            {exercise.muscle_groups.length > 3 && (
              <Text style={styles.moreGroups}>+{exercise.muscle_groups.length - 3}</Text>
            )}
          </View>
        )}
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={18} color="#52525b" />
    </Pressable>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExerciseSelector({ onSelect }: ExerciseSelectorProps) {
  const { exercises, isLoading, error, fetchExercises } = useExercises();

  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);

  // ── Filter (local, instant) ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((ex) => {
      const nameMatch = !q || ex.name.toLowerCase().includes(q);
      const groupMatch =
        !muscleFilter || ex.muscle_groups.includes(muscleFilter);
      return nameMatch && groupMatch;
    });
  }, [exercises, query, muscleFilter]);

  // ── Selection handler ──────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (exercise: ExerciseWithSchema) => {
      if (onSelect) {
        onSelect(exercise);
      } else if (hasExerciseCallback()) {
        resolveExerciseSelection(exercise);
        router.back();
      } else {
        // Standalone / test mode — navigate back
        router.back();
      }
    },
    [onSelect],
  );

  // ── Navigate to creator ────────────────────────────────────────────────────

  const handleCreateNew = useCallback(() => {
    // After creator completes, refresh this list on focus (handled by useExercises)
    router.push('/(tabs)/templates/exercise-creator' as never);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fafafa" />
        </Pressable>
        <Text style={styles.headerTitle}>Select Exercise</Text>
        <Pressable onPress={handleCreateNew} style={styles.createBtn}>
          <Ionicons name="add" size={20} color="#a3e635" />
          <Text style={styles.createBtnText}>New</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color="#71717a" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises…"
          placeholderTextColor="#52525b"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Muscle group filter chips */}
      <FlatList
        horizontal
        data={[null, ...MUSCLE_GROUPS]}
        keyExtractor={(item) => item ?? 'all'}
        contentContainerStyle={styles.filterChips}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const isAll = item === null;
          const active = isAll ? muscleFilter === null : muscleFilter === item;
          if (isAll) {
            return (
              <Pressable
                style={[styles.allChip, active && styles.allChipActive]}
                onPress={() => setMuscleFilter(null)}
              >
                <Text style={[styles.allChipText, active && styles.allChipTextActive]}>
                  All
                </Text>
              </Pressable>
            );
          }
          return (
            <MuscleGroupChip
              group={item}
              selected={active}
              onPress={() => setMuscleFilter(active ? null : item)}
            />
          );
        }}
      />

      {/* Exercise list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#a3e635" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#71717a" />
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={fetchExercises}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ExerciseRow exercise={item} onPress={handleSelect} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={
            filtered.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="barbell-outline" size={40} color="#27272a" />
              <Text style={styles.emptyText}>
                {query || muscleFilter
                  ? 'No exercises match your search.'
                  : 'No exercises yet. Create your first one!'}
              </Text>
              {!query && !muscleFilter && (
                <Pressable style={styles.createEmptyBtn} onPress={handleCreateNew}>
                  <Text style={styles.createEmptyText}>Create Exercise</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a3e635',
  },
  createBtnText: { color: '#a3e635', fontWeight: '700', fontSize: 14 },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    color: '#fafafa',
    fontSize: 16,
  },

  // Filter chips
  filterChips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  allChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#27272a',
  },
  allChipActive: { backgroundColor: '#a3e635' },
  allChipText: { fontSize: 13, fontWeight: '600', color: '#a1a1aa' },
  allChipTextActive: { color: '#09090b' },

  // List
  listContent: { paddingBottom: 20 },
  emptyContainer: { flex: 1 },
  separator: { height: 1, backgroundColor: '#18181b', marginHorizontal: 16 },

  // Exercise row
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: '#09090b',
  },
  exerciseRowPressed: { backgroundColor: '#18181b' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#18181b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInfo: { flex: 1, gap: 4 },
  exerciseName: { fontSize: 16, fontWeight: '600', color: '#fafafa' },
  groupChips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  moreGroups: { fontSize: 11, color: '#52525b', alignSelf: 'center' },

  // Empty / error states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyText: { color: '#71717a', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: '#fafafa', fontWeight: '600' },
  createEmptyBtn: {
    backgroundColor: '#a3e635',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  createEmptyText: { color: '#09090b', fontWeight: '700', fontSize: 16 },
});
