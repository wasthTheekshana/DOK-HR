import { test, expect } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';

test.describe('Admin — Users Page', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/users');
        await page.waitForLoadState('networkidle');
    });

    test('page loads with Users header', async ({ page }) => {
        await expect(page.getByText(/Users|Staff Members|Members|Team/i).first()).toBeVisible({ timeout: 8000 });
    });

    test('shows user list or empty state without crash', async ({ page }) => {
        await page.waitForTimeout(2000);
        const hasError = await page.getByText(/Something went wrong/i).isVisible();
        expect(hasError).toBeFalsy();
    });

    test('Add Member button is visible for admin', async ({ page }) => {
        const addBtn = page.getByRole('button', { name: /Add Member|Add User|New Member|New Staff/i });
        await expect(addBtn).toBeVisible({ timeout: 5000 });
    });

    test('search field works', async ({ page }) => {
        const searchInput = page.getByPlaceholder(/Search|search by name/i);
        if (await searchInput.isVisible()) {
            await searchInput.fill('test');
            await page.waitForTimeout(800);
            const hasError = await page.getByText(/Something went wrong/i).isVisible();
            expect(hasError).toBeFalsy();
        }
    });

    test('role filter buttons are present for admin', async ({ page }) => {
        // Users page filter bar contains All / Admins / Supervisors / Staff buttons
        // Wait for the button to appear — it renders after the API call returns users
        const allBtn = page.locator('button').filter({ hasText: /^All/ }).first();
        await expect(allBtn).toBeVisible({ timeout: 8000 });
    });

    test('shows EPF numbers for admin', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        // EPF column header is always rendered once the table loads
        await expect(
            page.getByRole('columnheader', { name: /EPF/i })
        ).toBeVisible({ timeout: 10000 });
    });

    test('View button opens member detail panel', async ({ page }) => {
        await page.waitForTimeout(1000);
        const viewBtn = page.locator('button[title="View"]').first();
        await expect(viewBtn).toBeVisible({ timeout: 8000 });
        await viewBtn.click();
        await expect(page.getByText(/EPF Number/i)).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/Assigned Sites/i)).toBeVisible({ timeout: 5000 });
    });

    test('panel closes when backdrop is clicked', async ({ page }) => {
        await page.waitForTimeout(1000);
        const viewBtn = page.locator('button[title="View"]').first();
        await viewBtn.click();
        await expect(page.getByText(/Assigned Sites/i)).toBeVisible({ timeout: 5000 });
        // Click backdrop (fixed inset-0 div behind panel)
        await page.locator('.fixed.inset-0.bg-black\\/40').click({ force: true });
        await expect(page.getByText(/Assigned Sites/i)).not.toBeVisible({ timeout: 3000 });
    });
});
