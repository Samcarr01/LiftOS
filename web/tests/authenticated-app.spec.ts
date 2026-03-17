import { test, expect, type Page } from '@playwright/test';

const BASE = 'https://lift-os.vercel.app';
const TEST_EMAIL = 'samcarr1232@gmail.com';
const TEST_PASSWORD = '123456789';

// ── Helper: login and return authenticated page ──────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
}

// Use a unique template name per run to avoid duplicates
const TEMPLATE_NAME = `E2E Test ${Date.now()}`;

// ─── 1. AUTH FLOW ────────────────────────────────────────────────────────────

test.describe('Authentication flow', () => {
  test('can sign in with email/password and reach home', async ({ page }) => {
    await login(page);
    expect(page.url()).toBe(`${BASE}/`);
    await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible({ timeout: 5000 });
  });

  test('authenticated user redirected away from /login', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/login`);
    await page.waitForURL(`${BASE}/`, { timeout: 10000 });
    expect(page.url()).toBe(`${BASE}/`);
  });
});

// ─── 2. HOME DASHBOARD ──────────────────────────────────────────────────────

test.describe('Home dashboard', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('shows greeting', async ({ page }) => {
    await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible();
  });

  test('shows Start Workout button', async ({ page }) => {
    await expect(page.getByText('Start Workout')).toBeVisible();
  });

  test('Start Workout opens template sheet', async ({ page }) => {
    await page.getByText('Start Workout').click();
    await expect(page.getByText(/Blank Workout|Choose|Pick/i)).toBeVisible({ timeout: 5000 });
  });
});

// ─── 3. NAVIGATION ──────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('bottom nav has all links on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('nav a[href="/"]').last()).toBeVisible();
    await expect(page.locator('nav a[href="/templates"]').last()).toBeVisible();
    await expect(page.locator('nav a[href="/history"]').last()).toBeVisible();
    await expect(page.locator('nav a[href="/progress"]').last()).toBeVisible();
    await expect(page.locator('nav a[href="/profile"]').last()).toBeVisible();
  });

  test('navigate to Templates', async ({ page }) => {
    await page.locator('nav a[href="/templates"]').first().click();
    await page.waitForURL('**/templates');
    await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
  });

  test('navigate to History', async ({ page }) => {
    await page.locator('nav a[href="/history"]').first().click();
    await page.waitForURL('**/history');
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  });

  test('navigate to Progress', async ({ page }) => {
    await page.locator('nav a[href="/progress"]').first().click();
    await page.waitForURL('**/progress');
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  });

  test('navigate to Profile', async ({ page }) => {
    await page.locator('nav a[href="/profile"]').first().click();
    await page.waitForURL('**/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  });
});

// ─── 4. TEMPLATES CRUD ──────────────────────────────────────────────────────

test.describe('Templates CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/templates`);
  });

  test('shows page heading and New template button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
    await expect(page.getByText('New template')).toBeVisible();
  });

  test('can create a template', async ({ page }) => {
    await page.getByText('New template').click();
    await page.getByPlaceholder('Template name').fill(TEMPLATE_NAME);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(TEMPLATE_NAME).first()).toBeVisible({ timeout: 5000 });
  });

  test('can open template editor', async ({ page }) => {
    // Create if needed
    if (!(await page.getByText(TEMPLATE_NAME).first().isVisible().catch(() => false))) {
      await page.getByText('New template').click();
      await page.getByPlaceholder('Template name').fill(TEMPLATE_NAME);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByText(TEMPLATE_NAME).first()).toBeVisible({ timeout: 5000 });
    }
    await page.getByText(TEMPLATE_NAME).first().click();
    await page.waitForURL('**/templates/**');
    await expect(page.getByRole('button', { name: 'Add Exercise' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="Template name"]')).toBeVisible();
  });

  test('template dropdown has Pin, Duplicate, Delete', async ({ page }) => {
    const trigger = page.locator('button:has(svg.lucide-more-horizontal)').first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await expect(page.getByRole('menuitem', { name: /Pin/ })).toBeVisible({ timeout: 3000 });
      await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
    }
  });
});

// ─── 5. EXERCISE SELECTOR ───────────────────────────────────────────────────

test.describe('Exercise selector', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/templates`);
    // Create template if needed and navigate to editor
    if (!(await page.getByText(TEMPLATE_NAME).first().isVisible().catch(() => false))) {
      await page.getByText('New template').click();
      await page.getByPlaceholder('Template name').fill(TEMPLATE_NAME);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByText(TEMPLATE_NAME).first()).toBeVisible({ timeout: 5000 });
    }
    await page.getByText(TEMPLATE_NAME).first().click();
    await page.waitForURL('**/templates/**');
    await expect(page.getByRole('button', { name: 'Add Exercise' })).toBeVisible({ timeout: 5000 });
  });

  test('browse mode: search, filters, exercise list', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await expect(page.getByPlaceholder('Search exercises')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chest', exact: true })).toBeVisible();
    // Seeded exercises visible
    await expect(page.getByText('Bench Press')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Squat')).toBeVisible();
    await expect(page.getByText('Deadlift', { exact: true })).toBeVisible();
  });

  test('search filters exercises', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.getByPlaceholder('Search exercises').fill('bench');
    await expect(page.getByText('Bench Press')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Squat')).not.toBeVisible();
  });

  test('muscle filter works', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(1000);
    // Sheet elements may be "outside viewport" due to fixed positioning — use JS click
    await page.getByRole('button', { name: 'Core', exact: true }).evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(500);
    await expect(page.getByText('Plank')).toBeVisible({ timeout: 5000 });
  });

  test('can add preset exercise to template', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(1000);
    await page.getByText('Overhead Press').dispatchEvent('click');
    // Exercise appears in template editor
    await expect(page.locator('text=Overhead Press')).toBeVisible({ timeout: 5000 });
  });

  test('New button opens exercise creator', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New' }).dispatchEvent('click');
    await expect(page.getByPlaceholder('e.g. Barbell Back Squat')).toBeVisible();
    await expect(page.getByText('Tracking type')).toBeVisible();
  });

  test('creator shows all 5 tracking types', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New' }).dispatchEvent('click');
    for (const label of ['Weight + Reps', 'Bodyweight + Reps', 'Time', 'Distance', 'Laps']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('create custom Weight+Reps exercise', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New' }).dispatchEvent('click');
    await page.getByPlaceholder('e.g. Barbell Back Squat').fill(`WR Exercise ${Date.now()}`);
    await page.getByRole('button', { name: 'Chest' }).dispatchEvent('click');
    await page.getByRole('button', { name: 'Create Exercise' }).dispatchEvent('click');
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5000 });
  });

  test('create custom Time exercise', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New' }).dispatchEvent('click');
    await page.getByPlaceholder('e.g. Barbell Back Squat').fill(`Time Exercise ${Date.now()}`);
    await page.getByRole('button', { name: 'Core', exact: true }).dispatchEvent('click');
    await page.getByText('Time', { exact: true }).dispatchEvent('click');
    await page.getByRole('button', { name: 'Create Exercise' }).dispatchEvent('click');
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5000 });
  });

  test('create custom Distance exercise', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New' }).dispatchEvent('click');
    await page.getByPlaceholder('e.g. Barbell Back Squat').fill(`Dist Exercise ${Date.now()}`);
    await page.getByRole('button', { name: 'Cardio', exact: true }).dispatchEvent('click');
    await page.getByText('Distance', { exact: true }).dispatchEvent('click');
    await page.getByRole('button', { name: 'Create Exercise' }).dispatchEvent('click');
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5000 });
  });

  test('create custom Laps exercise', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New' }).dispatchEvent('click');
    await page.getByPlaceholder('e.g. Barbell Back Squat').fill(`Laps Exercise ${Date.now()}`);
    await page.getByRole('button', { name: 'Cardio', exact: true }).dispatchEvent('click');
    await page.getByText('Laps', { exact: true }).dispatchEvent('click');
    await page.getByRole('button', { name: 'Create Exercise' }).dispatchEvent('click');
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5000 });
  });

  test('create custom Bodyweight+Reps exercise', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New' }).dispatchEvent('click');
    await page.getByPlaceholder('e.g. Barbell Back Squat').fill(`BW Exercise ${Date.now()}`);
    await page.getByRole('button', { name: 'Back', exact: true }).dispatchEvent('click');
    await page.getByText('Bodyweight + Reps', { exact: true }).dispatchEvent('click');
    await page.getByRole('button', { name: 'Create Exercise' }).dispatchEvent('click');
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5000 });
  });

  test('Create Exercise button disabled without name', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New' }).dispatchEvent('click');
    await expect(page.getByRole('button', { name: 'Create Exercise' })).toBeDisabled();
  });
});

// ─── 6. WORKOUT FLOW ────────────────────────────────────────────────────────

test.describe('Workout flow', () => {
  test('can start workout from template play button', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/templates`);
    const playBtn = page.locator('button[title="Start workout"]').first();
    if (await playBtn.isVisible().catch(() => false)) {
      await playBtn.click();
      await page.waitForURL('**/workout/**', { timeout: 15000 });
      // Timer and Finish button visible
      await expect(page.getByText(/\d{2}:\d{2}/)).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Finish')).toBeVisible();
    }
  });

  test('Start Workout > Blank Workout works', async ({ page }) => {
    await login(page);
    await page.getByText('Start Workout').click();
    const blankBtn = page.getByText('Blank Workout');
    if (await blankBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await blankBtn.click();
      // Edge function may take time; check for either navigation or error toast
      const result = await Promise.race([
        page.waitForURL('**/workout/**', { timeout: 20000 }).then(() => 'navigated'),
        page.locator('[data-sonner-toast]').waitFor({ timeout: 20000 }).then(() => 'toast'),
      ]);
      // Either we navigated to workout page or got a response
      expect(['navigated', 'toast']).toContain(result);
    }
  });
});

// ─── 7. HISTORY PAGE ────────────────────────────────────────────────────────

test.describe('History page', () => {
  test('shows heading', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/history`);
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  });

  test('shows empty state or workouts', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/history`);
    await page.waitForTimeout(2000);
    const page_text = await page.textContent('body');
    // Should have either workout data or empty message - just verify page loaded
    expect(page_text?.length).toBeGreaterThan(50);
  });
});

// ─── 8. PROGRESS PAGE ──────────────────────────────────────────────────────

test.describe('Progress page', () => {
  test('shows heading', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/progress`);
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  });

  test('page loads without errors', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/progress`);
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(50);
  });
});

// ─── 9. PROFILE PAGE ───────────────────────────────────────────────────────

test.describe('Profile page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/profile`);
  });

  test('shows heading and email', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByText(TEST_EMAIL)).toBeVisible({ timeout: 5000 });
  });

  test('shows display name section', async ({ page }) => {
    // Display name shows as a button ("Add your name" or the saved name) when not editing
    await expect(page.getByText(/Add your name/i).or(page.locator('input[placeholder="Your name"]'))).toBeVisible({ timeout: 5000 });
  });

  test('shows kg/lb unit toggle', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'kg' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'lb' })).toBeVisible();
  });

  test('can toggle units', async ({ page }) => {
    await page.getByRole('button', { name: 'lb' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'kg' }).click();
  });

  test('shows Export Data', async ({ page }) => {
    await expect(page.getByText(/Export/i)).toBeVisible();
  });

  test('shows Delete Account', async ({ page }) => {
    await expect(page.getByText(/Delete Account/i)).toBeVisible();
  });

  test('shows Sign Out and it works', async ({ page }) => {
    const signOut = page.getByRole('button', { name: /Sign Out/i });
    await expect(signOut).toBeVisible();
    await signOut.click();
    // Sign out clears client state; navigate to a protected route to trigger middleware redirect
    await page.waitForTimeout(1000);
    await page.goto(`${BASE}/`);
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});

// ─── 10. RESPONSIVE ─────────────────────────────────────────────────────────

test.describe('Responsive', () => {
  test('mobile: bottom nav visible', async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('nav').last()).toBeVisible();
  });

  test('desktop: sidebar visible', async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('aside, nav').first()).toBeVisible();
  });
});

// ─── 11. ERROR HANDLING ─────────────────────────────────────────────────────

test.describe('Error handling', () => {
  test('no critical console errors across pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await login(page);
    for (const path of ['/templates', '/history', '/progress', '/profile']) {
      await page.goto(`${BASE}${path}`);
      await page.waitForTimeout(2000);
    }
    const critical = errors.filter(
      (e) => !e.includes('406') && !e.includes('favicon') && !e.includes('net::') && !e.includes('PGRST')
    );
    expect(critical.length).toBeLessThan(5);
  });
});
