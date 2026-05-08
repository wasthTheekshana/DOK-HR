import { test, expect } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';

test.describe('Session & Auth', () => {

    test('persists session on page reload', async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');
        await page.reload();
        await page.waitForLoadState('networkidle');
        // Should still be on tasks, not redirected to login
        await expect(page).not.toHaveURL(/login/, { timeout: 5000 });
        await expect(page.getByText(/Daily Task Sheet|Daily Tasks|Tasks/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('logging out clears session and redirects to /login', async ({ page }) => {
        await loginAs(page, ADMIN);
        // Clear auth manually (simulates logout)
        await page.evaluate(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        });
        // Reload the page so the React app re-reads empty localStorage
        await page.reload();
        await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });

    test('invalid token in localStorage redirects to /login on API call', async ({ page }) => {
        // Navigate to the app first so localStorage is accessible
        await page.goto('/login');
        await page.evaluate(() => {
            localStorage.setItem('token', 'fake.invalid.token');
            localStorage.setItem('user', JSON.stringify({ ID: 1, NAME: 'Test', ROLE: 'admin', EPF_NUMBER: 'TEST001' }));
        });
        await page.goto('/tasks');
        // First API call returns 401 → interceptor clears storage and redirects to /login
        await expect(page).toHaveURL(/login/, { timeout: 10000 });
    });

    test('unauthenticated access to any protected route redirects to /login', async ({ page }) => {
        // Navigate to the app first so localStorage is accessible, then clear it
        await page.goto('/login');
        for (const route of ['/tasks', '/attendance', '/users', '/sites', '/payroll']) {
            await page.evaluate(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            });
            await page.goto(route);
            await expect(page).toHaveURL(/login/, { timeout: 5000 });
        }
    });
});
