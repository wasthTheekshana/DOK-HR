import { test, expect } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';

test.describe('Admin — Dashboard', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/');
    });

    test('loads dashboard without error', async ({ page }) => {
        await expect(page.getByText(/dashboard|daily task|tasks/i).first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/Error|Something went wrong/i)).not.toBeVisible();
    });

    test('shows stat cards (sites, staff, tasks)', async ({ page }) => {
        await expect(page.locator('.card, [class*="card"]').first()).toBeVisible({ timeout: 8000 });
    });

    test('navigation sidebar is visible', async ({ page }) => {
        await expect(page.getByRole('link', { name: /tasks/i }).first()).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('link', { name: /attendance/i }).first()).toBeVisible({ timeout: 5000 });
    });

    test('can navigate to /tasks', async ({ page }) => {
        await page.goto('/tasks');
        await expect(page).toHaveURL(/tasks/);
        await page.waitForLoadState('networkidle');
        await expect(page.getByText(/Daily Task Sheet|Daily Tasks/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('can navigate to /sites', async ({ page }) => {
        await page.goto('/sites');
        await expect(page).toHaveURL(/sites/);
        await page.waitForLoadState('networkidle');
        await expect(page.getByText(/Sites|Locations/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('can navigate to /users', async ({ page }) => {
        await page.goto('/users');
        await expect(page).toHaveURL(/users/);
        await expect(page.getByText(/Users|Staff|Members/i).first()).toBeVisible({ timeout: 8000 });
    });

    test('can navigate to /attendance', async ({ page }) => {
        await page.goto('/attendance');
        await expect(page).toHaveURL(/attendance/);
        await expect(page.getByText(/Attendance/i).first()).toBeVisible({ timeout: 8000 });
    });

    test('can navigate to /payroll', async ({ page }) => {
        await page.goto('/payroll');
        await expect(page).toHaveURL(/payroll/);
        await expect(page.getByText(/Payroll/i).first()).toBeVisible({ timeout: 8000 });
    });

    test('can navigate to /reports', async ({ page }) => {
        await page.goto('/reports');
        await expect(page).toHaveURL(/reports/);
        await expect(page.getByText(/Reports|Report/i).first()).toBeVisible({ timeout: 8000 });
    });
});
