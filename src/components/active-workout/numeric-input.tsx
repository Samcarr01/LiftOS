/**
 * NumericInput — large tappable cell that opens a numpad bottom-sheet modal.
 * Decimal mode for weight/distance fields; integer mode for reps/laps/duration.
 * Quick ±step buttons for rapid adjustment without reopening.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  Pressable, Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TrackingField } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDecimalField(field: TrackingField): boolean {
  const decimalUnits = ['kg', 'lb', 'metres', 'km', 'miles'];
  return field.type === 'number' && decimalUnits.includes(field.unit ?? '');
}

function stepForField(field: TrackingField): number {
  if (field.unit === 'kg' || field.unit === 'lb') return 2.5;
  if (field.unit === 'seconds' || field.unit === 'minutes') return 5;
  if (field.unit === 'metres' || field.unit === 'km' || field.unit === 'miles') return 0.5;
  return 1;
}

function formatValue(value: number | string | undefined, field: TrackingField): string {
  if (value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return isDecimalField(field) ? value.toFixed(1) : String(value);
  }
  return String(value);
}

// ── Numpad key ────────────────────────────────────────────────────────────────

interface NumpadKeyProps {
  label: string;
  onPress: () => void;
  wide?: boolean;
  accent?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

function NumpadKey({ label, onPress, wide, accent, danger, disabled }: NumpadKeyProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.key,
        wide && styles.keyWide,
        accent && styles.keyAccent,
        danger && styles.keyDanger,
        disabled && styles.keyDisabled,
      ]}
      activeOpacity={0.7}
    >
      <Text style={[styles.keyText, accent && styles.keyTextAccent, danger && styles.keyTextDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Numpad modal ──────────────────────────────────────────────────────────────

interface NumpadModalProps {
  visible: boolean;
  field: TrackingField;
  initialValue: number | string | undefined;
  onConfirm: (value: number | string) => void;
  onDismiss: () => void;
}

function NumpadModal({ visible, field, initialValue, onConfirm, onDismiss }: NumpadModalProps) {
  const insets = useSafeAreaInsets();
  const decimal = isDecimalField(field);
  const step = stepForField(field);
  const [draft, setDraft] = useState(() =>
    initialValue !== undefined && initialValue !== '' ? String(initialValue) : '',
  );

  // Reset draft when modal opens
  React.useEffect(() => {
    if (visible) {
      setDraft(initialValue !== undefined && initialValue !== '' ? String(initialValue) : '');
    }
  }, [visible, initialValue]);

  const appendChar = useCallback((char: string) => {
    setDraft((prev) => {
      if (char === '.' && (!decimal || prev.includes('.'))) return prev;
      if (prev.length >= 8) return prev;
      return prev + char;
    });
  }, [decimal]);

  const backspace = useCallback(() => {
    setDraft((prev) => prev.slice(0, -1));
  }, []);

  const adjust = useCallback((delta: number) => {
    const current = parseFloat(draft) || 0;
    const next = Math.max(0, +(current + delta).toFixed(2));
    setDraft(decimal ? String(next) : String(Math.round(next)));
  }, [draft, decimal]);

  const confirm = useCallback(() => {
    if (draft === '') { onDismiss(); return; }
    const num = decimal ? parseFloat(draft) : parseInt(draft, 10);
    if (!isNaN(num)) {
      onConfirm(num);
    }
    onDismiss();
  }, [draft, decimal, onConfirm, onDismiss]);

  const displayValue = draft === '' ? '—' : draft;
  const unitLabel = field.unit ? ` ${field.unit}` : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Value display */}
        <View style={styles.displayRow}>
          <Text style={styles.fieldLabel}>{field.label}{unitLabel}</Text>
          <Text style={styles.displayValue}>{displayValue}</Text>
        </View>

        {/* Quick adjust row */}
        <View style={styles.adjustRow}>
          <TouchableOpacity style={styles.adjustBtn} onPress={() => adjust(-step)}>
            <Text style={styles.adjustText}>−{step}</Text>
          </TouchableOpacity>
          <View style={styles.adjustSpacer} />
          <TouchableOpacity style={styles.adjustBtn} onPress={() => adjust(step)}>
            <Text style={styles.adjustText}>+{step}</Text>
          </TouchableOpacity>
        </View>

        {/* Numpad grid */}
        <View style={styles.numpad}>
          {/* Row 1 */}
          <View style={styles.numpadRow}>
            <NumpadKey label="7" onPress={() => appendChar('7')} />
            <NumpadKey label="8" onPress={() => appendChar('8')} />
            <NumpadKey label="9" onPress={() => appendChar('9')} />
            <NumpadKey label="⌫" onPress={backspace} danger />
          </View>
          {/* Row 2 */}
          <View style={styles.numpadRow}>
            <NumpadKey label="4" onPress={() => appendChar('4')} />
            <NumpadKey label="5" onPress={() => appendChar('5')} />
            <NumpadKey label="6" onPress={() => appendChar('6')} />
            <NumpadKey label="" onPress={() => {}} disabled />
          </View>
          {/* Row 3 */}
          <View style={styles.numpadRow}>
            <NumpadKey label="1" onPress={() => appendChar('1')} />
            <NumpadKey label="2" onPress={() => appendChar('2')} />
            <NumpadKey label="3" onPress={() => appendChar('3')} />
            <NumpadKey label="" onPress={() => {}} disabled />
          </View>
          {/* Row 4 */}
          <View style={styles.numpadRow}>
            <NumpadKey label="0" onPress={() => appendChar('0')} />
            <NumpadKey label="." onPress={() => appendChar('.')} disabled={!decimal} />
            <NumpadKey label="✓" onPress={confirm} accent wide />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── NumericInput ──────────────────────────────────────────────────────────────

interface NumericInputProps {
  field: TrackingField;
  value: number | string | undefined;
  onChange: (value: number | string) => void;
  highlighted?: boolean;
  completed?: boolean;
}

export function NumericInput({ field, value, onChange, highlighted, completed }: NumericInputProps) {
  const [open, setOpen] = useState(false);

  const handleConfirm = useCallback(
    (v: number | string) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      <TouchableOpacity
        style={[
          styles.inputCell,
          highlighted && !completed && styles.inputCellHighlighted,
          completed && styles.inputCellCompleted,
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Text
          style={[
            styles.inputText,
            highlighted && !completed && styles.inputTextHighlighted,
            completed && styles.inputTextCompleted,
          ]}
          numberOfLines={1}
        >
          {formatValue(value, field)}
        </Text>
      </TouchableOpacity>

      <NumpadModal
        visible={open}
        field={field}
        initialValue={value}
        onConfirm={handleConfirm}
        onDismiss={() => setOpen(false)}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Input cell
  inputCell: {
    minWidth: 56,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 8,
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputCellHighlighted: {
    borderColor: '#a3e635',
    backgroundColor: '#1a2e0a',
  },
  inputCellCompleted: {
    borderColor: '#22c55e',
    backgroundColor: '#052e16',
  },
  inputText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  inputTextHighlighted: {
    color: '#a3e635',
  },
  inputTextCompleted: {
    color: '#22c55e',
  },

  // Overlay + sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
  },

  // Value display
  displayRow: {
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  fieldLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  displayValue: {
    color: '#f8fafc',
    fontSize: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },

  // Quick adjust
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  adjustBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 10,
  },
  adjustText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  adjustSpacer: { width: 12 },

  // Numpad
  numpad: { paddingTop: 4, paddingBottom: 8 },
  numpadRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  key: {
    flex: 1,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 10,
  },
  keyWide: { flex: 2 },
  keyAccent: { backgroundColor: '#a3e635' },
  keyDanger: { backgroundColor: '#7f1d1d' },
  keyDisabled: { backgroundColor: '#1e293b', opacity: 0.3 },
  keyText: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '600',
  },
  keyTextAccent: { color: '#0f172a' },
  keyTextDanger: { color: '#fca5a5' },
});
