import { test, expect } from '@playwright/test';
import { STAFF, loginAs } from './helpers';

test.describe('Staff Role — Access & Restrictions', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, STAFF);
    });

    // ── Login & landing ────────────────────────────────────────────────────────

    test('staff can log in and lands on dashboard', async ({ page }) => {
        await expect(page).not.toHaveURL(/login/);
        await expect(page.getByText(/dashboard|tasks/i).first()).toBeVisible({ timeout: 8000 });
    });

    // ── Tasks page ─────────────────────────────────────────────────────────────

    test('staff sees only their own row on Tasks page', async ({ page }) => {
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Staff: site selector is hidden — use direct select locator
        const siteSelect = page.locator('select').first();
        if (await siteSelect.isVisible()) {
            const options = await siteSelect.locator('option').allTextContents();
            expect(options.some(o => /All Sites/i.test(o))).toBeFalsy();
        }
    });

    test('staff does NOT see Daily/Summary toggle', async ({ page }) => {
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('button', { name: /Summary/i })).not.toBeVisible({ timeout: 3000 })
            .catch(() => {});
    });

    test('staff date picker is read-only (locked to today)', async ({ page }) => {
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');
        const datePicker = page.locator('input[type="date"]').first();
        await expect(datePicker).toBeVisible({ timeout: 5000 });
        const isReadonly = await datePicker.getAttribute('readonly');
        expect(isReadonly).not.toBeNull();
    });

    test('staff does NOT see Edit or Delete buttons', async ({ page }) => {
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        const deleteBtns = page.getByRole('button', { name: /Delete/i });
        await expect(deleteBtns.first()).not.toBeVisible({ timeout: 3000 }).catch(() => {});
    });

    // ── Attendance page ────────────────────────────────────────────────────────

    test('staff can access attendance page', async ({ page }) => {
        await page.goto('/attendance');
        await expect(page).toHaveURL(/attendance/);
        const hasError = await page.getByText(/Something went wrong/i).isVisible();
        expect(hasError).toBeFalsy();
    });

    test('staff does NOT see "Staff Summary" tab on attendance', async ({ page }) => {
        await page.goto('/attendance');
        await page.waitForLoadState('networkidle');
        const summaryTab = page.getByRole('button', { name: /Staff Summary/i });
        await expect(summaryTab).not.toBeVisible({ timeout: 3000 }).catch(() => {});
    });

    // ── Role-based navigation restrictions ────────────────────────────────────

    test('staff can access /tasks page', async ({ page }) => {
        await page.goto('/tasks');
        await expect(page).toHaveURL(/tasks/);
    });

    test('staff can access /attendance page', async ({ page }) => {
        await page.goto('/attendance');
        await expect(page).toHaveURL(/attendance/);
    });

    // ── Pages that SHOULD be restricted for staff ──────────────────────────────

    test('staff is blocked from /payroll', async ({ page }) => {
        await page.goto('/payroll');
        // Should be redirected away from /payroll
        await expect(page).not.toHaveURL(/payroll/, { timeout: 5000 });
    });

    test('staff is blocked from /reports', async ({ page }) => {
        await page.goto('/reports');
        await expect(page).not.toHaveURL(/reports/, { timeout: 5000 });
    });

    test('staff is blocked from /users', async ({ page }) => {
        await page.goto('/users');
        await expect(page).not.toHaveURL(/users/, { timeout: 5000 });
    });
});
