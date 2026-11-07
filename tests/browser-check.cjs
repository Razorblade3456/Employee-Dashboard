/* Run after npm run build. Never connects to hosted Supabase or a real browser profile. */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const port = Number(process.env.TEST_PORT || 5197),
  origin = `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.BROWSER_REPORT_DIR || ".test-results");
let server, browser;
const checks = [],
  errors = [];
async function waitServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw Error("Test server exited before startup");
    try {
      if ((await fetch(origin)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Test server did not start");
}
async function login(page, role) {
  await page.goto(origin);
  await page.getByRole("button", { name: new RegExp("^" + role, "i") }).click();
  if (role !== "employee") {
    await page
      .getByLabel("Passcode", { exact: true })
      .fill(role === "manager" ? "1234" : "5678");
    await page
      .getByRole("button", { name: "Unlock " + role, exact: false })
      .click();
  }
  await page.locator(".app").waitFor();
}
async function navigate(page, label, mobile = false) {
  if (mobile)
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true })
    .click();
}
async function noOverflow(page, label) {
  const dims = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  if (dims.scroll > dims.width + 1) {
    await page.screenshot({
      path: path.join(output, "overflow.png"),
      fullPage: true,
      animations: "disabled",
    });
    console.log(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll("body *"))
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            right: e.getBoundingClientRect().right,
            width: e.getBoundingClientRect().width,
          }))
          .filter((e) => e.width > 390 && e.right > 390)
          .slice(0, 12),
      ),
    );
  }
  assert.ok(
    dims.scroll <= dims.width + 1,
    `${label}: page overflow ${JSON.stringify(dims)}`,
  );
}
async function saveTitle(page, name, title) {
  await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
  await page.getByLabel("Job title", { exact: true }).fill(title);
}
async function storage(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather-demo-v1")),
  );
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      windowsHide: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverLog = "";
  server.stdout.on("data", (b) => (serverLog += b));
  server.stderr.on("data", (b) => (serverLog += b));
  await waitServer();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL }
      : {}),
  });
  for (const mobile of [false, true])
    for (const role of ["employee", "manager", "accountant"]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await login(page, role);
      await noOverflow(page, role + " overview");
      const nav = page.locator(".sidebar");
      if (role === "employee") {
        assert.equal(
          await nav
            .getByRole("button", { name: "People", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await nav
            .getByRole("button", { name: "Payroll", exact: true })
            .count(),
          0,
        );
        await navigate(page, "Schedule", mobile);
        await page.locator(".schedule").count();
        await noOverflow(page, "employee schedule");
        assert.ok(
          (await page.getByText("PENDING", { exact: true }).count()) > 0,
        );
      }
      if (role === "accountant") {
        assert.equal(
          await nav
            .getByRole("button", { name: "People", exact: true })
            .count(),
          0,
        );
        await navigate(page, "Payroll", mobile);
        await page
          .getByRole("heading", { name: /estimate|payroll|paid/i })
          .first()
          .waitFor();
        await noOverflow(page, "accountant payroll");
      }
      if (role === "manager") {
        await navigate(page, "People", mobile);
        await page
          .getByRole("button", { name: "Add team member", exact: true })
          .waitFor();
        await noOverflow(page, "manager people");
      }
      await navigate(page, "Settings", mobile);
      if (role === "accountant")
        assert.equal(
          await page
            .getByRole("button", { name: "Save workspace", exact: true })
            .count(),
          0,
        );
      if (role === "employee")
        assert.equal(
          await page
            .getByRole("button", { name: "Save payroll policy", exact: true })
            .count(),
          0,
        );
      if (role === "manager")
        await page
          .getByLabel("Workspace name", { exact: true })
          .fill("Unsaved fictional workspace");
      await page
        .getByRole("button", { name: "How to Use This Dashboard", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "How to Use This Dashboard",
        exact: true,
      });
      await dialog.waitFor();
      await dialog
        .getByRole("button", { name: "Show an example", exact: true })
        .click();
      await dialog.locator(".tutorial-example").waitFor();
      await dialog
        .getByRole("button", { name: "Next topic", exact: true })
        .click();
      await noOverflow(page, role + " tutorial");
      await page.screenshot({
        path: path.join(
          output,
          `${role}-${mobile ? "mobile" : "desktop"}-tutorial.png`,
        ),
        fullPage: true,
        animations: "disabled",
      });
      await dialog
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      if (role === "manager")
        assert.equal(
          await page.getByLabel("Workspace name", { exact: true }).inputValue(),
          "Unsaved fictional workspace",
        );
      await page
        .getByRole("button", { name: "How to Use This Dashboard", exact: true })
        .click();
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      checks.push(
        `${role} ${mobile ? "mobile" : "desktop"}: allowed navigation, restricted tools, layout, tutorial examples, close/reopen`,
      );
      await context.close();
    }
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    a = await context.newPage(),
    b = await context.newPage();
  a.on("pageerror", (e) => errors.push(e.message));
  b.on("pageerror", (e) => errors.push(e.message));
  await login(a, "manager");
  await login(b, "manager");
  await navigate(a, "People");
  await navigate(b, "People");
  await saveTitle(a, "Alex Morgan", "Manager A correction");
  await saveTitle(b, "Alex Morgan", "Manager B stale overwrite");
  await a.getByRole("button", { name: "Save changes", exact: true }).click();
  await a.getByRole("dialog").waitFor({ state: "hidden" });
  await b.getByRole("button", { name: "Save changes", exact: true }).click();
  await b
    .getByRole("alert")
    .filter({ hasText: "Someone changed this record" })
    .waitFor();
  assert.equal(
    (await storage(a)).employees.find((e) => e.name === "Alex Morgan").title,
    "Manager A correction",
  );
  await b.getByRole("button", { name: "Cancel", exact: true }).click();
  checks.push("Two manager tabs: stale save rejected and first edit retained");
  await saveTitle(a, "Alex Morgan", "Independent A");
  await saveTitle(b, "Olivia Chen", "Independent B");
  await Promise.all([
    a.getByRole("button", { name: "Save changes", exact: true }).click(),
    b.getByRole("button", { name: "Save changes", exact: true }).click(),
  ]);
  await a.getByRole("dialog").waitFor({ state: "hidden" });
  await b.getByRole("dialog").waitFor({ state: "hidden" });
  const saved = await storage(a);
  assert.equal(
    saved.employees.find((e) => e.name === "Alex Morgan").title,
    "Independent A",
  );
  assert.equal(
    saved.employees.find((e) => e.name === "Olivia Chen").title,
    "Independent B",
  );
  await a.reload();
  await navigate(a, "People");
  await a.getByText("Independent A", { exact: true }).waitFor();
  await a.getByText("Independent B", { exact: true }).waitFor();
  checks.push(
    "Two manager tabs: independent simultaneous writes both persist across reload",
  );
  await navigate(a, "Timesheets");
  await a
    .getByRole("button", { name: "Add time entry", exact: true })
    .waitFor();
  await navigate(a, "Schedule");
  await a.screenshot({
    path: path.join(output, "manager-schedule-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  const target = (await storage(a)).schedule_days[0].date.slice(0, 8) + "28";
  const employeeId = (await storage(a)).employees.find(
    (e) => e.name === "Alex Morgan",
  ).id;
  await a.getByRole("button", { name: "Create shift", exact: true }).click();
  await a.locator('select[name="employee_id"]').selectOption(employeeId);
  await a.locator('input[name="date"]').fill(target);
  await a.locator('input[name="start"]').fill("09:00");
  await a.locator('input[name="end"]').fill("17:00");
  await a.locator('input[name="break_minutes"]').fill("30");
  await a.getByRole("button", { name: "Save changes", exact: true }).click();
  await a.getByRole("dialog").waitFor({ state: "hidden" });
  async function publishTarget() {
    await a.getByRole("button", { name: "Publish", exact: true }).click();
    await a.locator('input[name="from"]').fill(target);
    await a.locator('input[name="to"]').fill(target);
    await a.getByRole('dialog').getByRole('checkbox').check();
    await a
      .getByRole("button", { name: "Publish schedule", exact: true })
      .click();
    await a.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await publishTarget();
  const employeePage = await context.newPage();
  employeePage.on("pageerror", (e) => errors.push(e.message));
  await login(employeePage, "employee");
  await navigate(employeePage, "Schedule");
  const ownShift = employeePage.getByRole("button", {
    name: new RegExp("^Shift for Alex Morgan on " + target + " 9a to 5p$"),
  });
  await ownShift.waitFor();
  await a.getByRole("button", { name: "Month", exact: true }).click();
  await a
    .getByRole("button", {
      name: new RegExp(
        "^Edit shift for Alex Morgan on " + target + " 9a to 5p$",
      ),
    })
    .click();
  await a.locator('input[name="end"]').fill("18:00");
  await a.getByRole("button", { name: "Save changes", exact: true }).click();
  await a.getByRole("dialog").waitFor({ state: "hidden" });
  await ownShift.waitFor({ state: "hidden" });
  await publishTarget();
  await employeePage
    .getByRole("button", {
      name: new RegExp("^Shift for Alex Morgan on " + target + " 9a to 6p$"),
    })
    .waitFor();
  checks.push(
    "Schedule create/publish/edit/republish synchronizes to employee without showing draft shifts",
  );
  const accountantPage = await context.newPage();
  accountantPage.on("pageerror", (e) => errors.push(e.message));
  await login(accountantPage, "accountant");
  await navigate(accountantPage, "Timesheets");
  await accountantPage
    .getByRole("button", { name: "Add time entry", exact: true })
    .click();
  await accountantPage
    .locator('select[name="employee_id"]')
    .selectOption(employeeId);
  await accountantPage.locator('input[name="date"]').fill(target);
  await accountantPage.locator('input[name="start"]').fill("09:00");
  await accountantPage.locator('input[name="end"]').fill("18:00");
  await accountantPage.locator('input[name="break_minutes"]').fill("30");
  await accountantPage.locator('input[name="approved"]').check();
  await accountantPage
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await accountantPage.getByRole("dialog").waitFor({ state: "hidden" });
  await navigate(accountantPage, "Payroll");
  await accountantPage.getByLabel("From", { exact: true }).fill(target);
  await accountantPage.getByLabel("To", { exact: true }).fill(target);
  await accountantPage
    .getByLabel("Payroll employee", { exact: true })
    .selectOption(employeeId);
  await accountantPage
    .getByRole("button", { name: "Set rate for Alex Morgan", exact: true })
    .click();
  await accountantPage.locator('input[name="hourly_rate"]').fill("25");
  await accountantPage.locator('input[name="effective_date"]').fill(target);
  await accountantPage
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await accountantPage.getByRole("dialog").waitFor({ state: "hidden" });
  const entry = (await storage(accountantPage)).time_entries.find(
    (e) => e.employee_id === employeeId && e.date === target,
  );
  assert.ok(entry.approved);
  await accountantPage.getByText("$212.50", { exact: true }).first().waitFor();
  const download = accountantPage.waitForEvent("download");
  await accountantPage
    .getByRole("button", { name: "Export Excel", exact: true })
    .last()
    .click();
  const workbook = await download;
  await workbook.saveAs(path.join(output, "fictional-payroll.xlsx"));
  assert.equal(await workbook.failure(), null);
  checks.push(
    "Accountant actual-time approval, effective rate, $212.50 gross estimate and Excel download",
  );
  await context.close();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, "browser-results.json"),
    JSON.stringify(
      {
        origin,
        fictional: true,
        isolatedBrowser: true,
        checks,
        checksPassed: checks.length,
        runtimeErrors: errors,
      },
      null,
      2,
    ),
  );
  await fs.writeFile(path.join(output, "test-server.log"), serverLog);
  console.log(
    JSON.stringify(
      { checksPassed: checks.length, checks, runtimeErrors: errors },
      null,
      2,
    ),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) server.kill();
  });
