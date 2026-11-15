const { expect } = require('@playwright/test');
async function openReaderDisplay(page) {
  const panel=page.getByRole('dialog',{name:'阅读设置',exact:true});
  if(!await panel.count())await page.getByRole('button',{name:'阅读设置',exact:true}).click();
  await expect(panel).toBeVisible();return panel;
}
async function chooseReaderFit(page,label) {
  const panel=await openReaderDisplay(page),option=panel.getByRole('button',{name:label,exact:true});
  await option.click();await expect(option).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');
}
async function expectReaderFit(page,label,disabled) {
  const panel=await openReaderDisplay(page),option=panel.getByRole('button',{name:label,exact:true});
  await expect(option).toHaveAttribute('aria-pressed','true');
  if(disabled===true)await expect(option).toBeDisabled();if(disabled===false)await expect(option).toBeEnabled();
  await page.keyboard.press('Escape');
}
module.exports={openReaderDisplay,chooseReaderFit,expectReaderFit};
