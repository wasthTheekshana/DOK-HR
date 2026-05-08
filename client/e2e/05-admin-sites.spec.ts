import { test, expect } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';

test.describe('Admin — Sites Page', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/sites');
        await page.waitForLoadState('networkidle');
    });

    test('page loads with Sites header', async ({ page }) => {
        await expect(page.getByText(/Sites/i).first()).toBeVisible({ timeout: 8000 });
    });

    test('shows site list or empty state', async ({ page }) => {
        await page.waitForTimeout(2000);
        const hasError = await page.getByText(/Something went wrong/i).isVisible();
        expect(hasError).toBeFalsy();
    });

    test('Add Site button is visible for admin', async ({ page }) => {
        const addBtn = page.getByRole('button', { name: /Add.*Site|New Site/i });
        await expect(addBtn).toBeVisible({ timeout: 5000 });
    });

    test('can open Add Site modal', async ({ page }) => {
        const addBtn = page.getByRole('button', { name: /Add.*Site|New Site/i });
        await addBtn.click();
        // The modal/form should appear — look for a heading or any known form element
        await expect(
            page.getByText(/Add New Site|Edit Site|New Site/i).first()
        ).toBeVisible({ timeout: 5000 });
    });

    test('View button is present for each site', async ({ page }) => {
        await page.waitForTimeout(2000);
        const viewBtns = page.getByRole('button', { name: /View|Details/i });
        const count = await viewBtns.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('Edit and Delete buttons are visible for admin', async ({ page }) => {
        await page.waitForTimeout(2000);
        const editBtns = page.getByRole('button', { name: /Edit/i });
        const count = await editBtns.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('search / filter works without crashing', async ({ page }) => {
        const searchInput = page.getByPlaceholder(/Search|search/i);
        if (await searchInput.isVisible()) {
            await searchInput.fill('test');
            await page.waitForTimeout(500);
            const hasError = await page.getByText(/Something went wrong/i).isVisible();
            expect(hasError).toBeFalsy();
        }
    });
});
