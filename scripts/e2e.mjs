// End-to-end walkthrough against running dev servers (client :5173, API :3001).
// Usage: npm run dev (in another terminal), then: npm run e2e
// Writes screenshots to docs/screenshots/. Exits non-zero on the first failed check.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const RUN = Date.now().toString(36).slice(-4);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
  if (!ok) throw new Error(`Check failed: ${name} ${detail}`);
};

const browser = await chromium.launch();
const errors = [];

async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
}

async function openGroup(page, name) {
  await page.getByRole('link', { name: 'Groups', exact: true }).first().click();
  await page.getByRole('link', { name: new RegExp(name) }).first().click();
  await page.getByRole('heading', { level: 1, name }).waitFor();
}

async function addExpense(page, { description, amount, mode, values }) {
  await page.getByRole('button', { name: 'Add an expense' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add an expense' });
  await dialog.waitFor();
  await dialog.getByLabel('Description').fill(description);
  await dialog.getByLabel('Amount').fill(amount);
  await dialog.getByRole('radio', { name: new RegExp(mode, 'i') }).click();
  for (const [person, value] of Object.entries(values ?? {})) {
    await dialog.getByLabel(new RegExp(`^${person} .*(exact|percent|shares)$`)).fill(value);
  }
  return dialog;
}

try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(`console: ${m.text()}`));
  // HTTP errors are tracked by URL; the one deliberate wrong-password login is allowed
  let allowed401 = 1;
  page.on('response', (r) => {
    if (r.status() < 400) return;
    if (r.status() === 401 && r.url().endsWith('/api/auth/login') && allowed401-- > 0) return;
    errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
  });

  // 1. Login
  await page.goto(`${BASE}/login`);
  const loginBtn = page.getByRole('button', { name: 'Log in' });
  check('login button disabled until form filled', await loginBtn.isDisabled());
  await shot(page, '01-login');
  await page.getByLabel('Email address').fill('alex@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await loginBtn.click();
  await page.getByRole('alert').waitFor();
  check('wrong password shows an error', (await page.getByRole('alert').textContent()).includes('do not match'));
  await page.getByRole('button', { name: /Use the demo account/ }).click();
  await loginBtn.click();
  await page.getByRole('heading', { name: 'Hi, Alex' }).waitFor();
  check('demo login reaches dashboard', true);

  // 2. Dashboard
  const total = await page.getByText('Total balance').locator('..').textContent();
  check('dashboard shows total balance', /\$|€/.test(total), total.replace(/\s+/g, ' ').trim());
  check('dashboard lists groups', (await page.getByText('Lisbon trip').count()) > 0 && (await page.getByText('Apartment 4B').count()) > 0);
  check('dashboard shows recent activity', (await page.getByText(/recorded a payment|added|updated/).count()) > 0);
  await shot(page, '02-dashboard');

  // 3. Group view
  await openGroup(page, 'Lisbon trip');
  check('group shows balances panel', await page.getByText('Group balances').isVisible());
  check('group shows suggested payments', (await page.getByRole('button', { name: 'Record' }).count()) > 0);
  await shot(page, '03-group-lisbon');

  // 4. Add an expense with each split mode
  const cases = [
    { description: `E2E equal split ${RUN}`, amount: '30.01', mode: 'Equally' },
    { description: `E2E exact split ${RUN}`, amount: '50', mode: 'Exact', values: { 'Alex Rivera': '10', 'Sam Chen': '15.50', 'Jordan Patel': '24.50' } },
    { description: `E2E percent split ${RUN}`, amount: '80', mode: 'Percent', values: { 'Alex Rivera': '50', 'Sam Chen': '25', 'Jordan Patel': '25' } },
    { description: `E2E shares split ${RUN}`, amount: '40', mode: 'Shares', values: { 'Alex Rivera': '1', 'Sam Chen': '2', 'Jordan Patel': '1' } },
  ];
  for (const c of cases) {
    const dialog = await addExpense(page, c);
    if (c.mode === 'Exact') await shot(page, '04-add-expense-exact');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByText(c.description, { exact: true }).first().waitFor({ timeout: 5000 });
    check(`expense saved: ${c.mode}`, true);
  }

  // Unbalanced split is blocked in the UI
  const bad = await addExpense(page, { description: 'E2E unbalanced', amount: '10', mode: 'Exact', values: { 'Alex Rivera': '3', 'Sam Chen': '3', 'Jordan Patel': '3' } });
  check('unbalanced exact split shows remaining', (await bad.getByText('1.00 left').count()) === 1);
  await bad.getByRole('button', { name: 'Save' }).click();
  check('unbalanced exact split cannot be saved', (await bad.getByText('Exact amounts must add up to the total.').count()) === 1);
  await shot(page, '05-unbalanced-split');
  await bad.getByRole('button', { name: 'Cancel' }).click();

  // Expand the shares expense and check the computed shares
  await page.getByRole('button', { name: new RegExp(`E2E shares split ${RUN}`) }).click();
  check('shares split computed exactly', (await page.getByText('€20.00').count()) > 0 && (await page.getByText('(2 sh)').count()) === 1);
  await shot(page, '06-expense-detail');

  // Edit then delete the equal-split expense
  await page.getByRole('button', { name: new RegExp(`E2E shares split ${RUN}`) }).click();
  await page.getByRole('button', { name: new RegExp(`E2E equal split ${RUN}`) }).click();
  await page.getByRole('button', { name: 'Edit or delete' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit expense' });
  await edit.getByLabel('Description').fill(`E2E equal split ${RUN} (edited)`);
  await edit.getByRole('button', { name: 'Save' }).click();
  await edit.waitFor({ state: 'detached' });
  await page.getByText(`E2E equal split ${RUN} (edited)`).first().waitFor({ timeout: 5000 });
  check('expense edited', true);
  // the row stays expanded after saving; open it only if it collapsed
  if ((await page.getByRole('button', { name: 'Edit or delete' }).count()) === 0) {
    await page.getByRole('button', { name: new RegExp(`E2E equal split ${RUN} \\(edited\\)`) }).click();
  }
  await page.getByRole('button', { name: 'Edit or delete' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('dialog', { name: 'Edit expense' }).getByRole('button', { name: 'Delete expense' }).click();
  await page.getByRole('dialog', { name: 'Edit expense' }).waitFor({ state: 'detached' });
  await page.getByText(`E2E equal split ${RUN} (edited)`).first().waitFor({ state: 'detached', timeout: 5000 });
  check('expense deleted', true);

  // 5. Balances + simplify toggle
  const before = await page.getByRole('button', { name: 'Record' }).count();
  await page.getByRole('switch', { name: 'Simplify debts' }).click();
  await page.waitForTimeout(400);
  const after = await page.getByRole('button', { name: 'Record' }).count();
  check('simplify toggle changes suggestions view', after >= before, `${before} -> ${after}`);
  await page.getByRole('switch', { name: 'Simplify debts' }).click();
  await page.waitForTimeout(400);

  // 6. Settle up from a suggestion
  const suggestionCount = await page.getByRole('button', { name: 'Record' }).count();
  await page.getByRole('button', { name: 'Record' }).first().click();
  const settle = page.getByRole('dialog', { name: 'Settle up' });
  await settle.waitFor();
  await shot(page, '07-settle-up');
  await settle.getByRole('button', { name: 'Record payment' }).click();
  await settle.waitFor({ state: 'detached' });
  await page.waitForTimeout(400);
  const remaining = await page.getByRole('button', { name: 'Record' }).count();
  check('settling a suggestion removes it', remaining === suggestionCount - 1, `${suggestionCount} -> ${remaining}`);
  await page.getByRole('tab', { name: 'activity' }).click();
  check('group activity shows the payment', (await page.getByText('recorded a payment').count()) > 0);
  await page.getByRole('tab', { name: 'expenses' }).click();
  await shot(page, '08-group-after-settle');

  // 7. Friends
  await page.getByRole('link', { name: 'Friends', exact: true }).first().click();
  await page.getByRole('heading', { level: 1, name: 'Friends' }).waitFor();
  await page.getByRole('button', { name: 'Add a friend' }).click();
  const friend = page.getByRole('dialog', { name: 'Add a friend' });
  await friend.getByLabel('Name').fill('Morgan Lee');
  await friend.getByLabel('Email').fill(`morgan+${Date.now()}@example.com`);
  await friend.getByRole('button', { name: 'Add friend' }).click();
  await page.getByRole('heading', { level: 1, name: 'Morgan Lee' }).waitFor();
  check('friend added and opened', true);
  await page.getByRole('link', { name: 'Friends', exact: true }).first().click();
  await page.getByRole('link', { name: /Jordan Patel/ }).last().click();
  await page.getByRole('heading', { level: 1, name: 'Jordan Patel' }).waitFor();
  check('friend detail shows balance', await page.getByText('Across all groups').isVisible());
  await shot(page, '09-friend-detail');

  // 8. Activity
  await page.getByRole('link', { name: 'Activity', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Recent activity' }).waitFor();
  await page.getByText(/recorded a payment/).first().waitFor();
  check('activity has edits, deletes and payments',
    (await page.getByText(/updated/).count()) > 0 && (await page.getByText(/deleted/).count()) > 0 && (await page.getByText(/recorded a payment/).count()) > 0);
  await shot(page, '10-activity');

  // 9. New group with a member, then remove the member
  await page.getByRole('link', { name: 'Groups', exact: true }).first().click();
  await page.getByRole('button', { name: 'Start a new group' }).click();
  const ng = page.getByRole('dialog', { name: 'Start a new group' });
  await ng.getByLabel('Group name').fill('E2E Ski weekend');
  await ng.getByLabel('Member 1 name').fill('Casey Kim');
  await ng.getByLabel('Member 1 email').fill(`casey+${Date.now()}@example.com`);
  await ng.getByRole('button', { name: 'Create group' }).click();
  await page.getByRole('heading', { level: 1, name: 'E2E Ski weekend' }).waitFor();
  check('group created with member', (await page.getByText('Casey Kim').count()) > 0);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove Casey Kim' }).click();
  await page.waitForTimeout(400);
  check('member removed', (await page.getByRole('button', { name: 'Remove Casey Kim' }).count()) === 0);

  // 10. Logout
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  check('logout returns to login', true);
  await context.close();

  // 11. Mobile layout
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  await m.goto(`${BASE}/login`);
  await m.getByRole('button', { name: /Use the demo account/ }).click();
  await m.getByRole('button', { name: 'Log in' }).click();
  await m.getByRole('heading', { name: 'Hi, Alex' }).waitFor();
  check('mobile shows bottom navigation', await m.getByRole('navigation', { name: 'Main' }).last().isVisible());
  check('mobile hides the sidebar', !(await m.locator('aside').first().isVisible()));
  await m.screenshot({ path: `${OUT}11-mobile-dashboard.png` });
  await m.getByRole('button', { name: 'Add an expense' }).last().click();
  await m.getByRole('dialog', { name: 'Add an expense' }).waitFor();
  await m.screenshot({ path: `${OUT}12-mobile-add-expense.png` });
  await mobile.close();

  check('no browser console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  process.stderr.write(`\n${err instanceof Error ? err.stack : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
}
