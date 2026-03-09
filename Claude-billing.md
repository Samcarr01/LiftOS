# Claude-billing – Freemium Monetisation & Subscription Gating

This module defines the free vs Pro tier gating, payment integration, and upgrade flows.

## Tier Structure

### Free Tier (Default)
- Unlimited workout templates
- Unlimited custom exercises
- Active workout with prefill + last session comparison
- Workout history (full)
- Basic progress graphs (top set line chart)
- Basic PR tracking
- Offline-first set logging
- Rule-based progression suggestions (simple: repeat or +1 rep / +2.5kg)

### Pro Tier (Subscription)
Everything in Free, plus:
- **AI progression targets** (Claude Haiku powered)
- **Plateau detection + deload suggestions**
- **Weekly AI summary with insights**
- **Advanced analytics:** muscle group volume breakdown, estimated 1RM trends, volume trends
- **Data export** (JSON / CSV)
- Multi-device sync priority (queue processed first)

---

## Pricing (Suggested Starting Points)
- **Monthly:** £4.99 / $5.99
- **Annual:** £39.99 / $49.99 (save ~33%)
- **Free trial:** 7-day Pro trial on signup

#### Constraints
- **Annual plan is the default CTA (higher LTV)**
- *Pricing subject to A/B testing post-launch*

---

## Payment Integration

### iOS
- **RevenueCat** (wraps StoreKit 2)
- Handles receipts, entitlements, and subscription management

### Android
- **RevenueCat** (wraps Google Play Billing)
- Same SDK, cross-platform entitlement management

### Why RevenueCat
- Single SDK for iOS + Android
- Server-side receipt validation
- Webhook support for Supabase sync
- Analytics dashboard
- Handles edge cases: grace periods, billing retries, family sharing

---

## Entitlement Flow

### Check Entitlement
```
1. App launch → RevenueCat SDK checks subscription status
2. Store entitlement in local state (zustand)
3. Gate Pro features based on local entitlement
4. Sync entitlement to Supabase users.subscription_tier via webhook
```

### Upgrade Flow
```
1. User taps upgrade CTA (paywall screen)
2. RevenueCat presents native purchase sheet
3. On successful purchase → entitlement activated
4. Update local state immediately
5. Webhook fires → update users.subscription_tier = 'pro' in Supabase
6. Edge Functions check subscription_tier before running AI features
```

### Downgrade / Cancellation
```
1. RevenueCat webhook fires on subscription expiry
2. Update users.subscription_tier = 'free' in Supabase
3. On next app launch, local entitlement reflects free tier
4. Pro features gracefully degrade (data preserved, features locked)
```

#### Constraints
- **Never delete user data on downgrade**
- **Show "Pro" badge/label on gated features so users know what they're missing**
- **Server-side entitlement check on Edge Functions (never trust client-only)**
- *Grace period: 3 days after failed renewal before downgrade*

---

## Paywall Screen

### Layout
- Feature comparison (Free vs Pro)
- Testimonial or social proof (post-launch)
- Price options: Monthly / Annual (annual pre-selected)
- "Start 7-Day Free Trial" primary CTA
- Restore purchases link
- Terms + privacy links

### Trigger Points (When to Show)
- User taps a Pro-gated feature (AI suggestion, weekly summary, advanced graph)
- Profile screen upgrade button
- End of free trial reminder
- *Never interrupt a workout to show paywall*

#### Constraints
- **Paywall must comply with App Store Review Guidelines 3.1.1 and 3.1.2**
- **Restore Purchases button must be visible**
- **No dark patterns: clear pricing, easy cancellation info**
- *A/B test paywall design post-launch*

---

## Feature Gating Implementation

### Client-Side (UI)
```typescript
function isProFeature(feature: string): boolean {
  const proFeatures = [
    'ai_suggestions',
    'plateau_detection',
    'weekly_ai_summary',
    'advanced_analytics',
    'data_export',
  ];
  return proFeatures.includes(feature);
}

function canAccess(feature: string, tier: 'free' | 'pro'): boolean {
  if (!isProFeature(feature)) return true;
  return tier === 'pro';
}
```

### Server-Side (Edge Functions)
```typescript
// At the top of any Pro-only Edge Function
const { data: user } = await supabase
  .from('users')
  .select('subscription_tier')
  .eq('id', userId)
  .single();

if (user.subscription_tier !== 'pro') {
  return new Response(
    JSON.stringify({ error: 'Pro subscription required' }),
    { status: 403 }
  );
}
```

#### Constraints
- **Both client AND server must check entitlement**
- **Client check is for UX (show/hide); server check is for security**
- **Free users attempting Pro API calls get 403, not 500**

---

## Analytics Events for Billing
- `paywall_viewed` (trigger_point)
- `trial_started`
- `subscription_purchased` (plan_type, price)
- `subscription_cancelled`
- `subscription_renewed`
- `pro_feature_tapped_free_user` (feature_name)

---

## Future Expansion Levers
- Coach read-only links (one-time purchase or Pro add-on)
- Template marketplace (revenue share)
- Wearable integrations (Pro exclusive)
- Custom themes / app icons (Pro exclusive)
