import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const browser=await chromium.launch();
const page=await browser.newPage();
for(const size of [180,192,512]){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0;background:#1f3d2b}svg{width:100vw;height:100vh}</style>${readFileSync('public/icon.svg','utf8')}`);
  await page.screenshot({path:`public/icon-${size}.png`});
}
await browser.close();
