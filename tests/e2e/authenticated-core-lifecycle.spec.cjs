const { test, expect } = require('@playwright/test');

const email = process.env.TTT_E2E_EMAIL || '';
const password = process.env.TTT_E2E_PASSWORD || '';

async function login(page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('#tttLoginEmail').fill(email);
  await page.locator('#tttLoginPassword').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#tttAuthOverlay')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#tttCloudStatus')).toContainText(/Synced|Connected/i, { timeout: 30000 });
}

async function waitForSync(page) {
  await expect(page.locator('#tttCloudStatus')).toContainText(/Synced|Connected/i, { timeout: 30000 });
}

test('authenticated core lifecycle: login → job → check-in → work order → close', async ({ page }) => {
  test.skip(!email || !password, 'TTT_E2E_EMAIL / TTT_E2E_PASSWORD GitHub secrets are not configured.');

  const run = Date.now().toString(36);
  const customerEmail = 'ttt-e2e-' + run + '@example.invalid';
  let ids = null;

  try {
    await login(page);

    await expect.poll(
      () => page.evaluate(() => Boolean(
        window.TTTCRM &&
        window.TTTTessaAdmin &&
        window.TTTProductMaster &&
        window.TTTWebsiteAnalytics
      )),
      { timeout: 30000, message: 'Authenticated TTT-OS runtime modules did not bootstrap' }
    ).toBe(true);

    await page.locator('[data-go="newjob"]').first().click();
    await expect(page.locator('#jobForm')).toBeVisible();

    await page.locator('[name="firstName"]').fill('E2E');
    await page.locator('[name="lastName"]').fill('Regression-' + run);
    await page.locator('[name="phone"]').fill('7135550199');
    await page.locator('[name="email"]').fill(customerEmail);
    await page.locator('[name="requestNotes"]').fill('Automated browser regression ' + run);
    await page.locator('[name="labor"]').fill('125');

    const service = page.locator('[data-eq="category"]').first();
    if (await service.count()) await service.selectOption({ label: 'Window tint' }).catch(() => {});

    await page.getByRole('button', { name: 'Create Job' }).click();
    await expect(page.locator('#jobdetail.active')).toBeVisible({ timeout: 30000 });
    await waitForSync(page);

    ids = await page.evaluate(() => {
      const j = window.db?.jobs?.find(x => x.id === window.currentJobId);
      if (!j) return null;
      return { jobId: j.id, customerId: j.customerId, vehicleId: j.vehicleId, workOrderId: j.workOrderId || null };
    });
    expect(ids?.jobId).toMatch(/^J-\d{6}-\d{3}$/);

    for (const label of ['Create Estimate', 'Send for Approval', 'Approve & Schedule', 'Ready for Check-In']) {
      await page.getByRole('button', { name: label }).click();
      await waitForSync(page);
    }

    await page.locator('#checkInForm [name="odometer"]').fill('1000');
    await page.locator('#checkInForm [name="keys"]').fill('1');
    await page.getByRole('button', { name: 'Complete Check-In' }).click();
    await waitForSync(page);

    await page.getByRole('button', { name: 'Review Final Scope' }).click();
    await page.locator('#finalAuthCheck').check();
    await page.locator('#finalAuthName').fill('E2E Regression');
    await page.getByRole('button', { name: 'Authorize & Create Work Order' }).click();
    await waitForSync(page);

    ids = await page.evaluate(jobId => {
      const j = window.db?.jobs?.find(x => x.id === jobId);
      return j ? { jobId: j.id, customerId: j.customerId, vehicleId: j.vehicleId, workOrderId: j.workOrderId } : null;
    }, ids.jobId);
    expect(ids?.workOrderId).toMatch(/^WO-\d{6}-\d{3}$/);

    for (const label of ['Send to QC', 'Ready for Pickup', 'Mark Delivered', 'Close Job']) {
      await page.getByRole('button', { name: label }).click();
      await waitForSync(page);
    }

    const finalStatus = await page.evaluate(jobId => window.db?.jobs?.find(x => x.id === jobId)?.status, ids.jobId);
    expect(finalStatus).toBe('Closed');
  } finally {
    if (ids?.jobId) {
      await page.evaluate(async ids => {
        const cloud = window.TTTCloud;
        if (!cloud?.ready || !cloud?.client || !cloud?.organizationId) return;
        const stamp = new Date().toISOString();
        const org = cloud.organizationId;
        if (ids.workOrderId) {
          await cloud.client.from('work_orders').update({ archived_at: stamp, updated_at: stamp, updated_by: cloud.userId })
            .eq('organization_id', org).eq('id', ids.workOrderId);
        }
        await cloud.client.from('jobs').update({ archived_at: stamp, updated_at: stamp, last_synced_by: cloud.userId })
          .eq('organization_id', org).eq('id', ids.jobId);
        if (ids.vehicleId) {
          await cloud.client.from('vehicles').update({ archived_at: stamp, updated_at: stamp, last_synced_by: cloud.userId })
            .eq('organization_id', org).eq('id', ids.vehicleId);
        }
        if (ids.customerId) {
          await cloud.client.from('customers').update({ archived_at: stamp, updated_at: stamp, last_synced_by: cloud.userId })
            .eq('organization_id', org).eq('id', ids.customerId);
        }
      }, ids).catch(() => {});
    }
  }
});
