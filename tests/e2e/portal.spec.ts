import { test, expect } from "@playwright/test";
import AxeBuilder from '@axe-core/playwright';
test("patient can complete a session and message the team", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little stronger, Linda." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start today’s session" }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Movement done" }).click();
  await page.getByRole("button", { name: "About right" }).click();
  await page.getByRole("button", { name: "Save my session" }).click();
  await expect(
    page.getByRole("heading", { name: "A good step forward." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Today" }).click();
  await expect(
    page.getByRole("heading", { name: "You showed up for yourself." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Message your team", exact: true })
    .click();
  await page.getByLabel("Write to the team").fill("My knee is swollen today.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("My knee is swollen today.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("If it’s severe or sudden, call us now."),
  ).toBeVisible();
});
test("pre-visit quizzes gate the next video", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Preview patient stage").selectOption("pre_visit");
  await page.getByRole("link", { name: "Watch video", exact: true }).click();
  await page.getByRole("button", { name: "Mark sample video watched" }).click();
  await page.getByLabel("Start a new exercise without your PT").check();
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(
    page.getByText("Take another look around 30 seconds"),
  ).toBeVisible();
  await page.getByLabel("Bring your questions to the evaluation").check();
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(
    page.getByText("You’ve got it. The next video is ready."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(page.getByText("1 of 3 complete")).toBeVisible();
});
test("staff can sign a note and append a correction", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View team console" }).click();
  await page.getByRole("link", { name: "Linda Miller", exact: true }).click();
  await page.getByRole("tab", { name: "Chart", exact: true }).click();
  for (const label of ["Subjective", "Objective", "Assessment", "Plan"])
    await page.getByLabel(label, { exact: true }).fill(`${label} example`);
  await page.getByLabel("ICD-10 codes").fill("M25.5");
  await page.getByLabel("CPT codes").fill("97110");
  await page.getByRole("button", { name: "Save draft note" }).click();
  await page.getByRole("button", { name: "Sign and lock note" }).click();
  await expect(
    page.getByText("Original content is locked.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Add a dated correction").fill("Correction recorded.");
  await page.getByRole("button", { name: "Add addendum", exact: true }).click();
  await expect(
    page.getByText("Correction recorded.", { exact: true }),
  ).toBeVisible();
});
test("patient pages have no horizontal overflow", async ({ page }, info) => {
  for (const route of [
    "/",
    "/progress",
    "/messages",
    "/more",
    "/more/payments",
    "/more/referrals",
    "/more/plan",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/");
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `test-results/${info.project.name}-today.png`,
    fullPage: true,
  });
});

test('patient and admin screens pass automated accessibility checks',async({page})=>{
  await page.goto('/');
  for(const route of ['/','/progress','/messages','/more/payments','/more/plan']){
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.getByRole('button',{name:'View team console'}).click();
  if((page.viewportSize()?.width??1280)<800)await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('link',{name:'Admin',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Make the care work.'})).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test("plan of care proposal: produce, present, reveal, decline, send to portal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View team console" }).click();
  await page.getByRole("link", { name: "Linda Miller", exact: true }).click();
  await page.getByRole("tab", { name: "Plan & payments" }).click();
  await page.getByRole("link", { name: "Proposal builder" }).click();
  // PP-3: Produce stays disabled with the missing items listed.
  await expect(page.getByRole("button", { name: "Produce", exact: true })).toBeDisabled();
  await expect(page.getByText("At least 2 outcomes, each with a re-test week")).toBeVisible();
  await page.getByLabel("Condition template").selectOption({ label: "Knee — return to sport · Knee" });
  await expect(page.getByLabel("Goal, word for word")).toHaveValue("Back to pickleball with the grandkids.");
  await page.getByRole("button", { name: "Produce", exact: true }).click();
  await expect(page.getByText("Live on Blake’s tablet.", { exact: false }).first()).toBeVisible();

  await page.getByRole("link", { name: "Patients / Linda Miller" }).click();
  await page.getByRole("tab", { name: "Plan & payments" }).click();
  await page.getByText('Edit offer',{exact:true}).last().click();
  await page.getByRole('button',{name:'Approve 3 payments',exact:true}).click();
  await page.getByRole("link", { name: "Present on tablet" }).click();
  const deck = page.getByRole("dialog", { name: "Plan of care presentation" });
  await expect(deck.getByText("1 OF 6")).toBeVisible();
  for (let i = 0; i < 5; i++) {
    // PP-5: no price on sections 1–6, in the rendered app or its markup.
    expect(await page.locator("#root").innerHTML()).not.toMatch(/\$|4,400|440000|5,060/);
    await deck.getByRole("button", { name: "Next" }).click();
  }
  await expect(deck.getByText("6 OF 6")).toBeVisible();
  const hold = deck.getByRole("button", { name: "Show investment (press and hold)" });
  await expect(hold).toBeDisabled();
  await deck.getByRole("button", { name: "I have questions" }).click();
  await expect(deck.getByText("Ask anything.", { exact: false })).toBeVisible();
  await deck.getByRole("button", { name: "Yes, that’s the plan" }).click();
  await expect(hold).toBeEnabled();
  // A quick press does nothing; a one-second hold reveals the investment.
  await hold.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(200);
  await page.keyboard.up("Space");
  await page.waitForTimeout(1200);
  await expect(deck.getByText("INVESTMENT", { exact: true })).toHaveCount(0);
  await page.keyboard.down("Space");
  await page.waitForTimeout(1300);
  await page.keyboard.up("Space");
  await expect(deck.getByText("$4,400.00").first()).toBeVisible();
  await deck.getByText("3 payments", { exact: true }).click();
  await expect(deck.getByText("$2,481.50")).toBeVisible();
  await expect(deck.getByText("$1,265.00")).toHaveCount(2);

  await deck.getByText("Closer options").click();
  await deck.getByLabel("Reason").selectOption("needs_to_talk_to_spouse");
  await deck.getByRole("button", { name: "Mark declined" }).click();
  await expect(deck.getByText("DECLINED")).toBeVisible();
  await deck.getByText("Closer options").click();
  await deck.getByRole("button", { name: "Send to Linda’s portal" }).click();
  await expect(deck.getByText("SENT TO PORTAL")).toBeVisible();
  await deck.getByRole("link", { name: "Exit" }).click();

  // PP-13/PP-15: the patient now sees the full proposal with price.
  await page.getByRole("button", { name: "View patient portal" }).click();
  await page.getByRole("link", { name: "More", exact: true }).last().click();
  await page.getByRole("link", { name: /Your plan/ }).click();
  await expect(page.getByRole("heading", { name: "Your plan, ready when you are." })).toBeVisible();
  await expect(page.getByText("$4,400.00").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept and pay" })).toBeDisabled();
  await page.getByLabel("I accept this plan and the payment shown above.").check();
  await page.getByRole("button", { name: "Accept and pay" }).click();
  await expect(page.getByText("Sample mode does not take payments.", { exact: false }).first()).toBeVisible();
});

test("proposal screens pass automated accessibility checks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View team console" }).click();
  await page.getByRole("link", { name: "Linda Miller", exact: true }).click();
  await page.getByRole("tab", { name: "Plan & payments" }).click();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Proposal builder" }).click();
  await page.getByLabel("Condition template").selectOption({ label: "Knee — return to sport · Knee" });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Produce", exact: true }).click();
  await page.getByRole("link", { name: "Patients / Linda Miller" }).click();
  await page.getByRole("tab", { name: "Plan & payments" }).click();
  await page.getByRole("link", { name: "Present on tablet" }).click();
  await expect(page.getByText("1 OF 6")).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("patients see nothing about a proposal until it is sent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View team console" }).click();
  await page.getByRole("link", { name: "Linda Miller", exact: true }).click();
  await page.getByRole("tab", { name: "Plan & payments" }).click();
  await page.getByRole("link", { name: "Proposal builder" }).click();
  await page.getByLabel("Condition template").selectOption({ label: "Hip — walk and climb · Hip" });
  await page.getByRole("button", { name: "Produce", exact: true }).click();
  await page.getByRole("button", { name: "View patient portal" }).click();
  await page.getByRole("link", { name: "More", exact: true }).last().click();
  await page.getByRole("link", { name: /Your plan/ }).click();
  // Only Linda's accepted knee plan shows; the hip proposal stays hidden.
  await expect(page.getByRole("heading", { name: "Your plan." })).toBeVisible();
  await expect(page.getByText("Walk 2 miles comfortably")).toHaveCount(0);
  await expect(page.getByText("$4,400.00").first()).toBeVisible();
});
