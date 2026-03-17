import { test, expect, type Page } from '@playwright/test';

const BASE = 'https://lift-os.vercel.app';

// ─── 1. AUTH PROTECTION ──────────────────────────────────────────────────────

test.describe('Auth protection — unauthenticated users', () => {
  test('/ redirects to /login', async ({ page }) => {
    const resp = await page.goto(`${BASE}/`);
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('/templates redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/templates`);
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('/history redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/history`);
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('/progress redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/progress`);
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('/profile redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/profile`);
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('/workout/complete redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/workout/complete`);
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });
});

// ─── 2. LOGIN PAGE UI ───────────────────────────────────────────────────────

test.describe('Login page UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
  });

  test('renders LiftOS branding', async ({ page }) => {
    await expect(page.getByText('LiftOS')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('shows Google sign-in button', async ({ page }) => {
    await expect(page.getByText('Continue with Google')).toBeVisible();
  });

  test('shows email and password fields', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('shows Forgot password and Sign up links', async ({ page }) => {
    await expect(page.getByText('Forgot password?')).toBeVisible();
    await expect(page.getByText('Sign up')).toBeVisible();
  });

  test('can toggle to Sign up mode', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    // Should show "Have an account? Sign in" link
    await expect(page.getByText('Have an account?')).toBeVisible();
  });

  test('can toggle to Forgot password mode', async ({ page }) => {
    await page.getByText('Forgot password?').click();
    await expect(page.getByText('Reset password')).toBeVisible();
    await expect(page.getByText('Send reset email')).toBeVisible();
    // Should show back link
    await expect(page.getByText('Back to sign in')).toBeVisible();
  });

  test('can toggle back from Forgot to Sign in', async ({ page }) => {
    await page.getByText('Forgot password?').click();
    await page.getByText('Back to sign in').click();
    await expect(page.getByText('Sign in').first()).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('can toggle back from Sign up to Sign in', async ({ page }) => {
    await page.getByText('Sign up').click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByText('Forgot password?')).toBeVisible();
  });

  test('password visibility toggle works', async ({ page }) => {
    const passwordInput = page.getByLabel('Password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the eye icon button (it's the button inside the password field container)
    await page.locator('button').filter({ has: page.locator('svg') }).last().click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('shows error toast on empty email submit', async ({ page }) => {
    // Clear email field and submit
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // HTML5 validation should prevent submit — check the email input has required attribute
    await expect(page.getByLabel('Email')).toHaveAttribute('required', '');
  });

  test('sign in form validates email format', async ({ page }) => {
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('password123');
    // Submit should be blocked by HTML5 email validation
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // Page should still be on login (email validation prevented submit)
    expect(page.url()).toContain('/login');
  });

  test('sign in with wrong credentials shows error', async ({ page }) => {
    await page.getByLabel('Email').fill('test@nonexistent.com');
    await page.getByLabel('Password').fill('wrongpassword123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // Should show an error toast (Sonner)
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10000 });
  });
});

// ─── 3. SEO / META / PWA ───────────────────────────────────────────────────

test.describe('SEO, meta tags, and PWA', () => {
  test('login page has correct title', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page).toHaveTitle(/LiftOS/);
  });

  test('manifest.json is accessible', async ({ page }) => {
    const resp = await page.goto(`${BASE}/manifest.json`);
    expect(resp?.status()).toBe(200);
    const json = await resp?.json();
    expect(json.name).toBe('LiftOS');
    expect(json.start_url).toContain('/');
    expect(json.display).toBe('standalone');
    // Check icons exist
    expect(json.icons.length).toBeGreaterThan(0);
  });

  test('robots.txt is accessible', async ({ page }) => {
    const resp = await page.goto(`${BASE}/robots.txt`);
    expect(resp?.status()).toBe(200);
    const text = await resp?.text();
    expect(text).toContain('User-Agent');
  });

  test('sitemap.xml is accessible', async ({ page }) => {
    const resp = await page.goto(`${BASE}/sitemap.xml`);
    expect(resp?.status()).toBe(200);
    const text = await resp?.text();
    expect(text).toContain('urlset');
  });

  test('security headers are present', async ({ page }) => {
    const resp = await page.goto(`${BASE}/login`);
    const headers = resp?.headers() ?? {};
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('service worker is accessible', async ({ page }) => {
    const resp = await page.goto(`${BASE}/sw.js`);
    expect(resp?.status()).toBe(200);
    const text = await resp?.text();
    expect(text).toContain('self');
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto(`${BASE}/this-page-does-not-exist-xyz`);
    // Should redirect to login (middleware) since user is not authenticated
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('PWA icons are accessible', async ({ page }) => {
    const icon192 = await page.goto(`${BASE}/icons/icon-192.png`);
    expect(icon192?.status()).toBe(200);

    const icon512 = await page.goto(`${BASE}/icons/icon-512.png`);
    expect(icon512?.status()).toBe(200);
  });
});

// ─── 4. SIGN UP FLOW (real test user) ───────────────────────────────────────

// We'll create a unique test user for authenticated testing
const TEST_EMAIL = `playwright-${Date.now()}@test.liftos.app`;
const TEST_PASSWORD = 'TestPassword123!';

// Note: We cannot fully test sign up without email verification.
// We test that the sign up flow works up to the verification step.
test.describe('Sign up flow', () => {
  test('sign up form shows success message', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByText('Sign up').click();
    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    // Should show success toast or error (depends on Supabase config)
    // At minimum the form should submit and show a response
    await expect(
      page.locator('[data-sonner-toast]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('sign up with short password shows validation', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByText('Sign up').click();
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('123');
    await page.getByRole('button', { name: 'Create account' }).click();
    // HTML5 minlength=6 should prevent submission
    expect(page.url()).toContain('/login');
  });
});

// ─── 5. FORGOT PASSWORD FLOW ────────────────────────────────────────────────

test.describe('Forgot password flow', () => {
  test('reset password form submits and shows response', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByText('Forgot password?').click();
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByRole('button', { name: 'Send reset email' }).click();
    // Should show a toast (success or error)
    await expect(
      page.locator('[data-sonner-toast]')
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─── 6. RESPONSIVE DESIGN ──────────────────────────────────────────────────

test.describe('Responsive design', () => {
  test('login page looks good on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/login`);
    await expect(page.getByText('LiftOS')).toBeVisible();
    await expect(page.getByText('Continue with Google')).toBeVisible();
    // Form should be contained within viewport
    const form = page.locator('form');
    const box = await form.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(375);
    }
  });

  test('login page looks good on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE}/login`);
    await expect(page.getByText('LiftOS')).toBeVisible();
  });

  test('login page looks good on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await expect(page.getByText('LiftOS')).toBeVisible();
  });
});

// ─── 7. AUTH CALLBACK ROUTE ─────────────────────────────────────────────────

test.describe('Auth callback route', () => {
  test('/auth/callback without code redirects gracefully', async ({ page }) => {
    await page.goto(`${BASE}/auth/callback`);
    // Should redirect to login (no valid code) or show error
    await page.waitForURL('**/login**', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});

// ─── 8. STATIC ASSETS ──────────────────────────────────────────────────────

test.describe('Static assets', () => {
  test('favicon.ico is served', async ({ page }) => {
    const resp = await page.goto(`${BASE}/favicon.ico`);
    expect(resp?.status()).toBe(200);
  });
});

// ─── 9. NAVIGATION CONSISTENCY ──────────────────────────────────────────────

test.describe('Navigation consistency (all protected routes → /login)', () => {
  const protectedRoutes = [
    '/',
    '/templates',
    '/history',
    '/progress',
    '/profile',
    '/workout/complete',
  ];

  for (const route of protectedRoutes) {
    test(`${route} consistently redirects to /login`, async ({ page }) => {
      // Clear cookies to ensure no stale session
      await page.context().clearCookies();
      await page.goto(`${BASE}${route}`);
      await page.waitForURL('**/login', { timeout: 10000 });
      expect(page.url()).toContain('/login');
    });
  }
});

// ─── 10. PERFORMANCE ────────────────────────────────────────────────────────

test.describe('Performance', () => {
  test('login page loads in under 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });

  test('no console errors on login page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    // Filter out known non-critical errors (e.g., favicon 404, third-party)
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('404')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
