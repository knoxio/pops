# US-01: Zone-based layout

> PRD: [066 — Arena Redesign](README.md)
> Status: Done

## Description

As a user, I want arena actions grouped into spatial zones so that I can instantly understand what each control does based on where it is on screen.

## Acceptance Criteria

- [x] Page renders at `/media/compare` with a 3-column grid: `1fr auto 1fr`
- [x] Left and right columns contain movie cards (poster + title)
- [x] Center column contains draw tier buttons, a separator, skip button, and N/A button
- [x] Poster image is the primary click target for picking a winner (`<button>` wrapping `<img>`)
- [x] Title below each poster is a clickable `<button>` that also picks the winner
- [x] Winner state: `ring-2 ring-green-500 shadow-lg scale-[1.02]`
- [x] Loser state: `ring-2 ring-red-500/50 opacity-75`
- [x] No visible border on cards in default state
- [x] Top-left of each poster: watchlist bookmark overlay (`backdrop-blur-sm`, dark glass style)
- [x] Top-right of each poster: score delta badge when active (`animate-bounce`, `tabular-nums`)
- [x] Bottom of each poster: gradient overlay with stale (Clock) and not-watched (EyeOff) icon buttons
- [x] Bottom overlay hidden by default, visible on `group-hover` and `group-focus-within`
- [x] Header: "Arena" title, session count badge (visible when > 0), history icon button, dimension manager
- [x] All center column buttons: `rounded-full h-10 w-10 variant="outline"`, disabled during pending/animation
- [x] Blacklist confirmation dialog shows comparison count and requires explicit confirm
- [x] Tests cover: pair rendering, winner picking, skip, stale, N/A, not-watched, watchlist, draw tiers, loading skeletons, empty states

## Notes

The `group` class goes on the poster container div so that `group-hover` and `group-focus-within` control the bottom overlay visibility. On touch devices without hover, `group-focus-within` activates when any button in the overlay receives focus.
