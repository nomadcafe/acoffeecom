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
- [ ] 💸 **Cheap** — `priceLevel ≤ 2`
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
- [ ] "更便宜" / Cheaper → switch to Cheap mode

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

## Hard "not now"

- ❌ **Stranger coffee match.** Cold-start social + safety = a
  different product. Only revisit once the friend graph from Sprint D
  has enough density to bootstrap friend-of-friend intros, and only
  with explicit verification + safety mechanisms in place.

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
