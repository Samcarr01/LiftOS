# Claude-offline – Offline-First Architecture & Sync

This module defines the offline-first strategy, local storage, sync queue, and conflict resolution. Gym connectivity is unreliable; the app must never block on network.

## Core Principle
**Every user action writes to local storage first. Network sync happens in the background. The UI never waits on a network call to accept input.**

---

## Local Storage Strategy

### Option A: WatermelonDB (Recommended)
- SQLite-based, designed for React Native
- Built-in sync primitives
- Lazy loading, fast queries
- Observable queries for reactive UI

### Option B: Custom SQLite via expo-sqlite
- More control, less abstraction
- Requires manual sync queue implementation

### Decision
*Default to WatermelonDB unless a specific constraint blocks it. Fall back to expo-sqlite + custom queue.*

---

## Offline Queue

### Structure
Each offline mutation is stored as:
```typescript
interface QueuedMutation {
  id: string;           // UUID, idempotency key
  table: string;        // e.g., 'set_entries'
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, any>;
  timestamp: string;    // ISO, client clock
  retries: number;      // starts at 0
  status: 'pending' | 'syncing' | 'synced' | 'failed';
}
```

### Queue Behaviour
1. On any write action, insert into local DB AND add to queue
2. When online, process queue in timestamp order
3. Send batch to `sync-offline-queue` Edge Function (max 100 per batch)
4. On success, mark as synced and remove from queue
5. On failure, increment retries; retry with exponential backoff
6. After 5 retries, mark as failed and surface to user

### Constraints
- **Queue must survive app kill/restart (persisted in SQLite)**
- **Idempotency: server uses client_id to deduplicate**
- **Max queue size: 1000 mutations (alert user if approaching)**
- *Process queue on: app foreground, connectivity change, manual pull-to-refresh*

---

## Sync Triggers
- App comes to foreground → check connectivity → process queue
- Network state changes from offline to online → process queue
- User pulls to refresh → process queue + fetch latest data
- Workout completion → immediate sync attempt for session data

---

## Connectivity Detection
```typescript
import NetInfo from '@react-native-community/netinfo';

// Subscribe to changes
NetInfo.addEventListener(state => {
  if (state.isConnected) {
    processOfflineQueue();
  }
});
```

### Offline Indicator
- **Show subtle banner at top of screen when offline (non-blocking)**
- **Banner text: "Offline – your sets are saved locally"**
- *Banner dismisses automatically when back online*
- *No modal dialogs or blocking alerts for offline state*

---

## Conflict Resolution
**Strategy: Last-write-wins (LWW) by timestamp**

### Rules
1. Server compares `timestamp` field from client mutation with server's `updated_at`
2. If client timestamp > server timestamp → client wins
3. If client timestamp <= server timestamp → server wins (discard client mutation)
4. For set_entries specifically: client always wins (user's logged data is truth)

### Edge Case: Clock Skew
- *Use server timestamp on successful sync to calibrate local clock offset*
- *Store offset and apply to future mutations*

---

## Data Freshness

### Cached Locally (Always Available Offline)
- User profile + preferences
- All exercises
- All workout templates + template_exercises
- Last performance snapshots
- Cached AI suggestions
- Active workout session data

### Fetched on Demand (Requires Connection)
- Full workout history (paginated)
- Progress graphs data
- Weekly summaries
- New AI suggestion generation

### Cache Invalidation
- On app foreground: soft refresh (fetch if stale > 5 minutes)
- On workout completion: hard refresh for affected exercises
- On pull-to-refresh: hard refresh everything

---

## Active Workout Offline Behaviour
The most critical offline scenario:

1. User starts workout (data already cached locally)
2. Connection drops mid-workout
3. User continues logging sets → all writes go to local DB
4. Rest timers, set counts, notes all work locally
5. Connection returns → queue syncs in background
6. User taps Finish → complete-workout queued if still offline
7. When online, complete-workout syncs → triggers post-session pipeline

### Constraints
- **Zero user-facing disruption during offline workout**
- **No "saving..." spinners blocking set input**
- **Completion triggers (PR detection, AI regeneration) run when sync completes**
- *If user force-quits during offline workout, session data persists locally and resumes on next app open*

---

## Storage Limits
- **Local DB max: ~50MB (covers months of workout data)**
- **Offline queue max: 1000 pending mutations**
- *Periodically prune synced data older than 6 months from local cache (keep on server)*
