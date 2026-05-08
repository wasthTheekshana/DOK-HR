import { test, expect } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';

test.describe('Admin — Attendance Page', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/attendance');
        await page.waitForLoadState('networkidle');
    });

    test('page loads with Attendance header', async ({ page }) => {
        await expect(page.getByText(/Attendance/i).first()).toBeVisible({ timeout: 8000 });
    });

    test('shows site selector', async ({ page }) => {
        // Site select has no htmlFor/id label association — query the select directly
        const siteSelect = page.locator('select').first();
        await expect(siteSelect).toBeVisible({ timeout: 10000 });
    });

    test('shows date range pickers', async ({ page }) => {
        // Date From and Date To inputs are always rendered in the filters card
        await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('input[type="date"]').nth(1)).toBeVisible({ timeout: 5000 });
    });

    test('shows view mode tabs (Log / Report / Summary)', async ({ page }) => {
        const log = page.getByRole('button', { name: /Detailed Log/i });
        const report = page.getByRole('button', { name: /Date Report|Staff Summary/i }).first();
        const atLeastOne = (await log.isVisible()) || (await report.isVisible());
        expect(atLeastOne).toBeTruthy();
    });

    test('loads attendance records or empty state without error', async ({ page }) => {
        await page.waitForTimeout(2000);
        const hasError = await page.getByText(/Something went wrong|Error:/i).isVisible();
        expect(hasError).toBeFalsy();
    });

    test('Download button is present when records exist', async ({ page }) => {
        await page.waitForTimeout(2000);
        // Empty state shows specific text — if absent, real data is rendered
        const emptyText = page.getByText(/No attendance records found|No data found/i).first();
        const isEmpty = await emptyText.isVisible();
        if (!isEmpty) {
            await expect(page.getByRole('button', { name: /Download/i }).first()).toBeVisible({ timeout: 5000 });
        }
        // If empty state is visible, no download button is expected — test passes
    });

    test('can switch view modes without crashing', async ({ page }) => {
        // "Date Report" button always exists for non-staff admin
        const dateReportBtn = page.getByRole('button', { name: /Date Report/i });
        if (await dateReportBtn.isVisible()) {
            await dateReportBtn.click();
            await page.waitForTimeout(1000);
            const hasError = await page.getByText(/Something went wrong/i).isVisible();
            expect(hasError).toBeFalsy();
        }
    });
});
