import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test('home artwork can be selected, cancelled, restored and retains natural colors', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 20 });
  await page.addInitScript(() => {
    const api = (window as any).omicomic;
    let saved: any = JSON.parse(localStorage.getItem('artwork-test') ?? 'null');
    const ok = (data: any) => ({ ok: true, data });
    api.getHomeArtwork = async () => ok(saved);
    api.selectHomeArtwork = async () => {
      if ((window as any).__artworkCancel) return ok(null);
      if ((window as any).__artworkError) return { ok: false, error: { message: '图片无法读取或尺寸过大，请换一张图片。' } };
      const image=new Image();image.src='/src/assets/reading-girl.svg';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.round(1200*image.naturalHeight/image.naturalWidth);
      canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
      return ok({ name: '自选图案.png', url: canvas.toDataURL('image/png') });
    };
    api.saveHomeArtwork = async ({name,sourceUrl,crop}: any) => {
      const image=new Image();image.src=sourceUrl;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*crop.width);canvas.height=Math.round(image.naturalHeight*crop.height);
      canvas.getContext('2d')!.drawImage(image,crop.x*image.naturalWidth,crop.y*image.naturalHeight,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
      saved = {name,url:canvas.toDataURL('image/png'),sourceUrl,crop}; localStorage.setItem('artwork-test', JSON.stringify(saved)); return ok(saved);
    };
    api.resetHomeArtwork = async () => { saved = null; localStorage.removeItem('artwork-test'); return ok(null); };
  });
  await page.goto('/');
  const artwork = page.locator('.omi-home__art img');
  await expect(artwork).toBeVisible();
  await expect(page.locator('.omi-home__mascot')).toHaveCount(3);
  const original = await artwork.getAttribute('src');
  async function settings() {
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    await page.locator('.sidebar-settings-button').click();
    await page.locator('#settings-category-appearance').click();
  }
  async function home() {
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  }
  await settings();
  const group = page.getByRole('region', { name: '主页看板娘', exact: true });
  await expect(group.getByRole('button', { name: '恢复默认', exact: true })).toBeDisabled();
  await group.getByRole('button', { name: '选择图片', exact: true }).click();
  const crop = page.getByRole('dialog', { name: '裁剪主页看板娘', exact: true });
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: '16:9', exact: true }).click();
  await crop.getByRole('slider', { name: '图片缩放', exact: true }).fill('150');
  await expect(crop.getByRole('spinbutton', { name: '裁剪宽度', exact: true })).toHaveValue('800');
  const width = await crop.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).inputValue();
  expect(Number(width)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/pc-1.1.28-artwork-crop.png' });
  await crop.getByRole('button', { name: '保存图案', exact: true }).click();
  await expect(group).toContainText('自选图案.png');
  await group.getByRole('button', { name: '调整裁剪', exact: true }).click();
  await expect(crop.getByRole('spinbutton', { name: '裁剪宽度', exact: true })).toHaveValue(width);
  await crop.getByRole('slider', { name: '图片缩放', exact: true }).fill('200');
  await crop.getByRole('button', { name: '取消', exact: true }).click();
  await group.getByRole('button', { name: '调整裁剪', exact: true }).click();
  await expect(crop.getByRole('spinbutton', { name: '裁剪宽度', exact: true })).toHaveValue(width);
  await page.keyboard.press('Escape'); await expect(crop).toHaveCount(0);
  await expect(group).toBeVisible();
  await page.evaluate(() => (window as any).__artworkCancel = true);
  await group.getByRole('button', { name: '选择图片', exact: true }).click();
  await expect(group).toContainText('自选图案.png');
  await page.evaluate(() => { (window as any).__artworkCancel = false; (window as any).__artworkError = true; });
  await group.getByRole('button', { name: '选择图片', exact: true }).click();
  await expect(group.getByRole('alert')).toContainText('图片无法读取');
  await home();
  await expect(artwork).toHaveAttribute('alt', '自选图案.png');
  await expect(page.locator('.omi-home__mascot')).toHaveCount(0);
  await expect(artwork).toHaveCSS('filter', 'none'); await expect(artwork).toHaveCSS('object-fit', 'contain');
  expect(await artwork.evaluate(el => getComputedStyle(el).maskImage)).toContain('linear-gradient');
  await page.screenshot({path:'test-results/pc-1.1.28-custom-home.png'});
  await page.reload(); await expect(artwork).toHaveAttribute('alt', '自选图案.png');
  await expect(page.locator('.omi-home__mascot')).toHaveCount(0);
  await settings();
  await group.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(group).toContainText('默认看板娘');
  await home(); await expect(artwork).toHaveAttribute('src', original!);
  await page.reload(); await expect(artwork).toHaveAttribute('src', original!);
  await expect(page.locator('.omi-home__mascot')).toHaveCount(3);
});

test('safety settings retain all confirmation switches without explanatory copy', async ({ page }) => {
  await page.addInitScript(installMock, { count: 20 }); await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.locator('.sidebar-settings-button').click(); await page.locator('#settings-category-safety').click();
  await expect(page.locator('#settings-section-safety input[type="checkbox"]')).toHaveCount(4);
  await expect(page.locator('#settings-section-safety .settings-section-note')).toHaveCount(0);
});
