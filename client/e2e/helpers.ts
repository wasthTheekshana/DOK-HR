import { Page } from '@playwright/test';

export const ADMIN = { epf: 'ADMIN001', password: 'wasath@123' };
export const STAFF = { epf: '700545-1', password: '700545-1' };

export async function loginAs(page: Page, creds: { epf: string; password: string }) {
    await page.goto('/login');
    await page.getByPlaceholder(/e\.g\. ADMIN001/i).fill(creds.epf);
    await page.getByPlaceholder(/Enter your password/i).fill(creds.password);
    await page.getByRole('button', { name: /Sign In/i }).click();
    // Wait for redirect away from /login
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
}

export async function logout(page: Page) {
    // Click the logout button in the sidebar/layout
    const logoutBtn = page.getByRole('button', { name: /logout|sign out/i });
    if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForURL('**/login');
    } else {
        await page.goto('/login');
        await page.evaluate(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        });
        await page.reload();
    }
}
