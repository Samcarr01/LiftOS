/**
 * OfflineIndicator — subtle, non-blocking banner shown when device is offline.
 * Subscribes to NetInfo; auto-shows/hides on connectivity changes.
 * Renders at the top of the screen without pushing content down (absolute).
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected ?? true);
      setIsOffline(offline);
      Animated.timing(opacity, {
        toValue: offline ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
    return unsub;
  }, [opacity]);

  if (!isOffline) return null;

  return (
    <Animated.View style={[styles.banner, { opacity }]} pointerEvents="none">
      <View style={styles.content}>
        <Text style={styles.dot}>●</Text>
        <Text style={styles.text}>Offline — sets saved locally</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#1c1917',
    borderBottomWidth: 1,
    borderBottomColor: '#292524',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 6,
  },
  dot: {
    color: '#f97316',
    fontSize: 8,
  },
  text: {
    color: '#a8a29e',
    fontSize: 12,
    fontWeight: '500',
  },
});
