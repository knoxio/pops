# Idea — replace the `/food` placeholder landing with a real dashboard

`pages/FoodLandingPage.tsx` is still a pure-render placeholder: a heading, an intro paragraph, and two static "coming soon" cards (Recipes, Manage data). That stub made sense when no surfaces existed. Every surface now exists — recipes, inbox, plan, fridge, solve, shopping, data management — so the landing page lies about the state of the app.

## Build this later

Turn `/food` into a real dashboard that links to and summarises the live surfaces:

- Replace the two static cards with entry tiles for each mounted surface (Recipes, Inbox, Plan, Fridge, Solve, Shopping, Manage data), each routing to its page.
- Surface live counts where cheap: pending inbox drafts, recipes count, this-week plan entries, expiring batches in the fridge. These read from the `@pops/food` pillar's REST contract via the `@pops/pillar-sdk` `pillar()` client.
- Keep an empty/zero state per tile so the page is still readable before any data exists.
- Drop the "coming soon" copy and the `aria-disabled`/`opacity-70` styling now that the targets are real.

## Notes

- Keep it lightweight — the landing page should not become a heavy data page; prefer a small number of cheap aggregate reads (counts, not full lists), each independently suspended so one slow read does not block the others.
- The `food` i18n namespace already holds `title`/`intro`/`recipes.*`/`data.*`/`status.comingSoon`; extend it for the new tiles rather than hardcoding copy.
