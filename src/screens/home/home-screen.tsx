/**
 * HomeScreen — the main dashboard for LiftOS.
 *
 * Layout:
 *  ┌─────────────────────────────┐
 *  │ Greeting + date             │
 *  │ Suggested workout card      │
 *  │ Pinned workouts (h-scroll)  │
 *  │ Recent sessions             │
 *  │ Last session highlights     │
 *  │ Empty state (new user)      │
 *  │            [FAB]            │  ← fixed bottom-right
 *  └─────────────────────────────┘
 *
 * FAB taps → template picker bottom sheet (Modal).
 * Selecting a template or "Start blank" calls useStartWorkout then navigates to /workout.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHomeData, type HomeRecentSession } from '@/hooks/use-home-data';
import { useStartWorkout } from '@/hooks/use-start-workout';
import type { TemplateWithCount } from '@/hooks/use-templates';

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

function formatDurationMin(seconds: number | null): string {
  if (!seconds) return '—';
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

function formatSessionDate(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onPress,
  style,
}: {
  template: TemplateWithCount;
  onPress: () => void;
  style?: object;
}) {
  return (
    <Pressable style={[styles.templateCard, style]} onPress={onPress}>
      <View style={styles.templateCardInner}>
        <Text style={styles.templateCardName} numberOfLines={2}>
          {template.name}
        </Text>
        <Text style={styles.templateCardMeta}>
          {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#52525b" />
    </Pressable>
  );
}

function SessionRow({ session }: { session: HomeRecentSession }) {
  return (
    <View style={styles.sessionRow}>
      <View style={styles.sessionRowLeft}>
        <Text style={styles.sessionName} numberOfLines={1}>
          {session.template_name ?? 'Free workout'}
        </Text>
        <Text style={styles.sessionMeta}>
          {formatSessionDate(session.started_at)} · {formatDurationMin(session.duration_seconds)}
        </Text>
      </View>
      <View style={styles.sessionRowRight}>
        <Text style={styles.sessionStat}>{session.total_sets} sets</Text>
        {session.volume_kg > 0 && (
          <Text style={styles.sessionStatSub}>
            {session.volume_kg.toLocaleString()} kg
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Template picker (bottom sheet via Modal) ──────────────────────────────────

function TemplatePicker({
  visible,
  templates,
  onSelect,
  onClose,
}: {
  visible: boolean;
  templates: TemplateWithCount[];
  onSelect: (templateId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetOverlay} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Start Workout</Text>

        {/* Blank start */}
        <Pressable
          style={styles.sheetBlankRow}
          onPress={() => onSelect(null)}
        >
          <Ionicons name="flash-outline" size={20} color="#a3e635" />
          <Text style={styles.sheetBlankText}>Start blank workout</Text>
        </Pressable>

        {templates.length > 0 && (
          <>
            <Text style={styles.sheetSectionLabel}>Templates</Text>
            <FlatList
              data={templates}
              keyExtractor={(t) => t.id}
              style={styles.sheetList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sheetTemplateRow}
                  onPress={() => onSelect(item.id)}
                >
                  <View style={styles.sheetTemplateInfo}>
                    <Text style={styles.sheetTemplateName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.sheetTemplateMeta}>
                      {item.exercise_count} exercise{item.exercise_count !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#52525b" />
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refresh } = useHomeData();
  const { startWorkout, isLoading: isStarting } = useStartWorkout();
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleSelectTemplate = useCallback(
    async (templateId: string | null) => {
      setPickerVisible(false);
      const ok = await startWorkout(templateId);
      if (ok) router.push('/workout');
    },
    [startWorkout, router],
  );

  const showPicker = useCallback(() => setPickerVisible(true), []);

  const { suggestedTemplate, pinnedTemplates, allTemplates, recentSessions, lastSessionHighlights, hasAnyData } = data;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor="#a3e635"
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Ready to lift?</Text>
          <Text style={styles.dateText}>{formatDate(new Date())}</Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── Empty state (new user) ── */}
        {!isLoading && !hasAnyData && (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={48} color="#3f3f46" />
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the button below to start your first session
            </Text>
          </View>
        )}

        {/* ── Suggested workout ── */}
        {suggestedTemplate && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Suggested</Text>
            <TemplateCard
              template={suggestedTemplate}
              onPress={() => handleSelectTemplate(suggestedTemplate.id)}
              style={styles.suggestedCard}
            />
          </View>
        )}

        {/* ── Pinned workouts (horizontal scroll) ── */}
        {pinnedTemplates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pinned</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pinnedScroll}
            >
              {pinnedTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onPress={() => handleSelectTemplate(t.id)}
                  style={styles.pinnedCard}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Recent sessions ── */}
        {recentSessions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent</Text>
            <View style={styles.card}>
              {recentSessions.slice(0, 5).map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && <View style={styles.separator} />}
                  <SessionRow session={s} />
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {/* ── Last session highlights ── */}
        {lastSessionHighlights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last session highlights</Text>
            <View style={styles.card}>
              {lastSessionHighlights.map((h, i) => (
                <View key={i} style={styles.highlightRow}>
                  <Ionicons name="trophy-outline" size={14} color="#a3e635" />
                  <Text style={styles.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── FAB ── */}
      <View style={[styles.fab, { bottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={styles.fabButton}
          onPress={showPicker}
          activeOpacity={0.85}
          disabled={isStarting}
        >
          {isStarting ? (
            <ActivityIndicator color="#09090b" size="small" />
          ) : (
            <Ionicons name="add" size={28} color="#09090b" />
          )}
        </TouchableOpacity>
      </View>

      {/* ── Template picker ── */}
      <TemplatePicker
        visible={pickerVisible}
        templates={allTemplates}
        onSelect={handleSelectTemplate}
        onClose={() => setPickerVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 24,
  },

  // Header
  header: {
    gap: 2,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fafafa',
  },
  dateText: {
    fontSize: 14,
    color: '#71717a',
  },

  // Error
  errorBanner: {
    backgroundColor: '#450a0a',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fafafa',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#71717a',
    textAlign: 'center',
    maxWidth: 260,
  },

  // Sections
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Card (generic container)
  card: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    overflow: 'hidden',
  },

  // Template card (vertical)
  templateCard: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  suggestedCard: {
    borderColor: '#365314',
    borderWidth: 1.5,
  },
  templateCardInner: {
    flex: 1,
    gap: 4,
  },
  templateCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fafafa',
  },
  templateCardMeta: {
    fontSize: 13,
    color: '#71717a',
  },

  // Pinned horizontal scroll
  pinnedScroll: {
    gap: 12,
    paddingRight: 4,
  },
  pinnedCard: {
    width: 200,
  },

  // Session row
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  sessionRowLeft: {
    flex: 1,
    gap: 3,
  },
  sessionName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fafafa',
  },
  sessionMeta: {
    fontSize: 12,
    color: '#71717a',
  },
  sessionRowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sessionStat: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a1a1aa',
  },
  sessionStatSub: {
    fontSize: 11,
    color: '#52525b',
  },

  // Highlights
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  highlightText: {
    fontSize: 14,
    color: '#d4d4d8',
    fontWeight: '500',
  },

  // Separator
  separator: {
    height: 1,
    backgroundColor: '#27272a',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 24,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#a3e635',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#a3e635',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  // Bottom sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fafafa',
    marginBottom: 16,
  },
  sheetBlankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#27272a',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sheetBlankText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#a3e635',
  },
  sheetSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sheetList: {
    flexGrow: 0,
  },
  sheetTemplateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  sheetTemplateInfo: {
    flex: 1,
    gap: 3,
  },
  sheetTemplateName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fafafa',
  },
  sheetTemplateMeta: {
    fontSize: 12,
    color: '#71717a',
  },
});
