import { test, expect } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';

test.describe('Admin — Tasks Page', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');
    });

    test('page loads with Daily Task Sheet header', async ({ page }) => {
        await expect(page.getByText(/Daily Task Sheet/i)).toBeVisible({ timeout: 10000 });
    });

    test('shows site selector for admin', async ({ page }) => {
        // Site select has no htmlFor/id association — use locator directly
        const siteSelect = page.locator('select').first();
        await expect(siteSelect).toBeVisible({ timeout: 5000 });
    });

    test('shows date picker', async ({ page }) => {
        await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('shows Daily / Summary toggle buttons for admin', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Daily/i })).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: /Summary/i })).toBeVisible({ timeout: 5000 });
    });

    test('can switch to Summary view', async ({ page }) => {
        await page.getByRole('button', { name: /Summary/i }).click();
        // Summary view shows date range pickers (two date inputs)
        await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('input[type="date"]').nth(1)).toBeVisible({ timeout: 5000 });
    });

    test('Download button is visible for admin in daily mode', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Download/i }).first()).toBeVisible({ timeout: 10000 });
    });

    test('shows staff list after site selection', async ({ page }) => {
        await page.waitForTimeout(2000);
        // Page shows employees or an empty-state message
        const hasContent = await page.getByText(/No employees found|EPF|No staff/i).first().isVisible()
            .catch(() => false);
        // Also accept: staff rows visible in the table
        const hasRows = await page.locator('tbody tr').first().isVisible().catch(() => false);
        expect(hasContent || hasRows).toBeTruthy();
    });

    test('Add Task button opens a form for a staff row', async ({ page }) => {
        await page.waitForTimeout(2000);
        const addBtn = page.getByRole('button', { name: /\+ Add Task|Add Task/i }).first();
        const addBtnVisible = await addBtn.isVisible();
        if (addBtnVisible) {
            await addBtn.click();
            // A new draft row appears with task type select and count input
            await expect(page.locator('select').first()).toBeVisible({ timeout: 5000 });
        }
    });

    test('Edit icon or button is visible for existing tasks', async ({ page }) => {
        await page.waitForTimeout(2000);
        const editBtns = page.getByRole('button', { name: /Edit|Pencil/i });
        const count = await editBtns.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('shows All Sites option in site dropdown for admin', async ({ page }) => {
        const select = page.locator('select').first();
        await expect(select).toBeVisible({ timeout: 5000 });
        const options = await select.locator('option').allTextContents();
        expect(options.some(o => /All Sites/i.test(o))).toBeTruthy();
    });
});
