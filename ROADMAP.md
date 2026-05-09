# ACoffee — Roadmap

> Repositioning the product from "midpoint finder" to **AI Coffee
> Meetup Agent**. The midpoint geometry is one week away from being
> replicated by Google Maps; defensibility comes from making the
> *decision* easier, not from owning the math.
>
> Tagline direction: _"No more 'where should we meet?'"_ /
> _"AI 自动帮你们找最公平的咖啡店"_

---

## Sprint A — AI Agent core (1 week)

The shape of the product changes from "filter panel over a map" to
"agent that decides for you, with a one-tap escape hatch to override."

### A1. Time-based fairness sort

Replace distance-based fairness with real travel-time fairness. The
math is the same (std-dev minimisation across N parties) but the unit
goes from kilometres to minutes.

- [ ] Add Google Routes API client in `functions/_lib/googleMaps.ts`
      (or a new `routes.ts`). Use `computeRouteMatrix` for batched
      ETAs — 5 candidates × N parties in one round-trip.
- [ ] Default mode = `TRANSIT` for urban searches, fall back to `WALK`
      when transit returns no route. Optionally add a per-party
      override later.
- [ ] Cache: stash `(originPoint, destPoint, mode)` → ETA in CF KV
      with a 1-hour TTL. Same A↔café pair searched again within an
      hour pays nothing.
- [ ] Frontend: `CoffeeShopCard` distance row swaps from
      `formatDistance` to `formatDuration` when ETAs are available;
      falls back to distance if Routes API fails or quota is hit.
- [ ] Cost guardrail: if the user's monthly Routes budget crosses a
      threshold, downgrade to distance-based fairness silently.

### A2. Fairness Score

Surfaced per result card. Computed as `100 - normalised_std_dev`,
capped to a 0–100 range that's intuitive to read.

- [ ] Compute server-side from the Routes ETA matrix.
- [ ] Card UI: small badge "Fairness 92" beside the time row.
- [ ] One-line explanation under the card: _"This isn't the geographic
      midpoint, but it's the most fair for everyone."_ (only shown
      when geographic midpoint and fairness pick differ).

### A3. Mode selector

Six chips on the home hero. Each is a preset of (sort + filter +
optional Places-API tweaks). Replaces the current filter panel for
casual users; the panel stays as "advanced" for power users.

- [ ] 🤝 **Fair** — time-fairness sort (default)
- [ ] ⚡ **Fast** — minimise total travel time across all parties
- [ ] ✨ **Vibe** — `rating × log(reviews + 1)` sort
- [ ] 🌙 **Quiet** — `userRatingCount` reverse + keyword "quiet|library"
- [ ] 🕐 **Now** — `openNow=true` AND time-fair

### A4. Copy + microcopy

- [ ] Update `app.tagline` again — "AI 自动帮你们找最公平的咖啡店"
      / "AI finds the fairest spot for everyone".
- [ ] When fairness pick ≠ geographic midpoint, surface the difference
      ("12 minutes saved for B" / "B 节省了 12 分钟通勤").

---

## Sprint B — Lightweight proposal (1 week)

Booking flow today is full Calendly-for-coffee — email confirmation,
calendar invite, the works. Friends planning a casual coffee don't
need any of that. New surface: a token-signed short link that lets a
friend tweak the proposal with one tap.

### B1. Proposal model + storage

- [ ] New `proposals` D1 table: `id, organizer_user_id, scheduled_at,
      mode, addresses_json, candidate_place_id, fairness_score,
      created_at, expires_at` (24h TTL).
- [ ] Migration for the table.
- [ ] HMAC token-signed share link: `/p/<id>?t=<token>` (mirrors
      `cancelToken.ts` pattern).

### B2. Send-as-proposal flow

- [ ] On any search result card, "Send as proposal" button → POST
      `/api/proposals` with the search context, returns a share URL.
- [ ] `/p/<id>` page (no login required) shows: cafe + time + fairness
      + 6 quick-tweak buttons.

### B3. Quick-tweak buttons

Each button re-runs the search with a tweaked param + redirects to a
new proposal URL.

- [ ] "OK" → confirms, optionally promotes to a real booking.
- [ ] "换一家" / Change cafe → next-best in same mode
- [ ] "晚一点" / Later → +30 min
- [ ] "离我近一点" / Closer to me → re-fairness with +weight on this
      visitor's commute
- [ ] "更安静" / Quieter → switch to Quiet mode

### B4. Garbage collection

- [ ] Extend the existing GC cron (`/api/cron/gc`) to also delete
      proposals past `expires_at`.

---

## Sprint C — Marketing repositioning (~1 day)

After Sprint A ships, the product is fundamentally an agent. Update
the surfaces that signal that.

- [ ] Hero layout: mode chips become the primary CTA, A/B inputs sit
      below as "addresses to consider".
- [ ] Update `seo.description` / `seo.ogDescription` / schema
      description to emphasise "AI finds the fairest coffee spot" —
      keep the original midpoint-finder keywords for SEO continuity,
      append agent vocabulary.
- [ ] Add `coffee meetup AI / fairness score / where to meet AI /
      meetup decision tool` to keywords across en/ja/zh.
- [ ] Updatelog entry summarising the AI agent shift.

---

## Sprint D — Friend graph + check-in trigger (deferred)

> **Trigger:** ~100 active users, retained week-over-week. Until then
> the friend feed will be empty and demoralising.

- [ ] Friend / follow data model (mutual or one-way?)
- [ ] Friend feed surface — what your friends recently coffee-stamped
- [ ] "Meet for coffee?" CTA on a friend's check-in
- [ ] Push notifications when a friend pings you (Web Push on PWA)

---

## Sprint E — Cafe-owner profile (lightweight)

> Repositioning hint: ACoffee.com is wasted on "find a meetup spot"
> alone — the domain wants cafe-related identity too. But a full
> Linktree-for-cafes is a different product (商家工具). Keep the
> agent positioning intact by adding *just* enough so existing users
> can mark a cafe as theirs, and have it show up as reverse-link
> attribution from agent results. No directory, no discovery, no
> recommendation algorithm — those are gated on real demand.

### E1. Owner-cafe field on profile

- [ ] `user.ownerCafePlaceId` (Google Place ID) + display fields
      cached server-side from the Places API on save.
- [ ] Account page: a Places autocomplete picker — same control as
      LocationInput, restricted to cafes/coffee_shops/restaurants.
- [ ] PublicProfilePage: render the owned/featured cafe card above the
      passport (name, address, opening hours pulled from cached data).

### E2. Biolink toggle + privacy

- [ ] `user.showSocialLinks: boolean` (default true so existing users
      aren't broken). Account page toggle.
- [ ] Same shape as `profilePublic` — single boolean, no per-link
      granularity in v1.

### E3. Reverse-link from agent results

- [ ] On search results, when a cafe's `placeId` matches a public
      profile's `ownerCafePlaceId`, the card gets a small
      `↗ shared by @username` chip linking to that profile.
- [ ] Server-side: `/api/places/owner-attributions` takes a list of
      placeIds, returns the matching usernames in one round-trip.
      KV-cache the lookup with a short TTL.

### E4. Onboard nudge for new users

- [ ] Inside Account → Profile content, add a "Featured cafe" line
      below bio with a one-line pitch: "Run a cafe? Add it here so it
      shows up on your share-card and on its results page."

---

## Sprint F — Home-page feature visibility

> The hero's job is convert-to-search, not market every feature.
> Don't redesign the hero. But several existing features (passport,
> public profile, multi-party, sign-in benefits) are under-surfaced
> for first-time visitors. Each item below is a *small* addition,
> not a redesign.

### F1. "Get your own coffee page" footer CTA

- [ ] One-line strip below `SiteBottomNav` (or in the footer) on the
      home page only, anonymous-only: _"☕ Get your own acoffee page —
      `acoffee.com/yourname`"_. Click → AuthModal → after sign-in,
      lands on Account → username field pre-focused.
- [ ] Hides for signed-in users.

### F2. Mode chips: clearer what each does

- [ ] Hover/tap tooltips already exist (i18n `agentMode.*.hint`); audit
      that they're actually showing on mobile (tap-to-reveal).
- [ ] Optional: collapse "Vibe / Quiet / Now" behind a `more ▾` toggle
      and keep `Fair / Fast` always visible — A/B test this; first-paint
      clutter vs feature discovery is a real tradeoff.

### F3. Multi-party affordance

- [ ] Subtle hint when 2 addresses are set: `+ add a 3rd person` line
      under inputs (currently a button without context). Once tapped,
      keep that input visible across searches.

### F4. Sign-in benefits card

- [ ] Anonymous-only card under the hero (or as the empty-state of the
      Saved menu): _"Sign in to save your café passport, get a public
      profile at acoffee.com/yourname, and sync across devices."_
- [ ] One sentence per benefit, not a wall of bullets.

### F5. Post-first-search micro-onboard

- [ ] First time a user sees a result card with no visited shops in
      passport: a one-shot tooltip pointing at the ☕ visit button —
      _"Tap to log this café — your passport is public if you want it
      to be."_ Dismisses on first interaction, never re-shows.

---

## Sprint G — Cafe-owner directory (deferred)

> **Trigger:** ~100 cafe-owner profiles created (E1 above), or
> someone explicitly asking for "browse cafes." Until then, building
> directory UI for an empty list is wasted effort.

- [ ] `/cafes` page: grid of public profiles with `ownerCafePlaceId`,
      sorted by visit count or most-recent-update.
- [ ] Home-page hint: a single line _"Browse cafes →"_ — not a
      featured-cafes carousel, not a recommendation algorithm.
- [ ] `/cafes/<placeId>` aggregated page if multiple profiles share
      the same cafe (e.g., manager + barista both featuring it).

---

## Sprint H — Competitive research findings (CafeMeet + Cafe-Finder)

> Researched 2026-05 against two adjacent projects on disk:
> `/Users/tomi/Documents/Program/CafeMeet` (Python + FastAPI + Amap
> + LLM agent loop, single-user search-only — no auth/booking/profile)
> and `/Users/tomi/Documents/Program/Cafe-Finder` (Next.js + OpenAI
> + Mongo, mood-driven cafe browser — also no booking).
>
> Neither overlaps with our **booking** surface. The overlap is the
> anonymous AI search at `/` and result rendering. Cross-cutting
> signal across both: **our agent decision is invisible** — users
> see results but don't know why those results. Items below ranked
> by leverage, not by source.

### H1. AI reasoning strip above results (HIGH leverage, ~30min)

> Both projects do this. CafeMeet renders a 5-step animated timeline;
> Cafe-Finder returns a free-text reasoning blurb and shows it as
> `✦ {reasoning}` above results. Two independent comparisons flagged
> the same gap — strong signal.

- [ ] Server-side: include a 1-line `reasoning` string in the search
      results payload, derived deterministically from the active
      agent mode + party count + slot. Example: _"Balanced across 3
      locations · ranked by rating × log(reviews)"_
- [ ] Frontend: `CoffeeShopList` shows the strip above the result
      cards. Hidden when no reasoning available.
- [ ] No LLM call needed for v1 — generate from mode preset
      vocabulary. Upgrade to LLM-generated when H6 ships.

### H2. Per-person distance / ETA breakdown on result card

> CafeMeet ships per-participant distance lines under the meeting
> point ("A 1.2km · B 1.5km · C 1.4km"). Lets users **verify** the
> fairness claim instead of trusting it. Cheap given Sprint A1
> already computes the matrix.

- [ ] When ETAs are available (Sprint A1), show per-party lines
      under the fairness badge: _"A 14 min · B 18 min · C 17 min"_.
- [ ] Truncate to compact labels (party initials or short address)
      so it fits the card width.

### H3. "Open in Google Maps directions" button

> Both projects do this. We have the cafe placeId already; the URL
> is one templated string. Closes the "AI picked the cafe but how do
> I get there" gap on result cards AND on confirmation pages /
> emails.

- [ ] `CoffeeShopCard`: small directions button →
      `https://www.google.com/maps/dir/?api=1&destination=<placeId>`.
- [ ] `BookingsPage` confirmed-row: same button.
- [ ] Visitor confirmation email already includes "Open in Maps"
      via `googleMapsUri`; consider also a direct directions URL.

### H4. Mood-tile UI for agent modes (HIGH leverage UX, ~2h)

> Cafe-Finder's `MoodSelector.tsx:45-115` uses 7 colored, animated
> tiles (emoji + gradient + searchHint). We use 6 plain chips. Same
> data shape — just a much better surface. Modes feel like product
> features instead of developer controls.

- [ ] Per-mode metadata object: `{ label, emoji, color, gradient,
      hint, searchPreset }` — single source of truth.
- [ ] Animated tile grid replacing `AgentModeChips` on the home
      hero. Keep compact chip variant for the result-page sidebar
      (dense layout).
- [ ] A11y: preserve `role="radiogroup"` / `role="radio"` semantics
      from the chips; tile is purely visual upgrade.
- [ ] Pair with auto-pick badge from the existing
      `agentModeIsAuto` state — auto-picked tile gets a subtle ✨
      corner mark.

### H5. Empty-state quick prompts on home search

> Cafe-Finder shows 6 example queries when search input is focused
> but empty (`SearchBar.tsx:168-188`). Teaches users what AI can
> handle. Anonymous-only — for visitors who don't know what to type.

- [ ] When the home-page free-text input (or the address input on
      the meetup search) is focused with empty value, show 5 emoji
      + label chips below: _"📚 Quiet to work"_ / _"🌃 Date night"_
      / _"⚡ Open now"_ / _"🤝 Halfway with a friend"_ /
      _"☕ My usual cafes"_.
- [ ] Click → fills input + dispatches search. Hidden when input
      has any value.

### H6. Two-stage parse → filter → rerank pipeline for Vibe mode

> Cafe-Finder's `app/api/ai/recommend/route.ts:18-47` does:
> (1) gpt-4o-mini parses free-text query → JSON `{mood, keywords,
> features}`, (2) keywords drive Places `keyword=` filter, (3) LLM
> reranks top 20. Our Vibe mode is a hardcoded preset; this is a
> meaningful upgrade.

- [ ] New `/api/agent/parse-intent` endpoint: free-text → structured
      `{mood, keywords, features, reasoning}`.
- [ ] Plug into Vibe mode: keywords narrow Places search, LLM only
      sees top 20, `reasoning` feeds the H1 strip.
- [ ] Deterministic preset fallback when LLM unavailable / quota.
- [ ] Cost: gpt-4o-mini-class call per Vibe search; budget alarm.

### H7. Polyline on result map

> CafeMeet draws connecting lines from each participant to the
> meeting point on its result page. Visual proof of fairness, almost
> free since we already render the map.

- [ ] In `Map.tsx`, when results are showing, draw a `Polyline` from
      each search origin to the highlighted (or top-fairness) cafe.
      Subtle dashed stroke, theme-color tinted.
- [ ] Hide on single-party "Near me" mode.

### H8. Geocode + Places-nearby cache

> Both projects cache. We already cache photos in R2; same idea on
> geocode + nearby responses cuts repeat-search cost without changing
> behaviour.

- [x] Workers KV-backed cache: 3-decimal-rounded center for nearby
      (`near:lat,lng:radius:limit`, 5-min TTL), normalized address
      for geocode (`geo:<addr>`, 24h TTL).
- [x] Wired into the server-side `geocodeAddress` and
      `searchNearbyCafes` in `functions/_lib/googleMaps.ts`. Reuses
      the existing `ROUTES_CACHE` KV binding.

### H9. flyTo map animation on card hover / select

> Cafe-Finder's `MapView.tsx:71-79` smoothly animates instead of
> jumping. Pairs with our list↔map hover sync.

- [ ] Replace abrupt `setCenter` with `panTo` (smoother) when
      switching highlighted cafe. Optional `setZoom` step on select.

### H10. Highlights / concerns review summary (deferred)

> Cafe-Finder's `CafeReviews.tsx:42-87` shows structured "Guests
> love..." / "Some note..." columns instead of free-text summary.
> Only ladder this if reviews ever land on PublicProfilePage
> featured cafes — don't build the surface for its own sake.

- [ ] **Trigger:** Pro tier has paying users asking for review
      surfacing on featured cafes.
- [ ] When triggered: structure as two columns, not free-text;
      keep summary length tight (3-5 bullets each side).

### H11. Anti-patterns to AVOID (confirmed independently by both)

- ❌ **"AI Concierge" chatbot** — Both projects ship one (CafeMeet's
      4-canned-Q&A theatre at `cafe_finder.html:597-798`,
      Cafe-Finder's CafeBot). Generic LLM chat without action
      doesn't book, doesn't propose, just talks. Two-source signal
      that this is a distraction; we resisted, keep resisting.
- ❌ **"Spin the Wheel" / fate-decider gimmick** — Cafe-Finder ships
      one (`SpinWheel.tsx`). Our agent modes already pick; don't
      add an entropy-source decoration.
- ❌ **Non-Cloudflare DB (MongoDB / Mongoose)** — Cafe-Finder runs
      on Mongo. Confirms our single-platform D1 + Drizzle is the
      right call.
- ❌ **Fake hardcoded stats** ("12,000+ Cafes / 80+ Cities / 500K+
      Visitors" in Cafe-Finder's `Hero.tsx:8-12`). Embarrassing if
      real users land there.
- ❌ **Inferring amenities from venue name substrings** (Cafe-Finder
      tags wifi from "co-work" in name). Noisy + frequently wrong.
- ❌ **localStorage-persisted Places results** — Cafe-Finder caches
      `cafes` + `filters` in localStorage; serves stale data
      across sessions. Our server-truth model is correct.
- ❌ **HTML-as-output to disk per query** (CafeMeet writes a fresh
      HTML file per search). Stateless, uncacheable, unindexable.

### Top 3 to do first

> Already in priority order, but explicitly:
> 1. **H1** — agent reasoning strip (single highest-leverage win;
>    closes a gap two independent comparisons flagged)
> 2. **H4** — mood-tile UI for agent modes (UX upgrade that makes
>    modes feel like product features)
> 3. **H3** — "Open in Maps directions" button (small but real gap
>    on the conversion path from result → actual coffee)

---

## Hard "not now"

- ❌ **Stranger coffee match.** Cold-start social + safety = a
  different product. Only revisit once the friend graph from Sprint D
  has enough density to bootstrap friend-of-friend intros, and only
  with explicit verification + safety mechanisms in place.
- ❌ **Cafe-owner directory + recommendation algorithm on home.** Wait
  for ≥100 cafe-owner profiles (Sprint E delivers the supply side).
  Building a "Featured cafes" carousel against an empty database
  produces a sad UI and doesn't validate the demand.
- ❌ **Full Linktree-for-cafes (menu / photos / specials / coupons /
  moderation).** Different product, different user (商家工具 vs
  consumer agent). Revisit only when Pro tier has paying users
  asking for it.

---

## Notes for future me

- **Costs:** Sprint A pays Google Routes API per search. Top 5
  candidates × 3 parties = 15 elements ≈ $0.075/search at 2026
  pricing. Acceptable at current scale; budget alarm at ~$100/month
  monthly Maps spend.
- **Pro tier (premium usernames) is orthogonal.** AI agent = what we
  do, premium usernames = who pays. They don't conflict.
- **Old SEO traffic.** Repositioning may dip "midpoint between two
  addresses" rankings. Mitigate by keeping legacy keywords in
  `seo.keywords` (additive, not replacement).
