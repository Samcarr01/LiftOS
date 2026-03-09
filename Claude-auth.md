# Claude-auth – Authentication & User Management

This module defines auth flows, providers, session handling, and user onboarding.

## Auth Provider
**Supabase Auth** with the following sign-in methods:
- Apple Sign-In (required for iOS App Store)
- Google Sign-In
- Email + password (with email verification)

## Flows

### Sign Up
#### Steps
1. User selects provider (Apple / Google / Email)
2. Supabase Auth creates auth.users record
3. Database trigger inserts row into `public.users` with defaults
4. Post-signup Edge Function seeds ~20 common exercises for the user
5. Redirect to onboarding (unit preference selection: kg/lb)

#### Constraints
- **Email must be verified before full access**
- **Apple Sign-In must handle "Hide My Email" relay**
- *Display name defaults to email prefix if not provided by OAuth*

### Log In
#### Steps
1. User selects provider or enters email/password
2. Supabase returns JWT + refresh token
3. Store tokens securely (expo-secure-store on mobile)
4. Load user profile and navigate to Home

#### Constraints
- **Tokens must never be stored in AsyncStorage (use SecureStore)**
- **Refresh token rotation enabled**

### Log Out
#### Steps
1. Clear local tokens
2. Clear local offline queue (optional: prompt user)
3. Navigate to auth screen

### Password Reset
#### Steps
1. User enters email
2. Supabase sends reset link
3. User sets new password via deep link

#### Constraints
- **Rate limit: max 3 reset emails per hour per email**

---

## Session Management
- **JWT expiry: 1 hour**
- **Refresh token expiry: 30 days**
- *On app foreground, silently refresh if JWT expired*
- *If refresh fails, redirect to login*

## Onboarding (Post-Signup)
### Step 1: Unit Preference
- Select kg or lb
- Stored in `users.unit_preference`

### Step 2: Quick Template (Optional)
- Offer 2-3 starter templates (Push/Pull/Legs, Upper/Lower, Full Body)
- User can skip

#### Constraints
- **Onboarding must complete in under 60 seconds**
- *Skip button always visible*

## Security Rules
- **All API calls require valid JWT in Authorization header**
- **No user data accessible without authentication**
- **Supabase RLS enforces row-level access on every table**
- *Rate limiting on auth endpoints via Supabase defaults*
- *No hardcoded secrets in client bundle*

## Deep Links
- Password reset: `liftos://auth/reset?token=...`
- Email verification: `liftos://auth/verify?token=...`
- *Configure Expo deep linking + Supabase redirect URLs*
