# Manual Test Plan — Non-Finance Features

**Date:** 2026-03-24
**App URL:** `http://localhost:5568`
**API URL:** `http://localhost:3000`
**Prerequisite:** Run `mise db:seed` before starting to ensure known test data (10 movies, 3 TV shows, 5 inventory items).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| P | Pass |
| F | Fail (note bug) |
| B | Blocked (note reason) |
| N/A | Not applicable / feature not implemented |

---

## 1. Shell & Navigation

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 1.1 | App loads | Navigate to `http://localhost:5568` | App renders without blank screen or console errors | | |
| 1.2 | Default redirect | Load `/` | Redirects to `/finance` | | |
| 1.3 | App Rail visible | Look at left sidebar | App Rail shows Finance (emerald), Media (indigo), Inventory (amber) icons | | |
| 1.4 | Switch to Media | Click Media icon in App Rail | URL changes to `/media`, sidebar updates to show Media nav items | | |
| 1.5 | Switch to Inventory | Click Inventory icon in App Rail | URL changes to `/inventory`, sidebar updates to show Inventory nav items | | |
| 1.6 | Switch back to Finance | Click Finance icon in App Rail | URL changes to `/finance`, sidebar updates to Finance nav items | | |
| 1.7 | Sidebar nav items - Media | Switch to Media app | Sidebar shows: Library, Watchlist, History, Discover, Rankings, Search, Compare, Quick Pick, Plex | | |
| 1.8 | Sidebar nav items - Inventory | Switch to Inventory app | Sidebar shows: Items, Warranties, Report (and possibly Locations) | | |
| 1.9 | Active nav highlight | Click through sidebar items | Active item is visually highlighted | | |
| 1.10 | Direct URL navigation | Type `http://localhost:5568/media/watchlist` directly | Watchlist page loads, Media app is selected in rail, Watchlist is highlighted in sidebar | | |
| 1.11 | 404 / unknown route | Navigate to `/media/nonexistent` | Graceful handling — error boundary or redirect, no blank screen | | |
| 1.12 | Browser back/forward | Navigate Media → Inventory → back | Browser history works correctly, UI updates to match | | |

---

## 2. Media — Library

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 2.1 | Library page loads | Navigate to `/media` | Page renders with seeded movies and TV shows | | |
| 2.2 | Movie cards display | Look at movie entries | Cards show title, year, poster image, runtime, rating | | |
| 2.3 | TV show cards display | Look at TV show entries | Cards show name, poster, episode count, network | | |
| 2.4 | Click movie card | Click on a movie (e.g. "The Shawshank Redemption") | Navigates to `/media/movies/:id`, detail page loads | | |
| 2.5 | Click TV show card | Click on a TV show (e.g. "Breaking Bad") | Navigates to `/media/tv/:id`, detail page loads | | |
| 2.6 | Empty state | Clear DB movies and reload (or test with fresh DB) | Shows meaningful empty state, not a blank page | | |

---

## 3. Media — Movie Detail

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 3.1 | Detail page loads | Navigate to a movie detail page | Shows title, overview, genres, runtime, ratings, poster/backdrop | | |
| 3.2 | Add to watchlist | Click "Add to Watchlist" button (if not already on watchlist) | Movie added, button state changes to indicate it's on watchlist | | |
| 3.3 | Mark as watched | Click "Mark as Watched" or similar | Watch history entry created, UI updates | | |
| 3.4 | Back navigation | Click back or breadcrumb | Returns to library | | |
| 3.5 | Non-existent movie | Navigate to `/media/movies/99999` | Error state or "not found" message, no crash | | |

---

## 4. Media — TV Show Detail

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 4.1 | Show detail loads | Navigate to a TV show detail page | Shows name, overview, network, status, episode count | | |
| 4.2 | Seasons list | Look for seasons section | Lists all seasons with episode counts | | |
| 4.3 | Season detail | Click on a season | Navigates to `/media/tv/:id/season/:num`, shows episode list | | |
| 4.4 | Episode list | On season detail page | Episodes show name, air date, episode number, still image | | |
| 4.5 | Mark episode watched | Click watch button on an episode | Episode marked as watched, progress updates | | |
| 4.6 | Show progress | After marking episodes | Progress bar/indicator reflects watched vs total | | |
| 4.7 | Non-existent show | Navigate to `/media/tv/99999` | Error state, no crash | | |

---

## 5. Media — Search

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 5.1 | Search page loads | Navigate to `/media/search` | Search input visible, possibly empty state | | |
| 5.2 | Search movies | Type a movie name (e.g. "Inception") and submit | Results from TMDB appear with poster, title, year | | |
| 5.3 | Search TV shows | Search for a TV show (e.g. "The Office") | TV show results appear | | |
| 5.4 | Add from search | Click add/import on a search result | Movie/show added to library, confirmation shown | | |
| 5.5 | Empty search | Search for gibberish (e.g. "zzxxqq") | "No results" message, no error | | |
| 5.6 | Search with special chars | Search for `O'Brien` or `Spider-Man: No Way Home` | Handles gracefully, no crash | | |
| 5.7 | API unavailable | (If testable) Disconnect network or use invalid TMDB key | Error message shown, no unhandled exception | | |

---

## 6. Media — Watchlist

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 6.1 | Watchlist page loads | Navigate to `/media/watchlist` | Shows watchlist items or empty state | | |
| 6.2 | Items display | With items on watchlist | Shows title, media type, priority, notes, poster | | |
| 6.3 | Reorder items | Drag to reorder (if supported) or use reorder controls | Order persists after page refresh | | |
| 6.4 | Change priority | Edit priority on an item | Priority updates, reflected in UI | | |
| 6.5 | Remove from watchlist | Click remove on an item | Item removed, list updates | | |
| 6.6 | Add notes | Add/edit notes on a watchlist item | Notes saved and visible | | |
| 6.7 | Empty watchlist | Remove all items | Empty state message shown | | |
| 6.8 | Click through to detail | Click on a watchlist item title | Navigates to the movie/show detail page | | |

---

## 7. Media — Watch History

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 7.1 | History page loads | Navigate to `/media/history` | Shows watch history entries or empty state | | |
| 7.2 | Entries display | With history entries | Shows title, watched date, completed status | | |
| 7.3 | Recent entries | Check ordering | Most recent entries appear first | | |
| 7.4 | Delete entry | Delete a history entry (if supported) | Entry removed from list | | |
| 7.5 | Empty history | With no watch history | Empty state message shown | | |

---

## 8. Media — Discover

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 8.1 | Discover page loads | Navigate to `/media/discover` | Page renders with recommendations or trending content | | |
| 8.2 | Trending section | Look for trending movies/shows | TMDB trending items displayed | | |
| 8.3 | Recommendations | If user has watch history/ratings | Personalized recommendations shown | | |
| 8.4 | Discover card interaction | Click on a discover card | Navigates to detail or shows add option | | |
| 8.5 | TMDB unavailable | (If testable) | Graceful error handling | | |

---

## 9. Media — Rankings & Compare

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 9.1 | Rankings page loads | Navigate to `/media/rankings` | Shows Elo leaderboard or empty state | | |
| 9.2 | Dimension selector | If multiple dimensions exist | Can switch between dimensions | | |
| 9.3 | Create dimension | Add a new comparison dimension (e.g. "Rewatchability") | Dimension created, appears in selector | | |
| 9.4 | Compare page loads | Navigate to `/media/compare` | Shows 1v1 comparison arena | | |
| 9.5 | Random pair | Page should show two random media items | Two items displayed with posters and titles | | |
| 9.6 | Pick a winner | Click on one of the two items | Comparison recorded, new pair loaded | | |
| 9.7 | Scores update | After several comparisons, check rankings | Elo scores reflect comparison results | | |
| 9.8 | Not enough items | With < 2 items in library | Appropriate message (can't compare) | | |

---

## 10. Media — Quick Pick

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 10.1 | Quick Pick page loads | Navigate to `/media/quick-pick` | "What to watch tonight" flow starts | | |
| 10.2 | Selection flow | Follow the quick pick prompts | Filters narrow down, suggestions presented | | |
| 10.3 | Result | Complete the flow | A recommendation is shown with option to mark as watching | | |
| 10.4 | Empty library | With no media in library | Graceful message, not an error | | |

---

## 11. Media — Plex Integration

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 11.1 | Plex page loads | Navigate to `/media/plex` | Plex configuration page renders | | |
| 11.2 | URL configuration | Enter/edit Plex server URL | URL saved, field reflects saved value | | |
| 11.3 | PIN-based auth flow | Click authenticate / link account | PIN displayed or auth flow initiated | | |
| 11.4 | Test connection | Click "Test Connection" (with valid URL) | Success/failure message shown | | |
| 11.5 | Library listing | After successful connection | Plex libraries listed | | |
| 11.6 | Sync movies | Trigger movie sync | Movies from Plex imported into library | | |
| 11.7 | Sync TV shows | Trigger TV show sync | Shows from Plex imported | | |
| 11.8 | Sync status | During/after sync | Progress or completion status shown | | |
| 11.9 | Scheduler | Start/stop sync scheduler | Scheduler status updates correctly | | |
| 11.10 | Disconnect | Click disconnect | Plex auth cleared, UI resets to unauthenticated state | | |
| 11.11 | Invalid URL | Enter garbage URL, test connection | Clear error message | | |
| 11.12 | No Plex server | Without Plex configured | Page shows setup instructions, not errors | | |

---

## 12. Inventory — Items List

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 12.1 | Items page loads | Navigate to `/inventory` | Shows seeded inventory items (MacBook, headphones, TV, vacuum, coffee machine) | | |
| 12.2 | Item cards/table | Look at item entries | Shows name, brand, type, condition, location, value | | |
| 12.3 | Click item | Click on an item | Navigates to `/inventory/items/:id` detail page | | |
| 12.4 | Create new item | Click "New Item" or "+" button | Navigates to `/inventory/items/new` | | |
| 12.5 | Empty state | With no items | Empty state message with prompt to add first item | | |
| 12.6 | Filtering/sorting | If filter/sort controls exist | Items filter/sort correctly | | |

---

## 13. Inventory — Create Item

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 13.1 | Form loads | Navigate to `/inventory/items/new` | Form renders with all fields | | |
| 13.2 | Required fields | Submit empty form | Validation errors shown for required fields | | |
| 13.3 | Fill all fields | Enter: name, brand, model, type, condition, location, purchase date, purchase price, warranty expiry, replacement value, resale value, asset ID | All fields accept input correctly | | |
| 13.4 | Save item | Fill required fields and submit | Item created, redirects to detail or list page | | |
| 13.5 | Cancel | Click cancel during creation | Returns to list, no item created | | |
| 13.6 | Duplicate name | Create item with same name as existing | Either allowed (with warning) or prevented | | |
| 13.7 | Special characters | Enter name with `&`, `<`, `"`, emoji | Saved and displayed correctly, no XSS | | |
| 13.8 | Date fields | Enter purchase date in future / warranty in past | Accepted (may show warning) | | |
| 13.9 | Negative values | Enter negative purchase price | Validation error or rejection | | |

---

## 14. Inventory — Item Detail & Edit

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 14.1 | Detail page loads | Navigate to `/inventory/items/:id` | Shows all item fields, photos, connections, documents | | |
| 14.2 | Edit item | Click Edit button | Navigates to edit form pre-filled with current values | | |
| 14.3 | Update fields | Change a field and save | Changes persisted, visible on detail page | | |
| 14.4 | Delete item | Click delete button | Confirmation dialog shown; on confirm, item deleted, redirect to list | | |
| 14.5 | Non-existent item | Navigate to `/inventory/items/99999` | Error/not-found state, no crash | | |
| 14.6 | Photo gallery | If item has photos | Gallery displays, can scroll/view photos | | |
| 14.7 | Upload photo | Upload a photo to an item | Photo appears in gallery | | |
| 14.8 | Remove photo | Remove a photo | Photo removed from gallery | | |
| 14.9 | Reorder photos | Drag/reorder photos (if supported) | Order persists | | |
| 14.10 | Connections list | If item has connections | Connected items shown with relationship info | | |
| 14.11 | Add connection | Connect this item to another | Connection created, visible on both items | | |
| 14.12 | Remove connection | Disconnect an item | Connection removed from both sides | | |
| 14.13 | Link document | Link a Paperless document (if Paperless configured) | Document appears in item's document list | | |
| 14.14 | Unlink document | Remove a linked document | Document removed from list (not deleted from Paperless) | | |

---

## 15. Inventory — Warranties

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 15.1 | Warranties page loads | Navigate to `/inventory/warranties` | Shows items with warranty info | | |
| 15.2 | Expiring soon | Items with warranties expiring within 30 days | Highlighted or flagged visually | | |
| 15.3 | Expired warranties | Items with past warranty dates | Shown as expired | | |
| 15.4 | No warranty items | Items without warranty dates | Either excluded or shown as "No warranty" | | |
| 15.5 | Click through | Click on a warranty item | Navigates to item detail | | |

---

## 16. Inventory — Reports

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 16.1 | Report page loads | Navigate to `/inventory/report` | Insurance report or dashboard renders | | |
| 16.2 | Total value | Check total | Sum of all item replacement values shown | | |
| 16.3 | Value by location | Breakdown section | Values grouped by location | | |
| 16.4 | Value by type | Breakdown section | Values grouped by item type | | |
| 16.5 | Dashboard stats | Stat cards | Total items, total value, items under warranty, etc. | | |
| 16.6 | Export/PDF | If export button exists | Report exports or downloads correctly | | |
| 16.7 | Empty state | With no items | Shows zero values, not errors | | |

---

## 17. Inventory — Locations

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 17.1 | Location picker | When creating/editing an item | Location picker shows hierarchical tree | | |
| 17.2 | Create location | Create a new location (e.g. "Garage > Shelf 1") | Location created with parent hierarchy | | |
| 17.3 | Nested locations | Create child under existing location | Hierarchy maintained correctly | | |
| 17.4 | Location in item | Assign location to item | Location shown on item detail and list | | |
| 17.5 | Location breadcrumb | On item with nested location | Breadcrumb shows full path (e.g. "Home > Garage > Shelf 1") | | |

---

## 18. Cross-Cutting Concerns

| # | Test | Steps | Expected Result | Status | Notes |
|---|------|-------|-----------------|--------|-------|
| 18.1 | API error handling | Stop the API server (`Ctrl+C` on pops-api), try loading a page | Error state shown in UI, not blank screen | | |
| 18.2 | API recovery | Restart API server, interact with UI | App recovers, data loads | | |
| 18.3 | Console errors | Open DevTools Console during all tests | No unhandled exceptions or React errors | | |
| 18.4 | Responsive - tablet | Resize browser to ~768px width | Layout adapts, no horizontal overflow | | |
| 18.5 | Responsive - mobile | Resize to ~375px width | Layout adapts, sidebar collapses, content readable | | |
| 18.6 | Page refresh | Refresh on any deep route (e.g. `/media/watchlist`) | Page reloads correctly, doesn't 404 | | |
| 18.7 | Loading states | On slow network (DevTools throttle) | Skeleton loaders or spinners shown, no layout jump | | |
| 18.8 | Concurrent mutations | Open two tabs, edit same item in both | Second save either wins or shows conflict, no silent data loss | | |
| 18.9 | Long text | Enter very long names/notes (500+ chars) | Text truncates or wraps gracefully, no layout break | | |
| 18.10 | Type check | Run `mise typecheck` | No TypeScript errors | | |
| 18.11 | Unit tests pass | Run `mise test` | All tests pass | | |
| 18.12 | Lint pass | Run `mise lint` | No lint errors | | |

---

## Defect Log

| # | Test Ref | Severity | Description | Steps to Reproduce | Screenshot |
|---|----------|----------|-------------|-------------------|------------|
| | | | | | |
| | | | | | |
| | | | | | |

---

## Notes

- **Plex tests (section 11)** require a running Plex server. Skip if not configured, mark as N/A.
- **Paperless tests (14.13-14.14)** require Paperless-NGX running. Skip if not configured, mark as N/A.
- **Radarr/Sonarr** (Arr integration) is not listed as a separate section since it surfaces as status badges within Media detail pages — check for Arr status badges on movie/show detail pages if Radarr/Sonarr are configured.
- **TMDB/TheTVDB** search and discover tests require network access and valid API keys in `.env`.
- Reset test data between major sections with `mise db:seed` if mutations contaminate the dataset.
