# Claude-billing – Subscription Monetisation

This module defines the subscription model, payment integration, and access control.

## Model: Single Tier, No Free Tier

There is no permanent free tier. Every user gets full access to everything.
New users get a **14-day free trial** (no credit card required) then must subscribe to continue.

### What Every Subscriber Gets (Everything)
- Unlimited workout templates + custom exercises
- Active workout with prefill + last session comparison
- Workout history (full)
- Progress graphs: top set, e1RM trends, volume trends
- PR tracking
- Offline-first set logging
- AI progression targets + plateau detection + deload suggestions
- Weekly AI summary with insights
- Muscle group volume breakdown
- Data export (JSON / CSV)
- XP / levelling system

---

## Pricing
- **Monthly:** £10 / month
- **Annual:** £79.99 / year (~£6.66/month, saves ~33%)
- **Free trial:** 14 days, no credit card required
- **Annual plan is the default CTA** (higher LTV)

---

## Founder Account (Always Free)
- **samcarr1232@gmail.com** is permanently exempt from all subscription checks.
- Implementation: `users.subscription_tier = 'founder'` set via migration on signup trigger.
- Both client and server treat `'founder'` the same as `'pro'` for all feature checks.
- Webhook handlers must never downgrade a `'founder'` tier account.

```typescript
// Entitlement helper — use this everywhere
export function hasAccess(tier: string): boolean {
  return tier === 'pro' || tier === 'founder';
}
```

---

## Payment Integration

### Web (PWA) — Stripe
- Stripe Checkout for web subscriptions
- Stripe Customer Portal for self-serve cancellation / plan change
- Stripe webhook → Supabase Edge Function → update `users.subscription_tier`
- Store `stripe_customer_id` on `users` table

### iOS (future, when App Store submission happens)
- **RevenueCat** (wraps StoreKit 2) — Apple mandates IAP for in-app subscriptions
- RevenueCat webhook → Supabase sync

### Android (future)
- **RevenueCat** (wraps Google Play Billing)

### Why Stripe first
- PWA is the launch platform — Stripe works immediately, no App Store needed
- Lower fees than RevenueCat on web (no additional % on top of Stripe)
- Stripe Customer Portal handles cancellation / upgrades without custom UI

---

## Entitlement Flow

### Trial
```
1. User signs up → trial_ends_at = NOW() + 14 days stored on users table
2. All features unlocked during trial
3. On trial expiry → subscription_tier = 'expired', redirect to /subscribe
4. Founder account (samcarr1232@gmail.com) → subscription_tier = 'founder', never expires
```

### Upgrade Flow (Stripe / Web)
```
1. User hits /subscribe → Stripe Checkout session created via Edge Function
2. User completes payment on Stripe-hosted page
3. Stripe webhook fires → stripe-webhook Edge Function
4. Update users.subscription_tier = 'pro', store stripe_customer_id
5. Redirect to app — full access restored
```

### Cancellation / Expiry
```
1. Stripe webhook fires on subscription cancellation or failed payment
2. Edge Function: if tier !== 'founder' → set subscription_tier = 'expired'
3. User sees paywall on next app load (data fully preserved)
4. Grace period: 3 days after failed payment before locking
```

#### Constraints
- **Never delete user data on expiry**
- **Never downgrade a 'founder' tier account — webhook must check before updating**
- **Server-side tier check on all AI Edge Functions**
- **Client check is UX only; server check is security**

---

## Subscribe / Paywall Screen (/subscribe)

### Layout
- Headline: "Your trial has ended" (or "Upgrade to keep going")
- Single plan toggle: Monthly (£10) / Annual (£79.99) — annual pre-selected
- Feature list (everything unlocked, no comparison needed — single tier)
- "Start for £10/month" or "Get Annual — Save 33%" CTA → Stripe Checkout
- "Cancel anytime" reassurance line
- Terms + privacy links

### Trigger Points
- Trial expires → auto-redirect on next app load
- Manual: /subscribe route always accessible
- *Never interrupt an active workout*

#### Constraints
- **No dark patterns: price and cancellation terms visible before checkout**
- **Annual is pre-selected (higher LTV)**

---

## Access Check Implementation

### Entitlement helper (use everywhere)
```typescript
// src/lib/access.ts
export function hasAccess(tier: string | null): boolean {
  return tier === 'pro' || tier === 'founder';
}

export function isInTrial(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt) > new Date();
}

export function canUseApp(tier: string | null, trialEndsAt: string | null): boolean {
  return hasAccess(tier) || isInTrial(trialEndsAt);
}
```

### Server-Side (Edge Functions)
```typescript
const { data: user } = await supabase
  .from('users')
  .select('subscription_tier, trial_ends_at')
  .eq('id', userId)
  .single();

const allowed =
  user.subscription_tier === 'pro' ||
  user.subscription_tier === 'founder' ||
  (user.trial_ends_at && new Date(user.trial_ends_at) > new Date());

if (!allowed) {
  return new Response(
    JSON.stringify({ error: 'Subscription required' }),
    { status: 403 }
  );
}
```

#### Constraints
- **Both client AND server check access**
- **Founder tier is never downgraded by webhooks**
- **Expired trial users get 403, not 500**

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
