/**
 * TemplateList
 *
 * Browse, create, duplicate, pin, and delete workout templates.
 *
 * Layout:
 *  - Search bar (local filter)
 *  - Pinned section (if any pinned templates)
 *  - All templates section (sorted by last_used_at)
 *  - FAB: Create New (opens inline name modal)
 *
 * Interactions:
 *  - Tap row → TemplateEditor
 *  - Long press → context menu (Edit / Pin / Duplicate / Delete)
 *  - Swipe left → Delete (with confirmation)
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useTemplates } from '@/hooks/use-templates';
import type { TemplateWithCount } from '@/hooks/use-templates';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatLastUsed(dateStr: string | null): string {
  if (!dateStr) return 'Never used';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Template row ───────────────────────────────────────────────────────────────

interface TemplateRowProps {
  item: TemplateWithCount;
  onPress: (item: TemplateWithCount) => void;
  onLongPress: (item: TemplateWithCount) => void;
  onDelete: (item: TemplateWithCount) => void;
}

function TemplateRow({ item, onPress, onLongPress, onDelete }: TemplateRowProps) {
  const swipeRef = useRef<Swipeable>(null);

  const renderRightActions = () => (
    <Pressable
      style={styles.deleteAction}
      onPress={() => {
        swipeRef.current?.close();
        onDelete(item);
      }}
    >
      <Ionicons name="trash-outline" size={22} color="#fafafa" />
      <Text style={styles.deleteActionText}>Delete</Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={60}
      overshootRight={false}
    >
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
        delayLongPress={400}
      >
        {/* Pin indicator */}
        {item.is_pinned && (
          <Ionicons name="pin" size={14} color="#a3e635" style={styles.pinIcon} />
        )}

        {/* Name + meta */}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.rowMeta}>
            <Text style={styles.rowMetaText}>
              {item.exercise_count} exercise{item.exercise_count !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.rowMetaDot}>·</Text>
            <Text style={styles.rowMetaText}>{formatLastUsed(item.last_used_at)}</Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color="#52525b" />
      </Pressable>
    </Swipeable>
  );
}

// ── Create name modal ──────────────────────────────────────────────────────────

interface CreateModalProps {
  visible: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function CreateModal({ visible, onConfirm, onCancel }: CreateModalProps) {
  const [name, setName] = useState('');

  const handleConfirm = () => {
    if (!name.trim()) return;
    onConfirm(name.trim());
    setName('');
  };

  const handleCancel = () => {
    setName('');
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.modalOverlay} onPress={handleCancel}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>New Template</Text>
          <TextInput
            style={styles.modalInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Push Day"
            placeholderTextColor="#52525b"
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            maxLength={100}
          />
          <View style={styles.modalButtons}>
            <Pressable style={styles.modalCancel} onPress={handleCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalCreate, !name.trim() && styles.modalCreateDisabled]}
              onPress={handleConfirm}
              disabled={!name.trim()}
            >
              <Text style={styles.modalCreateText}>Create</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TemplateList() {
  const { templates, isLoading, error, fetchTemplates, createTemplate, deleteTemplate, duplicateTemplate, togglePin } =
    useTemplates();

  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // ── Local search filter ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
  }, [templates, query]);

  const pinned = useMemo(() => filtered.filter((t) => t.is_pinned), [filtered]);
  const all = useMemo(() => filtered.filter((t) => !t.is_pinned), [filtered]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePress = useCallback((item: TemplateWithCount) => {
    router.push(`/(tabs)/templates/${item.id}` as never);
  }, []);

  const handleLongPress = useCallback(
    (item: TemplateWithCount) => {
      Alert.alert(item.name, undefined, [
        {
          text: 'Edit',
          onPress: () => router.push(`/(tabs)/templates/${item.id}` as never),
        },
        {
          text: item.is_pinned ? 'Unpin' : 'Pin',
          onPress: () => void togglePin(item.id),
        },
        {
          text: 'Duplicate',
          onPress: () =>
            void duplicateTemplate(item.id).catch((e: unknown) =>
              Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to duplicate.'),
            ),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDelete(item),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [togglePin, duplicateTemplate],
  );

  const confirmDelete = useCallback(
    (item: TemplateWithCount) => {
      Alert.alert(
        'Delete Template',
        `"${item.name}" and all its exercises will be permanently removed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () =>
              void deleteTemplate(item.id).catch((e: unknown) =>
                Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to delete.'),
              ),
          },
        ],
      );
    },
    [deleteTemplate],
  );

  const handleCreate = useCallback(
    async (name: string) => {
      setShowCreate(false);
      try {
        const template = await createTemplate(name);
        router.push(`/(tabs)/templates/${template.id}` as never);
      } catch (e: unknown) {
        Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to create template.');
      }
    },
    [createTemplate],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Templates</Text>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color="#71717a" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search templates…"
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#a3e635" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color="#71717a" />
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={fetchTemplates}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="list-outline" size={48} color="#27272a" />
            <Text style={styles.emptyTitle}>
              {query ? 'No templates match your search' : 'No templates yet'}
            </Text>
            {!query && (
              <Text style={styles.emptySubtitle}>
                Create a template to save your favourite workouts
              </Text>
            )}
          </View>
        ) : (
          <SectionList
            sections={[
              ...(pinned.length > 0 ? [{ title: 'Pinned', data: pinned }] : []),
              { title: 'All Templates', data: all },
            ]}
            keyExtractor={(item) => item.id}
            renderSectionHeader={({ section }) =>
              section.title && filtered.length > 0 ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>{section.title}</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <TemplateRow
                item={item}
                onPress={handlePress}
                onLongPress={handleLongPress}
                onDelete={confirmDelete}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
          />
        )}

        {/* FAB */}
        <Pressable
          style={styles.fab}
          onPress={() => setShowCreate(true)}
        >
          <Ionicons name="add" size={28} color="#09090b" />
        </Pressable>

        {/* Create modal */}
        <CreateModal
          visible={showCreate}
          onConfirm={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#09090b' },
  container: { flex: 1, backgroundColor: '#09090b' },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#fafafa' },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 11, color: '#fafafa', fontSize: 16 },

  // Section header
  sectionHeader: { paddingHorizontal: 20, paddingVertical: 8, paddingTop: 16 },
  sectionHeaderText: { fontSize: 12, fontWeight: '700', color: '#52525b', letterSpacing: 0.8, textTransform: 'uppercase' },

  // List
  listContent: { paddingBottom: 100 },
  separator: { height: 1, backgroundColor: '#18181b', marginHorizontal: 20 },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#09090b',
    gap: 10,
  },
  rowPressed: { backgroundColor: '#18181b' },
  pinIcon: { marginRight: -2 },
  rowInfo: { flex: 1, gap: 3 },
  rowName: { fontSize: 16, fontWeight: '600', color: '#fafafa' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMetaText: { fontSize: 13, color: '#71717a' },
  rowMetaDot: { fontSize: 13, color: '#3f3f46' },

  // Swipe delete
  deleteAction: {
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    gap: 4,
  },
  deleteActionText: { color: '#fafafa', fontSize: 12, fontWeight: '600' },

  // Empty / error states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#71717a', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#52525b', textAlign: 'center', maxWidth: 240 },
  emptyText: { color: '#71717a', fontSize: 15, textAlign: 'center' },
  retryBtn: { backgroundColor: '#27272a', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fafafa', fontWeight: '600' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#a3e635',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#a3e635',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // Create modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#18181b',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    gap: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fafafa' },
  modalInput: {
    backgroundColor: '#09090b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fafafa',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1,
    backgroundColor: '#27272a',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCancelText: { color: '#a1a1aa', fontWeight: '600', fontSize: 15 },
  modalCreate: {
    flex: 1,
    backgroundColor: '#a3e635',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCreateDisabled: { opacity: 0.4 },
  modalCreateText: { color: '#09090b', fontWeight: '700', fontSize: 15 },
});
