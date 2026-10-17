import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a long seek loads the new centre while obsolete network previews are still held, and reopens from decoded cache', async ({ page }) => {
  const requested: number[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/__page-preview/*', async route => {
    const index = Number(/\/(\d+)\.svg/.exec(route.request().url())![1]);
    requested.push(index);
    if (index < 20) await held;
    try {
      await route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180"><rect width="120" height="180" fill="#536c87"/><text x="60" y="100" fill="white" font-size="26" text-anchor="middle">${index + 1}</text></svg>` });
    } catch { /* The abandoned image request was cancelled by the scheduler. */ }
  });
  await page.goto('/tests/mobile-preview-harness.html');
  await expect.poll(() => requested.length).toBe(2);
  expect(requested[0]).toBe(10);
  await page.getByRole('button', { name: 'Seek 201' }).click();
  const selected = page.locator('.mobile-filmstrip-page [aria-pressed="true"] img');
  await expect(selected).toBeVisible({ timeout: 1500 });
  expect(requested[2]).toBe(200);
  expect(requested.filter(index => index < 20)).toHaveLength(2);
  await expect(page.locator('.mobile-filmstrip-page img')).toHaveCount(7);
  const before = requested.length;
  await page.getByRole('button', { name: 'Toggle previews' }).click();
  await page.getByRole('button', { name: 'Toggle previews' }).click();
  await expect(selected).toBeVisible();
  expect(requested.length).toBe(before);
  const center = await selected.boundingBox();
  expect(Math.abs(center!.x + center!.width / 2 - 195)).toBeLessThan(2);
  const selectedCard=page.locator('.mobile-filmstrip-page [aria-pressed="true"]');
  const decoration=await selectedCard.evaluate(el=>({transition:getComputedStyle(el).transitionDuration,animation:getComputedStyle(el).animationName,transform:getComputedStyle(el).transform,frame:getComputedStyle(el,'::after').borderTopWidth,fill:getComputedStyle(el).backgroundColor}));
  expect(decoration).toEqual({transition:'0s',animation:'none',transform:'none',frame:'2px',fill:'rgba(0, 0, 0, 0)'});
  await page.screenshot({ path: 'test-results/mobile1113-preview-target.png' });
  release();
});
