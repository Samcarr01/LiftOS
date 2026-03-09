/**
 * HistoryList — paginated log of completed workout sessions.
 *
 * Sessions are grouped by month via inline section headers inside FlatList.
 * Pull-to-refresh resets and reloads from page 0.
 * Infinite scroll loads the next page when the user reaches the bottom.
 */
import React, { useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHistory } from '@/hooks/use-history';
import { SessionCard } from '@/components/history/session-card';
import { formatMonthHeader } from '@/lib/utils';
import type { HistorySessionSummary } from '@/types/app';

type ListItem =
  | { type: 'header'; month: string }
  | { type: 'session'; session: HistorySessionSummary };

function buildItems(sessions: HistorySessionSummary[]): ListItem[] {
  const items: ListItem[] = [];
  let lastMonth = '';

  for (const session of sessions) {
    const month = formatMonthHeader(session.started_at);
    if (month !== lastMonth) {
      items.push({ type: 'header', month });
      lastMonth = month;
    }
    items.push({ type: 'session', session });
  }

  return items;
}

export function HistoryList() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { sessions, isLoading, isRefreshing, hasMore, refresh, loadMore, init } = useHistory();

  useEffect(() => { init(); }, [init]);

  const items = buildItems(sessions);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return <Text style={styles.monthHeader}>{item.month}</Text>;
    }
    return (
      <SessionCard
        session={item.session}
        onPress={() => router.push(`/history/${item.session.id}`)}
      />
    );
  }, [router]);

  const keyExtractor = useCallback((item: ListItem) => {
    if (item.type === 'header') return `h-${item.month}`;
    return item.session.id;
  }, []);

  const ListEmpty = !isLoading ? (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🏋️</Text>
      <Text style={styles.emptyTitle}>No workouts yet</Text>
      <Text style={styles.emptyHint}>Complete a workout and it will appear here.</Text>
    </View>
  ) : null;

  const ListFooter = hasMore && sessions.length > 0 ? (
    <ActivityIndicator color="#a3e635" style={styles.footer} />
  ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.title}>History</Text>

      {isLoading && sessions.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color="#a3e635" size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 16 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor="#a3e635"
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={ListEmpty}
          ListFooterComponent={ListFooter}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  monthHeader: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingVertical: 20,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { color: '#64748b', fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyHint:  { color: '#475569', fontSize: 14, textAlign: 'center', maxWidth: 260 },
});
