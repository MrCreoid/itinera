# Personalized Time-Constrained Experience Optimization System

ADA project that plans a museum visit (10 rooms, open 10:00–18:00) within a time limit, using
Greedy, 0/1 Knapsack DP, Weighted Interval Scheduling, Dijkstra, sorting and binary search.

## Run

Live site: https://mrcreoid.github.io/itinera/ (runs entirely in the browser via `algorithms.js`,
a port of `algorithms.py`). Or run the Python version locally; it needs only Python 3.

```
python3 server.py
```

Then open http://localhost:8000

Run the tests:

```
python3 -m unittest -v test_algorithms
```

## Files

| File | Purpose |
|------|---------|
| `algorithms.py` | Museum dataset, opening hours and all algorithms (reference implementation) |
| `algorithms.js` | Same algorithms and request checks in JavaScript, so the site works on GitHub Pages |
| `server.py` | Serves the website and the JSON API (`http.server`) |
| `index.html` | Page structure |
| `style.css` | Styling |
| `script.js` | Form handling, `fetch()` calls and rendering |
| `test_algorithms.py` | `unittest` tests for algorithms and API |

## API

- `GET /api/data` – activities, rooms, categories, doorways, opening hours
- `GET /api/route?from=A&to=B` – Dijkstra route and minutes
- `POST /api/plan` – body `{hours, start_time, start_location, categories, priority, break}`, returns all three plans.
  `break` is optional: `{id, time}` pins a café activity to that time, and every plan is built around it.
  The DP + WIS plan also carries `dp`: the full knapsack table and its backtrack path, which the page
  draws as a 3D landscape. The page animates the chosen plan's items and Dijkstra routes as a walk.

## How a plan is built

The planner shows these as plain choices: "Favourites first" and "See as much as possible"
are greedy, "Best overall plan" is DP + WIS.

- **Greedy**: sort by score (or score per minute), insert each activity if it still fits.
- **DP + WIS**: knapsack DP picks the best set for the time budget, WIS removes clashes
  between fixed-time picks, the plan is placed using Dijkstra walking times, and leftover
  time is filled greedily.

Every plan goes through the same check (`simulate` in `algorithms.py`): walking time is
added, fixed start times are respected, nothing repeats and the total stays within the budget.
A plan must also leave enough time to walk back to the entrance before the budget runs out.

## Limitations

- The full problem (choosing and ordering with walking and fixed slots) is NP-hard, so no
  planner here is guaranteed optimal overall. DP and WIS are optimal only for their sub-problems.
- Knapsack DP and WIS ignore walking time; their picks can be dropped later, and the UI shows which.
- Data is in memory and fixed to one museum. Arrival must be within opening hours and the
  visit must end by closing time; the server rejects anything else.
