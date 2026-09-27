const { test, expect } = require('@playwright/test');

test('public production login smoke', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err.message || err)));

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle(/TTT OS/i);
  await expect(page.locator('#tttLoginForm')).toBeVisible();
  await expect(page.locator('#tttLoginEmail')).toBeVisible();
  await expect(page.locator('#tttLoginPassword')).toBeVisible();

  const probe = 'regression-probe@example.invalid';
  await page.locator('#tttLoginEmail').fill(probe);
  await expect(page.locator('#tttLoginEmail')).toHaveValue(probe);

  await page.locator('#tttLoginPassword').fill('not-a-real-ttt-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#tttLoginError')).toBeVisible();

  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Reset demo');
  expect(body).not.toContain('Good afternoon, Derek.');
  expect(pageErrors).toEqual([]);
});
