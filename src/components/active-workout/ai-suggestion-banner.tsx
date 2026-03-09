/**
 * AISuggestionBanner — shows the AI progression target for an exercise.
 * Accept fills the next uncompleted set with target values.
 * Dismiss hides the banner for the current session.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, LayoutAnimation,
} from 'react-native';
import type { AISuggestionData, SetValues } from '@/types';

interface AISuggestionBannerProps {
  suggestion: AISuggestionData;
  onAccept: (values: SetValues) => void;
  onDismiss: () => void;
}

function targetLabel(suggestion: AISuggestionData): string {
  const p = suggestion.primary;
  const parts: string[] = [];
  if (p.weight !== undefined) parts.push(`${p.weight}kg`);
  if (p.reps !== undefined) parts.push(`${p.reps} reps`);
  if (p.duration !== undefined) parts.push(`${p.duration}s`);
  if (p.distance !== undefined) parts.push(`${p.distance}m`);
  return parts.join(' × ') || 'Target set';
}

function buildAcceptValues(suggestion: AISuggestionData): SetValues {
  const p = suggestion.primary;
  const values: SetValues = {};
  if (p.weight !== undefined) values['weight'] = p.weight;
  if (p.reps !== undefined) values['reps'] = p.reps;
  if (p.duration !== undefined) values['duration'] = p.duration;
  if (p.distance !== undefined) values['distance'] = p.distance;
  return values;
}

export function AISuggestionBanner({ suggestion, onAccept, onDismiss }: AISuggestionBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.aiLabel}>✦ AI</Text>
          <Text style={styles.target}>{targetLabel(suggestion)}</Text>
          {suggestion.plateau_flag && (
            <View style={styles.plateauBadge}>
              <Text style={styles.plateauText}>⚠ Plateau</Text>
            </View>
          )}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={toggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.expandText}>{expanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => onAccept(buildAcceptValues(suggestion))}
            activeOpacity={0.8}
          >
            <Text style={styles.acceptText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={onDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {expanded && (
        <View style={styles.rationale}>
          {suggestion.plateau_flag && suggestion.plateau_intervention && (
            <View style={styles.interventionBox}>
              <Text style={styles.interventionLabel}>Plateau Tip</Text>
              <Text style={styles.interventionText}>{suggestion.plateau_intervention}</Text>
            </View>
          )}
          <Text style={styles.rationaleText}>{suggestion.primary.rationale}</Text>
          {suggestion.alternative && (
            <Text style={styles.altText}>
              Alt: {targetLabel({ ...suggestion, primary: suggestion.alternative })}
              {' — '}{suggestion.alternative.rationale}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1f14',
    borderWidth: 1,
    borderColor: '#4d7c0f',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiLabel: {
    color: '#a3e635',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  target: {
    color: '#d9f99d',
    fontSize: 15,
    fontWeight: '700',
  },
  plateauBadge: {
    backgroundColor: '#713f12',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  plateauText: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandText: { color: '#64748b', fontSize: 12 },
  acceptBtn: {
    backgroundColor: '#a3e635',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 44,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  dismissBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: { color: '#64748b', fontSize: 16 },
  rationale: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2f0c',
    gap: 4,
  },
  interventionBox: {
    backgroundColor: '#451a03',
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  interventionLabel: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  interventionText: {
    color: '#fde68a',
    fontSize: 12,
    lineHeight: 18,
  },
  rationaleText: {
    color: '#86efac',
    fontSize: 12,
    lineHeight: 18,
  },
  altText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
});
