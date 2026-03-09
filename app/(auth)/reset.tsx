/**
 * Password Reset Screen
 *
 * Handles the `liftos://reset?token_hash=xxx&type=recovery` deep link that
 * Supabase includes in its password-reset emails.
 *
 * Flow:
 *  1. Parse token_hash + type from URL params.
 *  2. Call verifyOtp to exchange the token for a recovery session.
 *  3. Show new-password form.
 *  4. Call updateUser({ password }) → sign out → redirect to login.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { showError } from '@/lib/toast';

export default function ResetScreen() {
  const { token_hash, type } = useLocalSearchParams<{
    token_hash: string;
    type: string;
  }>();

  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token_hash && type === 'recovery') {
      verifyToken();
    } else if (type && type !== 'recovery') {
      setError('Invalid reset link type.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token_hash, type]);

  async function verifyToken() {
    setVerifying(true);
    try {
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: token_hash as string,
        type: 'recovery',
      });
      if (otpError) throw otpError;
      setVerified(true);
    } catch (err: unknown) {
      const msg =
        (err as { message?: string }).message ?? 'Invalid or expired reset link.';
      setError(msg);
      showError(msg, 'Reset Link Invalid');
    } finally {
      setVerifying(false);
    }
  }

  async function handleSetPassword() {
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Sign out so the user logs in fresh with their new password
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    } catch (err: unknown) {
      const msg =
        (err as { message?: string }).message ?? 'Failed to update password.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (verifying) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#a3e635" />
        <Text style={styles.verifyingText}>Verifying reset link…</Text>
      </SafeAreaView>
    );
  }

  // ── Error: invalid / expired token ────────────────────────────────────────
  if (error && !verified) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorTitle}>Reset Link Invalid</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable
          style={styles.backButton}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.backText}>Back to Sign In</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── No params (e.g. direct navigation) ───────────────────────────────────
  if (!token_hash) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorTitle}>No Reset Token</Text>
        <Text style={styles.errorBody}>
          Open the link from your reset email to continue.
        </Text>
        <Pressable
          style={styles.backButton}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.backText}>Back to Sign In</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── New password form ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <Ionicons name="barbell" size={32} color="#09090b" />
            </View>
            <Text style={styles.logoText}>LiftOS</Text>
          </View>

          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>
            Choose a strong password to secure your account.
          </Text>

          {/* Error banner */}
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* New password */}
          <Text style={styles.label}>New Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              placeholder="At least 6 characters"
              placeholderTextColor="#52525b"
              secureTextEntry={!showPassword}
              textContentType="newPassword"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#71717a"
              />
            </Pressable>
          </View>

          {/* Confirm password */}
          <Text style={[styles.label, styles.labelSpaced]}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={(v) => { setConfirm(v); setError(null); }}
            placeholder="Re-enter password"
            placeholderTextColor="#52525b"
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSetPassword}
          />

          {/* Submit */}
          <Pressable
            style={[
              styles.submitButton,
              (isLoading || !password || !confirm) && styles.submitDisabled,
            ]}
            onPress={handleSetPassword}
            disabled={isLoading || !password || !confirm}
          >
            {isLoading ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <Text style={styles.submitText}>Update Password</Text>
            )}
          </Pressable>

          {/* Back link */}
          <Pressable
            style={styles.toggleRow}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.toggleLink}>Back to Sign In</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#09090b' },
  centerContent: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  scroll: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },

  // Verifying state
  verifyingText: { color: '#71717a', fontSize: 15, marginTop: 12 },

  // Error state (full-screen)
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#fafafa', textAlign: 'center' },
  errorBody: { fontSize: 14, color: '#71717a', textAlign: 'center', lineHeight: 20 },
  backButton: {
    backgroundColor: '#a3e635',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  backText: { color: '#09090b', fontSize: 16, fontWeight: '700' },

  // Logo
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  logoMark: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#a3e635',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 32, fontWeight: '800', color: '#fafafa', letterSpacing: -1 },

  // Headings
  title: { fontSize: 22, fontWeight: '700', color: '#fafafa' },
  subtitle: { fontSize: 14, color: '#71717a', lineHeight: 20 },

  // Error banner (inline)
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#450a0a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  errorText: { color: '#fca5a5', fontSize: 14, flex: 1 },

  // Form
  label: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginTop: 4 },
  labelSpaced: { marginTop: 12 },
  input: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fafafa',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  // Submit
  submitButton: {
    backgroundColor: '#a3e635',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#09090b', fontSize: 17, fontWeight: '700' },

  // Toggle
  toggleRow: { alignItems: 'center', paddingVertical: 4 },
  toggleLink: { color: '#a3e635', fontWeight: '600', fontSize: 14 },
});
