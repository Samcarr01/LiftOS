# Claude-ui – UI Screens & Components

This module defines all mobile app screens, navigation structure, component hierarchy, and interaction patterns. Mobile-first, one-handed operation, speed above everything.

## Navigation Structure

### Tab Navigator (Bottom)
1. **Home** – Dashboard
2. **Templates** – Workout template management
3. **History** – Past workouts calendar/list
4. **Progress** – Graphs and PRs
5. **Profile** – Settings and account

### Stack Navigators (Per Tab)
- Home → ActiveWorkout → ExerciseDetail
- Templates → TemplateEditor → ExerciseSelector → ExerciseCreator
- History → SessionDetail
- Progress → ExerciseProgressDetail

---

## Screens

### Home Dashboard
#### Layout
- **Greeting + streak counter** (top)
- **Suggested Workout** card (based on recency: longest-since-last template)
- **Pinned Workouts** horizontal scroll
- **Recent Workouts** list (last 3-5 sessions with date, template name, duration)
- **Last Session Highlights** ("Bench: 80kg × 5", "Squat: 100kg × 3")
- **Start Workout** FAB button (always visible)

#### Interactions
- Tap Suggested → start that workout
- Tap Pinned → start that workout
- Tap Recent → view session detail
- Tap FAB → select template or start blank

#### Constraints
- **Screen must render in < 300ms (cache data locally)**
- **FAB must be reachable with right thumb**
- *Pull-to-refresh updates suggestions and history*

---

### Template List
#### Layout
- Search bar (top)
- Pinned templates section
- All templates list (alphabetical or last-used)
- Create Template button

#### Interactions
- Tap template → TemplateEditor
- Long press → context menu (duplicate, pin/unpin, delete)
- Swipe left → delete with confirmation

---

### Template Editor
#### Layout
- Template name input (top)
- Exercise list (drag-to-reorder)
- Each exercise row shows: name, muscle group badge, set count, rest timer
- Superset grouping indicator (colour-coded sidebar)
- Add Exercise button (bottom)

#### Interactions
- Tap exercise row → edit set count, rest timer, target ranges, notes
- Tap Add Exercise → ExerciseSelector
- Drag handle → reorder
- Swipe left → remove exercise

#### Constraints
- **Reorder must use optimistic UI (instant visual feedback)**
- *Auto-save on every change (debounced)*

---

### Exercise Selector
#### Layout
- Search bar with recent/frequent exercises
- Filter by muscle group (chip row)
- Exercise list with muscle group badges
- Create New Exercise button

#### Constraints
- **Search must be instant (local filter, not server)**
- *Show tracking type icon per exercise (dumbbell, clock, ruler, etc.)*

---

### Exercise Creator
#### Layout
- Name input
- Muscle group multi-select (chips)
- Tracking type selector:
  - Preset: Weight+Reps, Bodyweight+Reps, Time, Distance, Laps
  - Custom: add your own fields
- For custom: field builder (key, label, type, unit, optional toggle)
- Default rest timer input
- Notes input

#### Constraints
- **Tracking schema validated with Zod before save**
- **Must preview what a set entry will look like**
- *Preset types auto-configure the tracking_schema*

---

### Active Workout Screen ⭐ (Most Critical)
#### Layout
- **Header:** Template name, elapsed timer, Finish button
- **Exercise cards** (scrollable, one per exercise):
  - Exercise name + muscle group
  - **Last Session column** (read-only, greyed) | **Current Session column** (editable)
  - Set rows: each row = [set number] [field inputs] [complete checkbox]
  - **Pre-filled values** from last session (editable, highlighted)
  - Add Set button
  - Rest timer button (per exercise)
  - AI suggestion banner (if Pro): "Target: 82.5kg × 5" with Accept/Dismiss
  - Notes expand toggle
- Superset groups visually connected (shared background/border)

#### Set Row Detail
```
[1]  [80.0 kg ▼] [5 reps ▼]  [✓]
[2]  [80.0 kg ▼] [5 reps ▼]  [✓]
[3]  [80.0 kg ▼] [4 reps ▼]  [ ]  ← current, prefilled from last time
```

#### Interactions
- **Tap number input → numpad opens with current value pre-selected**
- **Tap checkmark → mark set complete + start rest timer**
- **Swipe set row left → delete set**
- Tap "+" → add set (copies values from last completed set)
- Tap rest timer → countdown overlay (non-blocking)
- Tap AI suggestion Accept → fills next uncompleted set with target values
- Tap Finish → confirm dialog → complete-workout API

#### Constraints
- **Set logging must take < 2 seconds (tap field → enter number → tap check)**
- **Autosave every field change to local DB**
- **Offline-capable: all writes go to local queue first**
- **Numpad must show decimal point for weight fields**
- **Last session data displayed inline, never behind navigation**
- **Rest timer persists across exercise navigation (toast/overlay)**
- *Haptic feedback on set completion*
- *Exercise cards collapse when all sets complete*

#### State Management
```
ActiveWorkoutState {
  session: WorkoutSession
  exercises: Array<{
    sessionExercise: SessionExercise
    exercise: Exercise
    sets: SetEntry[]
    lastPerformanceSets: SetEntry[]
    aiSuggestion: AISuggestion | null
    restTimer: { isRunning, remaining }
  }>
  elapsedTimer: number
  isCompleting: boolean
}
```

---

### Session Detail (History)
#### Layout
- Date, duration, template name
- Exercise list with all sets logged
- PR badges on qualifying sets
- Volume summary
- Notes

---

### Progress Screen
#### Layout
- Exercise selector dropdown
- Graph tabs: Top Set | Estimated 1RM | Volume
- Time range selector (1M / 3M / 6M / 1Y / All)
- PR cards below graph
- Weekly summary card (if Pro)

#### Graph Specifications
- **Top Set:** Line chart, X = date, Y = weight (show reps as data label)
- **Estimated 1RM:** Line chart, Epley formula: weight × (1 + reps/30)
- **Volume:** Bar chart, X = session date, Y = total volume (weight × reps × sets)

#### Constraints
- **Charts must render smoothly (< 60fps scrolling)**
- *Use react-native-chart-kit, Victory Native, or react-native-gifted-charts*
- *Skeleton loading state while data loads*

---

### Weekly Summary Screen
#### Layout
- Week selector (swipe between weeks)
- Stats cards: workouts completed, total volume, total sets
- Strongest lift highlight
- Most improved muscle group
- AI insight paragraph (Pro)
- Comparison vs previous week (delta arrows)

---

### Profile Screen
#### Layout
- Display name + email
- Unit preference toggle (kg/lb)
- Subscription tier + upgrade CTA
- Export data button
- App version
- Logout button
- Delete account (with confirmation + data deletion)

#### Constraints
- **Delete account must purge all user data from Supabase**
- *Export as JSON or CSV*

---

## Component Library

### Shared Components
- `SetInput` – numeric input optimised for gym use (large tap targets, numpad)
- `RestTimer` – countdown overlay with sound/vibration
- `ExerciseCard` – reusable exercise display with sets
- `PRBadge` – small badge for personal records
- `AISuggestionBanner` – accept/dismiss AI target
- `MuscleGroupChip` – coloured chip for muscle groups
- `LoadingScreen` – skeleton placeholder
- `OfflineIndicator` – banner when offline (non-blocking)

### Design Tokens
- **Primary:** Bold, energetic colour (suggest: electric blue #2563EB or orange #F97316)
- **Background:** Near-black for gym readability (#0F172A)
- **Text:** White/light grey on dark
- **Success:** Green for completed sets
- **Warning:** Yellow for plateaus
- **Spacing:** 8px grid
- **Font:** System font, large touch targets (min 44px)
- **Dark mode default** (gym environment)

#### Constraints
- **Min touch target: 44×44px (Apple HIG)**
- **High contrast for readability in bright gym lighting**
- *Support system dark/light mode but default dark*
