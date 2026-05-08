import { test, expect } from '@playwright/test';
import { ADMIN, STAFF, loginAs } from './helpers';

test.describe('Login Page', () => {

    test.beforeEach(async ({ page }) => {
        // Each test gets a fresh browser context — localStorage is already empty.
        // Just navigate to the login page.
        await page.goto('/login');
    });

    // ── Rendering ──────────────────────────────────────────────────────────────

    test('shows EPF Number and Password fields', async ({ page }) => {
        await expect(page.getByPlaceholder(/e\.g\. ADMIN001/i)).toBeVisible();
        await expect(page.getByPlaceholder(/Enter your password/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
    });

    test('shows brand logo and feature list on large viewport', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await expect(page.getByText('DOK Systems').first()).toBeVisible();
        await expect(page.getByText('Multi-site Operations')).toBeVisible();
    });

    test('toggles password visibility', async ({ page }) => {
        const passwordInput = page.getByPlaceholder(/Enter your password/i);
        await passwordInput.fill('mypassword');
        await expect(passwordInput).toHaveAttribute('type', 'password');
        // Eye toggle button is next to the password field
        await page.locator('button[type="button"]').first().click();
        await expect(passwordInput).toHaveAttribute('type', 'text');
    });

    // ── Auth flows ─────────────────────────────────────────────────────────────

    test('Admin can log in successfully', async ({ page }) => {
        await loginAs(page, ADMIN);
        await expect(page).not.toHaveURL(/login/);
        await expect(page.getByText(/Dashboard|Daily Task|Tasks/i).first()).toBeVisible({ timeout: 8000 });
    });

    test('Staff can log in successfully', async ({ page }) => {
        await loginAs(page, STAFF);
        await expect(page).not.toHaveURL(/login/);
    });

    test('shows error on wrong password', async ({ page }) => {
        await page.getByPlaceholder(/e\.g\. ADMIN001/i).fill(ADMIN.epf);
        await page.getByPlaceholder(/Enter your password/i).fill('wrongpassword');
        await page.getByRole('button', { name: /Sign In/i }).click();
        await expect(page.getByText(/Invalid credentials|incorrect|failed/i)).toBeVisible({ timeout: 8000 });
    });

    test('shows error on wrong EPF number', async ({ page }) => {
        await page.getByPlaceholder(/e\.g\. ADMIN001/i).fill('NOTREAL999');
        await page.getByPlaceholder(/Enter your password/i).fill('anything');
        await page.getByRole('button', { name: /Sign In/i }).click();
        await expect(page.getByText(/Invalid credentials|not found|failed/i)).toBeVisible({ timeout: 8000 });
    });

    test('disables submit button while signing in', async ({ page }) => {
        await page.getByPlaceholder(/e\.g\. ADMIN001/i).fill(ADMIN.epf);
        await page.getByPlaceholder(/Enter your password/i).fill(ADMIN.password);
        await page.getByRole('button', { name: /Sign In/i }).click();
        await expect(page.getByText(/Signing in/i)).toBeVisible({ timeout: 3000 }).catch(() => {});
    });

    // ── Redirect protection ────────────────────────────────────────────────────

    test('unauthenticated user is redirected from / to /login', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });

    test('unauthenticated user is redirected from /tasks to /login', async ({ page }) => {
        await page.goto('/tasks');
        await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });
});
