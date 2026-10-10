import { expect, type Locator } from '@playwright/test';

export async function setCardScale(slider: Locator, value: number) {
  const index = [40, 55, 75, 100, 125, 150, 200].indexOf(value);
  if (index < 0) throw new Error(`Unknown scale detent: ${value}`);
  await slider.evaluate((input: HTMLInputElement, index) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(index));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, index);
  await expect(slider).toHaveAttribute('aria-valuetext', `每行 ${7 - index} 张`);
}
