# REA findings: public Splitwise web surface

Date: 2026-11-17. Tool: REA MCP server (`capture_browser_scenario`, `inspect_analysis_view`,
`capture_web_screenshot`) driving Chromium 157 in launch mode with a temporary profile, plus one
CDP-connected headless Chrome for the screenshot. Only public, unauthenticated pages were visited.
No login was attempted, no forms were submitted, no rate limits or paywalls were touched.

## Evidence index

| Evidence ID | What it holds |
|---|---|
| `ev_45cff37e2c817f5bdd7b03cae97d5f7306e919c1f58f7d2d1135646e3f65afef` | Scenario: `/` -> `/signup` -> `secure.splitwise.com/login`, accessibility tree after each step |
| `ev_1968869a5a68f9beaf3294f14b0c80d32d6950997ea93cd392462619d426030d` | View: home page accessibility text (step 1) |
| `ev_caeede76d3cd918759173ec8ce8a2bd25ca1da505cbcef7c350f3e1c59f7a228` | Scenario: `/` -> `/calculators` with network events (65 transactions) |
| `ev_ce82e12bc5d3a2ba3e508973b128c2df5da0a020953abf01027a75b33627b21e` | Summary view of the network scenario (origins, resource types, status classes) |
| `ev_8848d73fcde8f36e4016d11f8293d5854d91fbf2391b24741fd53cc44941d86c` | Viewport screenshot (1280px wide) of the public home page |

## Observations (directly seen in Evidence)

Page structure
- Home: top banner with logo link, "Log in" text link and a filled "Sign up" button. Hero with an
  H1 whose last line rotates through use cases (trips, housemates, ...), four small icon tabs that
  switch the use case, one paragraph of value prop, a primary CTA, and "free for iPhone, Android,
  and web". Below: four feature blocks (Track balances, Organize expenses, Add expenses easily,
  Pay friends back), a Pro upsell, a two-column feature checklist ("core" vs "pro"), press quotes
  and testimonials, then a dense three-column footer (Splitwise / Account / More).
- Login (`secure.splitwise.com/login`): minimal centered form. "Email address", "Password", a
  "Log in" button that is disabled until the form is filled, "Forgot your password?", a divider
  with "or", and a Google sign-in button.
- Calculators: a list of link cards, each with an illustration and one bolded keyword.

Feature list stated on the public home page (core tier): add groups and friends; split expenses,
record debts; equal or unequal splits; split by % or shares; calculate total balances; simplify
debts; recurring expenses; offline mode; cloud sync; spending totals; categorize expenses;
7+ languages; 100+ currencies; payment integrations; unlimited expenses.

Visual language
- Screenshot: white top bar, very light grey geometric background, large dark-charcoal heavy
  geometric sans headline with one accent-colored line, purple illustration for the
  housemates use case, rounded-rectangle buttons (about 4-6px radius) with a soft drop shadow.
- Primary CTA in the bar is a filled mint/teal-green button with white text.
- Fonts loaded: Montserrat 400/600/700 (headings) and Lato 400/400i/700 (body), via Google Fonts.
- Most frequent hex colors in the public stylesheet: `#1CC29F` (36x, teal-green), `#373B3F`
  (charcoal text), `#8656CD` (purple), `#52595F` (secondary text), `#A6002F` (deep red),
  `#18A582` (darker green), `#E6E8EE` (borders), `#ED5601` (orange).

Network
- 65 transactions across two page loads. First-party: 2 documents, 1 RUM beacon each page
  (`/cdn-cgi/rum`, Cloudflare). Static assets come from `assets.splitwise.com`.
- No first-party JSON/API calls on the public pages. All `fetch` traffic is analytics/ads
  (Google Analytics, DoubleClick, Google remarketing). The app's data API is not exercised by
  any public page.

## Inferences (reasoned, not observed)

- The signed-in web app is a server-rendered shell plus JavaScript that talks to a JSON API under
  the same origin. The public developer docs link (`dev.splitwise.com`) points to a REST API with
  users, groups, friends, expenses and comments as resources. Our clone mirrors that resource
  split.
- Green signals "you are owed" / positive and orange-red signals "you owe" (green and orange are
  both prominent in the palette; this is the common convention for this app category).
- The logged-in layout uses a left navigation column (dashboard, recent activity, all expenses,
  groups, friends) and a central column with "Add an expense" / "Settle up" actions. This comes
  from general familiarity with the product category and public help material, not from a
  capture, because that area requires login.

## Unknowns

- Exact signed-in DOM, layout, and API payload shapes: behind authentication, intentionally not
  accessed.
- Rounding rule for uneven equal splits (which participant receives the leftover cent). We pick
  a deterministic rule (first participants in list order get the extra cent) and document it.
- How multi-currency totals are displayed in the dashboard. We show one line per currency and
  never convert.

## Derived feature / UX checklist for the clone

- [x] Email + password login, centered minimal form, button disabled until both fields filled
- [x] Dashboard: total balance, "you owe", "you are owed", per-person breakdown
- [x] Left navigation on desktop: dashboard, activity, groups list, friends list
- [x] Bottom tab bar on mobile
- [x] Groups: create, members add/remove, group detail with expense list and balances
- [x] Friends: list with balance per friend, add friend by email
- [x] Expenses: description, amount, currency, category, date, payer, participants
- [x] Split modes: equally, exact amounts, percentages, shares
- [x] Simplify debts toggle per group, settlement suggestions
- [x] Settle up: record a cash payment
- [x] Activity feed
- [x] Categories with icons
- [x] Multiple currencies (no conversion)
- Not built (paid tier or out of scope): receipt scanning, charts, currency conversion,
  recurring expenses, payment integrations, offline mode.

## Design decisions for our own look

Our palette is original: a "mint" accent ramp centered on `#13B38A`, charcoal ink `#24292E`,
coral `#E4572E` for "you owe", soft slate surfaces. Typography uses Manrope (self-hosted via
`@fontsource-variable`, no Google Fonts call) with tabular numerals for money. Avatars are
initials on a color derived from the user id. No Splitwise logo, illustration, copy or code is
reused; the brand name in the clone is "Evenly".

## Limitations

- Only four public pages were driven (home, signup, login, calculators); the signed-in
  app was not observed.
- `capture_web_screenshot` captures only the viewport (no scrolling), so below-the-fold visuals
  were taken from the accessibility tree, not pixels.
- Color frequencies come from one public stylesheet (`motel-*.css`), not from the signed-in app.
- Analytics hosts were recorded as present; their payloads were not retained or analyzed.
