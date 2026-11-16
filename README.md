# Itinera · Museum Visit Planner

**Live site:** https://mrcreoid.github.io/itinera/

A 2nd-year ADA (Analysis and Design of Algorithms) project. Itinera plans a museum visit
around the time you have: pick when you arrive, how long you can stay, what you like and an
optional café break, and it builds three itineraries with Greedy, 0/1 Knapsack DP, Weighted
Interval Scheduling and Dijkstra, then replays every decision it made as an animation.

The museum has 10 rooms, 14 corridors and 22 activities (10 timed tours, 12 anytime visits),
and is open 10:00–18:00.

## What it does

- **Plan your visit** – arrival time, length of visit (slider, capped at closing time), one or
  more interests, and a per-activity priority (Skip / Low / Normal / High) that scales the
  activity's score (×0 / ×1 / ×2 / ×3).
- **Café break** – pin Lunch or a Coffee Break to a half-hour slot. The break becomes a fixed
  event in every plan, times that cannot fit are never offered, and timed tours that clash
  with it are listed under "Not included" with the reason.
- **Three planning styles**, all shown in a comparison table:
  - *Favourites first* – greedy by score.
  - *See as much as possible* – greedy by score per minute.
  - *Best overall plan* – 0/1 knapsack DP → weighted interval scheduling → greedy fill.
- **Itinerary** – timeline with walking legs (Dijkstra routes), waiting time, timed stops,
  the walk back to the entrance, a room-by-room route and the list of what was left out and why.
- **Your day, walked** – an animated visitor follows the chosen plan through the corridors,
  with pause and replay.
- **The knapsack landscape** – the real DP table drawn as a 3D terrain: rows rise one activity
  at a time, then a light walks the backtrack deciding take or skip. Drag to orbit.
- **Interactive map** – click rooms on the hero map to run Dijkstra from your last stop.
- **Algorithms section** – a worked mini-example of each algorithm with its time and space
  complexity, and a route finder between any two rooms.

## Run it

The site is static and runs entirely in the browser (`algorithms.js`). Open the live link
above, or open `index.html` from any static server.

The Python version is the reference implementation and needs only Python 3:

```
python3 server.py
```

Then open http://localhost:8000.

Run the tests (15 tests: algorithms, itinerary validity, café break, API and input validation):

```
python3 -m unittest -v test_algorithms
```

## Files

| File | Purpose |
|------|---------|
| `algorithms.py` | Museum dataset, opening hours and all algorithms (reference implementation) |
| `algorithms.js` | The same algorithms and request validation in JavaScript, so the site works on GitHub Pages. Verified to give identical output to the Python version |
| `server.py` | Serves the website and the JSON API with `http.server`; validates every request |
| `index.html` | Page structure |
| `style.css` | Styling |
| `script.js` | Form handling, rendering, the three canvas scenes (map, walk, knapsack landscape) |
| `test_algorithms.py` | `unittest` tests for the algorithms and the API |
| `071_CSEA_Synposis.pdf` | Project synopsis |
| `Itinera-explained.pdf` | Walkthrough of the project |

## How a plan is built

1. **Filter** – activities outside the chosen interests or marked *Skip* are dropped. Timed
   tours that fall outside the visit, start before you could walk there, or clash with the
   café break are set aside with a reason. Each remaining activity gets
   `value = score × priority`.
2. **Choose** –
   - *Greedy*: sort by value (or value per minute) and insert activities one by one.
   - *Best overall*: 0/1 knapsack DP picks the best set for the time budget (minus the break),
     weighted interval scheduling keeps the best non-overlapping subset of the timed picks,
     and leftover time is filled greedily.
3. **Place** – every plan goes through the same `build_itinerary` / `simulate` check. Each
   activity is inserted at the position with the least total walking (then earliest finish).
   Walking times come from Dijkstra over the room graph, fixed start times are respected,
   and the plan must leave enough time to walk back to the entrance before the budget runs out.
   Anything that cannot be placed is reported as left out.

### Algorithms and complexity

| Algorithm | Used for | Time | Space |
|-----------|----------|------|-------|
| Greedy (stable sort) | Favourites first, See as much as possible | O(n log n) sort, O(n³) with fit checks | O(n) |
| 0/1 Knapsack DP | Best overall plan: choosing the set | O(n · T) | O(n · T) |
| Weighted Interval Scheduling | Best overall plan: removing clashes between timed picks | O(n log n) | O(n) |
| Sorting + binary search | WIS: last compatible tour (`p(j)`) | O(n log n), O(log n) per query | O(1) extra |
| Dijkstra | Every walking leg, the map and the route finder | O((V + E) log V) | O(V + E) |

## API

The Python server exposes three endpoints. In the browser build, `api()` in `algorithms.js`
answers the same three calls locally with the same JSON shapes and error messages.

- `GET /api/data` – activities, rooms, categories, doorways, opening hours.
- `GET /api/route?from=A&to=B` – Dijkstra route and minutes.
- `POST /api/plan` – body `{hours, start_time, start_location, categories, priority, break}`,
  returns `start_time`, the candidate activities and all three plans.
  `priority` maps activity id → 0–3. `break` is optional: `{id, time}` pins a café activity
  to that time. The *Best overall* plan also carries `dp`: the full knapsack table and its
  backtrack path, which the page draws as the 3D landscape.

Invalid input (bad time, visit past closing, unknown room or category, priority outside 0–3,
a break that does not fit) returns `400` with a message the page shows under the form.

## Limitations

- The full problem (choosing and ordering activities with walking times and fixed slots) is
  NP-hard, so no planner here is guaranteed optimal overall. DP and WIS are exact only for
  their sub-problems; the greedy plans can score higher once walking is added.
- Knapsack DP and WIS ignore walking time, so some of their picks are dropped at placement.
  The comparison table says how many.
- Data is in memory and fixed to one museum. Arrival must be within opening hours and the
  visit must end by closing time.

## Authors

Pratyush Garg & Priyansha Soni · CSE-A2
