/**
 * ProfileScreen — account settings, data management, and sign-out.
 *
 * Sections:
 *  1. Avatar + editable display name + email (read-only)
 *  2. Unit preference toggle (kg / lb) — global, persisted
 *  3. Sync status indicator (failed queue count)
 *  4. Export data (JSON → native share sheet)
 *  5. App version
 *  6. Log out
 *  7. Delete account (double confirmation: "Type DELETE")
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuthStore } from '@/store/auth-store';
import { supabase } from '@/lib/supabase';
import { exportUserData } from '@/lib/export';
import { clearAllLocalData, getFailedCount } from '@/lib/offline';
import { offlineQueue } from '@/lib/offline-queue';

// ── Helpers ───────────────────────────────────────────────────────────────────

const APP_VERSION =
  Constants.expoConfig?.version ?? Constants.manifest?.version ?? '1.0.0';

// ── Name edit modal ───────────────────────────────────────────────────────────

function EditNameModal({
  visible,
  current,
  onSave,
  onClose,
}: {
  visible: boolean;
  current: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(current);

  useEffect(() => {
    if (visible) setValue(current);
  }, [visible, current]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalCenter}
        pointerEvents="box-none"
      >
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Display Name</Text>
          <TextInput
            style={styles.modalInput}
            value={value}
            onChangeText={setValue}
            placeholder="Your name"
            placeholderTextColor="#52525b"
            autoFocus
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={() => onSave(value.trim())}
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalSave, !value.trim() && styles.modalSaveDisabled]}
              onPress={() => onSave(value.trim())}
              disabled={!value.trim()}
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({
  visible,
  isDeleting,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (visible) setInput('');
  }, [visible]);

  const canDelete = input === 'DELETE';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBottom}
        pointerEvents="box-none"
      >
        <View style={styles.deleteSheet}>
          <View style={styles.sheetHandle} />
          <Ionicons name="warning-outline" size={36} color="#ef4444" style={styles.deleteIcon} />
          <Text style={styles.deleteTitle}>Delete Account</Text>
          <Text style={styles.deleteBody}>
            This permanently deletes ALL your data:{'\n'}workouts, templates, personal records, and
            progress. This action cannot be undone.
          </Text>
          <Text style={styles.deleteLabel}>Type DELETE to confirm</Text>
          <TextInput
            style={[styles.deleteInput, canDelete && styles.deleteInputReady]}
            value={input}
            onChangeText={setInput}
            placeholder="DELETE"
            placeholderTextColor="#52525b"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.deleteConfirmBtn, !canDelete && styles.deleteConfirmBtnDisabled]}
            onPress={onConfirm}
            disabled={!canDelete || isDeleting}
            activeOpacity={0.8}
          >
            {isDeleting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.deleteConfirmText}>Delete My Account</Text>
            )}
          </TouchableOpacity>
          <Pressable style={styles.deleteCancelBtn} onPress={onClose} disabled={isDeleting}>
            <Text style={styles.deleteCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const profile      = useAuthStore((s) => s.profile);
  const user         = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut      = useAuthStore((s) => s.signOut);

  const [editNameVisible, setEditNameVisible]   = useState(false);
  const [deleteVisible, setDeleteVisible]       = useState(false);
  const [isDeleting, setIsDeleting]             = useState(false);
  const [isExporting, setIsExporting]           = useState(false);
  const [failedCount, setFailedCount]           = useState(0);

  // Load failed sync count on mount
  useEffect(() => {
    getFailedCount().then(setFailedCount).catch(() => {});
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveName = useCallback(
    async (name: string) => {
      setEditNameVisible(false);
      if (!name || name === profile?.displayName) return;
      await updateProfile({ displayName: name });
    },
    [updateProfile, profile?.displayName],
  );

  const handleUnitToggle = useCallback(
    async (unit: 'kg' | 'lb') => {
      if (unit === profile?.unitPreference) return;
      await updateProfile({ unitPreference: unit });
    },
    [updateProfile, profile?.unitPreference],
  );

  const handleExport = useCallback(async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      await exportUserData(user.id);
    } catch (err: unknown) {
      Alert.alert('Export Failed', (err as { message?: string }).message ?? 'Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [user]);

  const handleLogout = useCallback(async () => {
    // Clear offline queue before signing out
    await clearAllLocalData();
    offlineQueue.drain();
    await signOut();
    // Auth routing handles the redirect to (auth)
  }, [signOut]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const { data, error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      if ((data as { success?: boolean })?.success === false) {
        throw new Error('Deletion failed on server');
      }

      // Clear local data + sign out store state
      await clearAllLocalData();
      offlineQueue.drain();
      await signOut();
      // Auth routing redirects automatically
    } catch (err: unknown) {
      setIsDeleting(false);
      setDeleteVisible(false);
      Alert.alert(
        'Deletion Failed',
        (err as { message?: string }).message ?? 'Please try again.',
      );
    }
  }, [user, signOut]);

  // ── Render ────────────────────────────────────────────────────────────────

  const displayName   = profile?.displayName ?? user?.email?.split('@')[0] ?? 'Lifter';
  const email         = profile?.email ?? user?.email ?? '';
  const unit          = profile?.unitPreference ?? 'kg';
  const tier          = profile?.subscriptionTier ?? 'free';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Profile</Text>

        {/* ── Identity card ── */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color="#71717a" />
            </View>
            <View style={styles.identity}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{displayName}</Text>
                <Pressable
                  style={styles.editBtn}
                  onPress={() => setEditNameVisible(true)}
                  hitSlop={8}
                >
                  <Ionicons name="pencil-outline" size={16} color="#71717a" />
                </Pressable>
              </View>
              <Text style={styles.email}>{email}</Text>
              {tier === 'pro' && (
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Unit preference ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Units</Text>
          <View style={styles.card}>
            <View style={styles.unitRow}>
              <Text style={styles.rowLabel}>Weight units</Text>
              <View style={styles.unitToggle}>
                <Pressable
                  style={[styles.unitOption, unit === 'kg' && styles.unitOptionActive]}
                  onPress={() => handleUnitToggle('kg')}
                >
                  <Text style={[styles.unitOptionText, unit === 'kg' && styles.unitOptionTextActive]}>
                    kg
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.unitOption, unit === 'lb' && styles.unitOptionActive]}
                  onPress={() => handleUnitToggle('lb')}
                >
                  <Text style={[styles.unitOptionText, unit === 'lb' && styles.unitOptionTextActive]}>
                    lb
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* ── Sync status ── */}
        {failedCount > 0 && (
          <View style={styles.section}>
            <View style={styles.syncWarning}>
              <Ionicons name="warning-outline" size={18} color="#f59e0b" />
              <Text style={styles.syncWarningText}>
                {failedCount} mutation{failedCount !== 1 ? 's' : ''} failed to sync.
                Re-open the app when online to retry.
              </Text>
            </View>
          </View>
        )}

        {/* ── Data ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Data</Text>
          <View style={styles.card}>
            <Pressable style={styles.row} onPress={handleExport} disabled={isExporting}>
              <Ionicons name="download-outline" size={20} color="#a1a1aa" />
              <Text style={styles.rowLabel}>Export data</Text>
              {isExporting ? (
                <ActivityIndicator size="small" color="#71717a" />
              ) : (
                <Ionicons name="chevron-forward" size={16} color="#3f3f46" />
              )}
            </Pressable>
          </View>
        </View>

        {/* ── App info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>App</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="information-circle-outline" size={20} color="#a1a1aa" />
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>{APP_VERSION}</Text>
            </View>
          </View>
        </View>

        {/* ── Account actions ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            <Pressable style={styles.row} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#a1a1aa" />
              <Text style={styles.rowLabel}>Log out</Text>
              <Ionicons name="chevron-forward" size={16} color="#3f3f46" />
            </Pressable>
            <View style={styles.rowDivider} />
            <Pressable style={styles.row} onPress={() => setDeleteVisible(true)}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
              <Text style={[styles.rowLabel, styles.destructive]}>Delete account</Text>
              <Ionicons name="chevron-forward" size={16} color="#3f3f46" />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* ── Edit name modal ── */}
      <EditNameModal
        visible={editNameVisible}
        current={displayName}
        onSave={handleSaveName}
        onClose={() => setEditNameVisible(false)}
      />

      {/* ── Delete confirmation modal ── */}
      <DeleteModal
        visible={deleteVisible}
        isDeleting={isDeleting}
        onConfirm={handleDeleteConfirm}
        onClose={() => !isDeleting && setDeleteVisible(false)}
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
    paddingBottom: 48,
    gap: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fafafa',
    marginBottom: 4,
  },

  // Cards
  card: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    overflow: 'hidden',
  },

  // Sections
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },

  // Avatar / identity
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fafafa',
  },
  editBtn: {
    padding: 4,
  },
  email: {
    fontSize: 13,
    color: '#71717a',
  },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#a3e635',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#09090b',
    letterSpacing: 0.5,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 50,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: '#e4e4e7',
  },
  rowValue: {
    fontSize: 14,
    color: '#71717a',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#27272a',
    marginHorizontal: 16,
  },
  destructive: {
    color: '#ef4444',
  },

  // Unit toggle
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  unitOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 44,
    alignItems: 'center',
  },
  unitOptionActive: {
    backgroundColor: '#a3e635',
  },
  unitOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#71717a',
  },
  unitOptionTextActive: {
    color: '#09090b',
  },

  // Sync warning
  syncWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#431407',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#78350f',
  },
  syncWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#fcd34d',
    lineHeight: 18,
  },

  // Modals — shared overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },

  // Edit name modal (centered)
  modalCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fafafa',
  },
  modalInput: {
    backgroundColor: '#27272a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fafafa',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#27272a',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#a1a1aa',
  },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#a3e635',
    alignItems: 'center',
  },
  modalSaveDisabled: {
    backgroundColor: '#3f3f46',
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#09090b',
  },

  // Delete modal (bottom sheet)
  modalBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  deleteSheet: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  deleteIcon: {
    alignSelf: 'center',
    marginBottom: 4,
  },
  deleteTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fafafa',
    textAlign: 'center',
  },
  deleteBody: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 20,
  },
  deleteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#71717a',
    marginTop: 4,
  },
  deleteInput: {
    backgroundColor: '#27272a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fafafa',
    borderWidth: 1.5,
    borderColor: '#3f3f46',
    letterSpacing: 2,
  },
  deleteInputReady: {
    borderColor: '#ef4444',
  },
  deleteConfirmBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteConfirmBtnDisabled: {
    backgroundColor: '#3f3f46',
  },
  deleteConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  deleteCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteCancelText: {
    fontSize: 15,
    color: '#71717a',
  },
});
