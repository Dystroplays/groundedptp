import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const browser=await chromium.launch();
for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const page=await context.newPage();
  for(const path of ['/','/progress','/messages','/more/payments']){
    await page.goto(`http://127.0.0.1:5173${path}`);await page.locator('h1').waitFor();
    const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    console.log(JSON.stringify({width,path,violations:audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}))}));
  }
  await page.getByRole('button',{name:'View team console'}).click();
  if(width<800)await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('link',{name:'Admin',exact:true}).click();
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  console.log(JSON.stringify({width,path:'/team/admin',violations:audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}))}));
  await context.close();
}
await browser.close();
