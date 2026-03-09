import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuthStore } from '@/store/auth-store';

type Mode = 'signin' | 'signup';

export function LoginScreen() {
  const {
    signInWithApple,
    signInWithGoogle,
    signInWithEmail,
    signUp,
    resetPassword,
    isLoading,
    error,
    setError,
  } = useAuthStore();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);

  function clearError() {
    if (error) setError(null);
  }

  async function handleEmailSubmit() {
    if (!email.trim() || !password) return;
    if (mode === 'signin') {
      await signInWithEmail(email, password);
    } else {
      await signUp(email, password);
    }
  }

  async function handleReset() {
    if (!resetEmail.trim()) return;
    setResetSending(true);
    await resetPassword(resetEmail);
    setResetSending(false);
    setShowResetModal(false);
    setResetEmail('');
  }

  const isSignUp = mode === 'signup';

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

          <Text style={styles.tagline}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Text>

          {/* Error banner */}
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* OAuth buttons */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                isSignUp
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={14}
              style={styles.appleButton}
              onPress={() => { clearError(); signInWithApple(); }}
            />
          )}

          <Pressable
            style={styles.googleButton}
            onPress={() => { clearError(); signInWithGoogle(); }}
            disabled={isLoading}
          >
            <Ionicons name="logo-google" size={20} color="#fafafa" />
            <Text style={styles.googleButtonText}>
              {isSignUp ? 'Sign up with Google' : 'Sign in with Google'}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email form */}
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(v) => { setEmail(v); clearError(); }}
              placeholder="you@example.com"
              placeholderTextColor="#52525b"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              textContentType="emailAddress"
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={(v) => { setPassword(v); clearError(); }}
                placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
                placeholderTextColor="#52525b"
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleEmailSubmit}
                textContentType={isSignUp ? 'newPassword' : 'password'}
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

            {/* Forgot password (sign-in only) */}
            {!isSignUp && (
              <Pressable
                style={styles.forgotLink}
                onPress={() => setShowResetModal(true)}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}
          </View>

          {/* Submit */}
          <Pressable
            style={[styles.submitButton, isLoading && styles.submitDisabled]}
            onPress={handleEmailSubmit}
            disabled={isLoading || !email.trim() || !password}
          >
            {isLoading ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <Text style={styles.submitText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </Pressable>

          {/* Mode toggle */}
          <Pressable
            style={styles.toggleRow}
            onPress={() => { setMode(isSignUp ? 'signin' : 'signup'); clearError(); }}
          >
            <Text style={styles.toggleText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.toggleLink}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Password Reset Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSubtitle}>
              Enter your email and we'll send a reset link.
            </Text>
            <TextInput
              style={styles.input}
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder="you@example.com"
              placeholderTextColor="#52525b"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.submitButton, resetSending && styles.submitDisabled]}
              onPress={handleReset}
              disabled={resetSending || !resetEmail.trim()}
            >
              {resetSending ? (
                <ActivityIndicator color="#09090b" />
              ) : (
                <Text style={styles.submitText}>Send Reset Email</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.toggleRow}
              onPress={() => setShowResetModal(false)}
            >
              <Text style={styles.toggleLink}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#09090b' },
  scroll: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },

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
  tagline: { fontSize: 16, color: '#71717a', marginBottom: 8 },

  // Error
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

  // Apple
  appleButton: { height: 52 },

  // Google
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181b',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  googleButtonText: { color: '#fafafa', fontSize: 16, fontWeight: '600' },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#27272a' },
  dividerText: { color: '#52525b', fontSize: 13 },

  // Form
  form: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginTop: 4 },
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
  forgotLink: { alignSelf: 'flex-end', paddingVertical: 4 },
  forgotText: { color: '#a3e635', fontSize: 13, fontWeight: '600' },

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
  toggleText: { color: '#71717a', fontSize: 14 },
  toggleLink: { color: '#a3e635', fontWeight: '600' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 14,
    borderTopWidth: 1,
    borderColor: '#27272a',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fafafa' },
  modalSubtitle: { fontSize: 14, color: '#71717a' },
});
