/**
 * ProgressScreen — exercise selector + 3 chart tabs + time ranges + PR cards.
 *
 * Exercise picker opens as a slide-up modal (pageSheet).
 * Chart data is fetched once on exercise selection; time-range filtering
 * is applied client-side from the cached full dataset.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, FlatList,
  TextInput, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useExercises } from '@/hooks/use-exercises';
import {
  useExerciseProgress, filterByTimeRange,
  type TimeRange, type PRData,
} from '@/hooks/use-progress';
import { TopSetChart }   from '@/components/progress/top-set-chart';
import { E1RMChart }     from '@/components/progress/e1rm-chart';
import { VolumeChart }   from '@/components/progress/volume-chart';
import { PlateauBadge }  from '@/components/progress/plateau-badge';
import { MuscleGroupChip } from '@/components/muscle-group-chip';
import type { ExerciseWithSchema } from '@/types/app';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartTab = 'top-set' | 'e1rm' | 'volume';

const CHART_TABS: { key: ChartTab; label: string }[] = [
  { key: 'top-set', label: 'Top Set'  },
  { key: 'e1rm',    label: 'Est. 1RM' },
  { key: 'volume',  label: 'Volume'   },
];

const TIME_RANGES: TimeRange[] = ['1M', '3M', '6M', '1Y', 'All'];

const PR_INFO: Record<
  PRData['record_type'],
  { label: string; unit: string; icon: string; decimals: number }
> = {
  best_weight:         { label: 'Heaviest',       unit: 'kg',   icon: '🏋️', decimals: 1 },
  best_e1rm:           { label: 'Est. 1RM',       unit: 'kg',   icon: '⚡', decimals: 0 },
  best_reps_at_weight: { label: 'Most Reps',      unit: 'reps', icon: '🔁', decimals: 0 },
  best_volume:         { label: 'Session Volume', unit: 'kg',   icon: '📊', decimals: 0 },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <View style={sk.root}>
      <View style={[sk.bar, { width: '100%' }]} />
      <View style={[sk.bar, { width: '80%'  }]} />
      <View style={[sk.bar, { width: '60%'  }]} />
    </View>
  );
}
const sk = StyleSheet.create({
  root: { height: 200, backgroundColor: '#1e293b', borderRadius: 14, padding: 16, gap: 12, justifyContent: 'center' },
  bar:  { height: 16, backgroundColor: '#334155', borderRadius: 6 },
});

// ── PR card ───────────────────────────────────────────────────────────────────

function PRCard({ pr }: { pr: PRData }) {
  const info = PR_INFO[pr.record_type];
  return (
    <View style={styles.prCard}>
      <Text style={styles.prIcon}>{info.icon}</Text>
      <Text style={styles.prValue}>
        {Number(pr.record_value).toFixed(info.decimals)}
      </Text>
      <Text style={styles.prUnit}>{info.unit}</Text>
      <Text style={styles.prLabel}>{info.label}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ProgressScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const [activeTab,    setActiveTab]    = useState<ChartTab>('top-set');
  const [timeRange,    setTimeRange]    = useState<TimeRange>('3M');
  const [selected,     setSelected]     = useState<ExerciseWithSchema | null>(null);
  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [search,       setSearch]       = useState('');

  const { exercises, fetchExercises, isLoading: exercisesLoading } = useExercises();
  const { allPoints, prs, plateau, isLoading: progressLoading } = useExerciseProgress(
    selected?.id ?? null,
  );

  // Load exercises for the picker when the screen mounts
  useEffect(() => { void fetchExercises(); }, [fetchExercises]);

  const filteredPoints = useMemo(
    () => filterByTimeRange(allPoints, timeRange),
    [allPoints, timeRange],
  );

  const filteredExercises = useMemo(() => {
    if (!search.trim()) return exercises;
    const q = search.toLowerCase();
    return exercises.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.muscle_groups.some((m) => m.toLowerCase().includes(q)),
    );
  }, [exercises, search]);

  const handleSelect = useCallback((ex: ExerciseWithSchema) => {
    setSelected(ex);
    setPickerOpen(false);
    setSearch('');
    setActiveTab('top-set');
    setTimeRange('3M');
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Progress</Text>
          <TouchableOpacity
            style={styles.weeklyBtn}
            onPress={() => router.push('./weekly')}
            activeOpacity={0.8}
          >
            <Text style={styles.weeklyBtnText}>Weekly ›</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.pickerBtn}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.pickerBtnText} numberOfLines={1}>
            {selected ? selected.name : 'Select exercise ›'}
          </Text>
          {selected && <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>
      </View>

      {/* ── No exercise selected ── */}
      {!selected ? (
        <View style={styles.emptyRoot}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>Choose an exercise</Text>
          <Text style={styles.emptyHint}>
            Select an exercise to see your strength progress and personal records.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.emptyBtnText}>Pick Exercise</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 28 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Muscle chips */}
          {selected.muscle_groups.length > 0 && (
            <View style={styles.chipRow}>
              {selected.muscle_groups.slice(0, 4).map((m) => (
                <MuscleGroupChip key={m} group={m} />
              ))}
            </View>
          )}

          {/* Plateau badge */}
          {plateau && (
            <PlateauBadge
              sessionsStalled={plateau.sessionsStalled}
              intervention={plateau.intervention}
            />
          )}

          {/* Chart type tabs */}
          <View style={styles.tabRow}>
            {CHART_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Time range */}
          <View style={styles.rangeRow}>
            {TIME_RANGES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.rangeChip, timeRange === r && styles.rangeActive]}
                onPress={() => setTimeRange(r)}
              >
                <Text style={[styles.rangeText, timeRange === r && styles.rangeTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chart */}
          {progressLoading ? (
            <ChartSkeleton />
          ) : (
            <>
              {activeTab === 'top-set' && <TopSetChart  points={filteredPoints} />}
              {activeTab === 'e1rm'    && <E1RMChart    points={filteredPoints} />}
              {activeTab === 'volume'  && <VolumeChart  points={filteredPoints} />}
            </>
          )}

          {/* PR cards */}
          {prs.length > 0 && (
            <>
              <Text style={styles.prSectionLabel}>Personal Records</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.prScroll}
              >
                {prs.map((pr) => (
                  <PRCard key={pr.record_type} pr={pr} />
                ))}
              </ScrollView>
            </>
          )}

          {/* Data count hint */}
          {!progressLoading && allPoints.length > 0 && (
            <Text style={styles.dataHint}>
              {allPoints.length} session{allPoints.length !== 1 ? 's' : ''} logged · {filteredPoints.length} in view
            </Text>
          )}
        </ScrollView>
      )}

      {/* ── Exercise picker modal ── */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Exercise</Text>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises…"
              placeholderTextColor="#475569"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          {exercisesLoading ? (
            <ActivityIndicator color="#a3e635" style={styles.pickerLoader} />
          ) : (
            <FlatList
              data={filteredExercises}
              keyExtractor={(e) => e.id}
              contentContainerStyle={styles.pickerList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selected?.id === item.id && styles.pickerItemSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.pickerItemBody}>
                    <Text style={styles.pickerItemName}>{item.name}</Text>
                    <View style={styles.pickerItemMuscles}>
                      {item.muscle_groups.slice(0, 2).map((m) => (
                        <Text key={m} style={styles.pickerItemMuscle}>{m}</Text>
                      ))}
                    </View>
                  </View>
                  {selected?.id === item.id && (
                    <Text style={styles.pickerCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>No exercises found</Text>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0f172a' },

  // Header
  header:       { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 8 },
  titleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:        { color: '#f8fafc', fontSize: 28, fontWeight: '800' },
  weeklyBtn:    { backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  weeklyBtnText:{ color: '#a3e635', fontSize: 13, fontWeight: '700' },
  pickerBtn:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  pickerBtnText:{ flex: 1, color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  chevron:      { color: '#a3e635', fontSize: 20 },

  // Empty
  emptyRoot:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { color: '#64748b', fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyHint:  { color: '#475569', fontSize: 14, textAlign: 'center', maxWidth: 280 },
  emptyBtn:   { backgroundColor: '#a3e635', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 15 },

  // Content
  content:  { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  // Tabs
  tabRow:       { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 10, padding: 3, gap: 3 },
  tab:          { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive:    { backgroundColor: '#a3e635' },
  tabText:      { color: '#64748b', fontSize: 13, fontWeight: '600' },
  tabTextActive:{ color: '#0f172a' },

  // Time range
  rangeRow:       { flexDirection: 'row', gap: 6 },
  rangeChip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1e293b' },
  rangeActive:    { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#a3e635' },
  rangeText:      { color: '#64748b', fontSize: 13, fontWeight: '600' },
  rangeTextActive:{ color: '#a3e635' },

  // PR cards
  prSectionLabel: { color: '#475569', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  prScroll:       { paddingRight: 16, gap: 10 },
  prCard:         { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, width: 120, alignItems: 'center', gap: 2 },
  prIcon:         { fontSize: 24 },
  prValue:        { color: '#f8fafc', fontSize: 22, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] },
  prUnit:         { color: '#a3e635', fontSize: 12, fontWeight: '600' },
  prLabel:        { color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 2 },

  // Data hint
  dataHint: { color: '#334155', fontSize: 12, textAlign: 'center' },

  // Picker modal
  modal:        { flex: 1, backgroundColor: '#0f172a' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  modalTitle:   { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  modalClose:   { color: '#a3e635', fontSize: 16, fontWeight: '600' },
  searchWrap:   { paddingHorizontal: 16, paddingVertical: 12 },
  searchInput:  { backgroundColor: '#1e293b', color: '#f8fafc', fontSize: 15, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  pickerLoader: { marginTop: 40 },
  pickerList:   { paddingHorizontal: 16, paddingBottom: 32 },
  pickerItem:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e293b', gap: 8 },
  pickerItemSelected: { opacity: 0.85 },
  pickerItemBody: { flex: 1, gap: 2 },
  pickerItemName: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  pickerItemMuscles: { flexDirection: 'row', gap: 6 },
  pickerItemMuscle:  { color: '#64748b', fontSize: 12 },
  pickerCheck:  { color: '#a3e635', fontSize: 18, fontWeight: '700' },
  pickerEmpty:  { color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 15 },
});
