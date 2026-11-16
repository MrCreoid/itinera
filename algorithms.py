import heapq

OPEN = "10:00"
CLOSE = "18:00"

LOCATIONS = ["Entrance Hall", "Central Atrium", "Egyptian Gallery", "Greek & Roman Hall",
             "Renaissance Gallery", "Modern Art Wing", "Medieval Armory", "Sculpture Garden",
             "Natural History Hall", "Museum Café"]

# (room, room, walking minutes) for every doorway
PATHS = [
    ("Entrance Hall", "Central Atrium", 2),
    ("Entrance Hall", "Museum Café", 2),
    ("Entrance Hall", "Natural History Hall", 3),
    ("Central Atrium", "Greek & Roman Hall", 2),
    ("Central Atrium", "Renaissance Gallery", 2),
    ("Central Atrium", "Medieval Armory", 3),
    ("Central Atrium", "Sculpture Garden", 3),
    ("Egyptian Gallery", "Greek & Roman Hall", 2),
    ("Egyptian Gallery", "Medieval Armory", 2),
    ("Greek & Roman Hall", "Renaissance Gallery", 2),
    ("Renaissance Gallery", "Modern Art Wing", 2),
    ("Modern Art Wing", "Sculpture Garden", 2),
    ("Sculpture Garden", "Natural History Hall", 3),
    ("Medieval Armory", "Museum Café", 3),
]

CATEGORIES = ["Ancient History", "Fine Art", "Modern Art", "Natural Science", "Hands-on", "Food & Shop"]

# (name, category, room, duration in minutes, fixed start or None, preference score)
DATA = [
    ("Mummies and Tombs Tour", "Ancient History", "Egyptian Gallery", 45, "10:30", 9),
    ("Roman Coins Talk", "Ancient History", "Greek & Roman Hall", 30, "12:00", 6),
    ("Knights and Armour Demo", "Ancient History", "Medieval Armory", 40, "11:30", 8),
    ("Renaissance Masters Tour", "Fine Art", "Renaissance Gallery", 60, "13:00", 9),
    ("Modern Art Curator Talk", "Modern Art", "Modern Art Wing", 45, "15:00", 8),
    ("Evening Highlights Tour", "Fine Art", "Central Atrium", 60, "16:30", 7),
    ("Dinosaur Fossil Show", "Natural Science", "Natural History Hall", 40, "11:00", 8),
    ("Planet Earth Film", "Natural Science", "Central Atrium", 30, "14:30", 6),
    ("Live Sketching Class", "Hands-on", "Sculpture Garden", 60, "14:00", 7),
    ("Clay Pottery Workshop", "Hands-on", "Greek & Roman Hall", 45, "16:00", 6),
    ("Egyptian Gallery Visit", "Ancient History", "Egyptian Gallery", 40, None, 7),
    ("Greek and Roman Sculptures", "Ancient History", "Greek & Roman Hall", 35, None, 6),
    ("Armour Collection Walk", "Ancient History", "Medieval Armory", 25, None, 5),
    ("Renaissance Paintings", "Fine Art", "Renaissance Gallery", 45, None, 8),
    ("Sculpture Garden Stroll", "Fine Art", "Sculpture Garden", 25, None, 4),
    ("Modern Art Collection", "Modern Art", "Modern Art Wing", 40, None, 7),
    ("Light Installation", "Modern Art", "Modern Art Wing", 20, None, 5),
    ("Dinosaur Skeletons", "Natural Science", "Natural History Hall", 35, None, 8),
    ("Gem and Mineral Room", "Natural Science", "Natural History Hall", 20, None, 4),
    ("Lunch at the Café", "Food & Shop", "Museum Café", 40, None, 5),
    ("Coffee Break", "Food & Shop", "Museum Café", 15, None, 2),
    ("Museum Shop", "Food & Shop", "Entrance Hall", 20, None, 3),
]


def to_min(text):
    parts = str(text).split(":")
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        raise ValueError("Time must be in HH:MM format.")
    h, m = int(parts[0]), int(parts[1])
    if h > 23 or m > 59:
        raise ValueError("Time must be between 00:00 and 23:59.")
    return h * 60 + m


OPEN_MIN = to_min(OPEN)
CLOSE_MIN = to_min(CLOSE)

ACTIVITIES = []
for i, (name, cat, loc, dur, start, score) in enumerate(DATA, 1):
    begin = to_min(start) if start else None
    ACTIVITIES.append({
        "id": i, "name": name, "category": cat, "location": loc,
        "duration": dur, "score": score,
        "start": begin, "end": begin + dur if start else None,
    })

# activities a visitor can pin to a time of their choice as a meal break
BREAKS = [a["id"] for a in ACTIVITIES if a["location"] == "Museum Café"]
SHOP = next(a["id"] for a in ACTIVITIES if a["name"] == "Museum Shop")

GRAPH = {loc: [] for loc in LOCATIONS}
for a, b, w in PATHS:
    GRAPH[a].append((b, w))
    GRAPH[b].append((a, w))


# ---------- Dijkstra ----------

def dijkstra(source):
    dist = {loc: float("inf") for loc in LOCATIONS}
    prev = {loc: None for loc in LOCATIONS}
    dist[source] = 0
    heap = [(0, source)]
    while heap:
        d, loc = heapq.heappop(heap)
        if d > dist[loc]:
            continue  # stale heap entry, a shorter distance was already found
        for nxt, w in GRAPH[loc]:
            if d + w < dist[nxt]:
                dist[nxt] = d + w
                prev[nxt] = loc
                heapq.heappush(heap, (dist[nxt], nxt))
    return dist, prev


def shortest_route(a, b):
    dist, prev = dijkstra(a)
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    path.reverse()
    return dist[b], path


ROUTES = {}
for a in LOCATIONS:
    for b in LOCATIONS:
        ROUTES[(a, b)] = shortest_route(a, b)


# ---------- Greedy ----------

def greedy_order(acts, by_ratio):
    # sorted() is stable, so ties keep dataset order and results stay deterministic
    if by_ratio:
        return sorted(acts, key=lambda a: a["value"] / a["duration"], reverse=True)
    return sorted(acts, key=lambda a: a["value"], reverse=True)


# ---------- Dynamic programming (0/1 knapsack) ----------

def knapsack(acts, capacity, trace=None):
    n = len(acts)
    # dp[i][c] = best score using the first i activities within c minutes
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        w = acts[i - 1]["duration"]
        v = acts[i - 1]["value"]
        for c in range(capacity + 1):
            dp[i][c] = dp[i - 1][c]
            if w <= c and dp[i - 1][c - w] + v > dp[i][c]:
                dp[i][c] = dp[i - 1][c - w] + v

    picked, path = [], []
    c = capacity
    for i in range(n, 0, -1):
        take = dp[i][c] != dp[i - 1][c]
        path.append({"i": i, "c": c, "take": take})
        if take:
            picked.append(acts[i - 1])
            c -= acts[i - 1]["duration"]
    picked.reverse()
    if trace is not None:
        trace.update({"capacity": capacity, "items": [a["id"] for a in acts], "table": dp, "path": path})
    return dp[n][capacity], picked


# ---------- Weighted interval scheduling ----------

def last_compatible(ends, start, j):
    # binary search in ends[0..j-1] for the last activity finishing by `start`
    lo, hi = 0, j - 1
    ans = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if ends[mid] <= start:
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ans


def weighted_interval(acts):
    acts = sorted(acts, key=lambda a: a["end"])
    ends = [a["end"] for a in acts]
    n = len(acts)
    p = [last_compatible(ends, acts[j]["start"], j) for j in range(n)]

    # best[j] = best score using the first j activities (by finish time)
    best = [0] * (n + 1)
    for j in range(n):
        best[j + 1] = max(best[j], acts[j]["value"] + best[p[j] + 1])

    picked = []
    j = n - 1
    while j >= 0:
        if best[j + 1] != best[j]:
            picked.append(acts[j])
            j = p[j]
        else:
            j -= 1
    picked.reverse()
    return best[n], picked


# ---------- Building a feasible itinerary ----------

def simulate(order, start_loc, start_time):
    """Walk through `order` from the start; returns (finish, steps) or None if a fixed slot is missed."""
    time, loc = start_time, start_loc
    steps = []
    for act in order:
        travel, route = ROUTES[(loc, act["location"])]
        begin = time + travel
        if act["start"] is not None:
            if begin > act["start"]:
                return None
            begin = act["start"]
        steps.append({
            "id": act["id"], "name": act["name"], "category": act["category"],
            "location": act["location"], "duration": act["duration"], "value": act["value"],
            "start": begin, "end": begin + act["duration"], "fixed": act["start"] is not None,
            "travel": travel, "route": route,
        })
        time = begin + act["duration"]
        loc = act["location"]
    return time, steps


def build_itinerary(acts, start_loc, start_time, limit, order=()):
    # Insert activities one by one (into `order`, if given) at the position with the least
    # total walking (then earliest finish); skip any activity that cannot be placed validly.
    order, missed = list(order), []
    for act in acts:
        best = None
        for pos in range(len(order) + 1):
            trial = order[:pos] + [act] + order[pos:]
            result = simulate(trial, start_loc, start_time)
            # the visitor must also be able to walk back to the door they came in by
            if result is None or result[0] + ROUTES[(act["location"] if pos == len(order) else order[-1]["location"], start_loc)][0] > limit:
                continue
            cost = (sum(s["travel"] for s in result[1]), result[0])
            if best is None or cost < best[0]:
                best = (cost, trial)
        if best:
            order = best[1]
        else:
            missed.append(act)
    return order, missed


def summarize(order, start_loc, start_time, minutes):
    finish, steps = simulate(order, start_loc, start_time)
    activity = sum(s["duration"] for s in steps)
    travel = sum(s["travel"] for s in steps)
    used = finish - start_time
    return {
        "items": steps,
        "totals": {
            "score": sum(s["value"] for s in steps), "activity": activity, "travel": travel,
            "wait": used - activity - travel, "used": used, "budget": minutes,
            "exit": ROUTES[(order[-1]["location"], start_loc)][0] if order else 0,  # walk back to the door
            "exit_route": ROUTES[(order[-1]["location"], start_loc)][1] if order else [],
        },
    }


# ---------- Planners ----------

def plan_greedy(cands, by_ratio, start_loc, start_time, minutes, must):
    # `must` (the café break, if any) goes in first, so it is always placed
    order, missed = build_itinerary(must + greedy_order(cands, by_ratio), start_loc, start_time, start_time + minutes)
    plan = summarize(order, start_loc, start_time, minutes)
    plan["left_out"] = [{"name": a["name"], "reason": "Did not fit (time limit, clash or walking time)"}
                        for a in missed]
    return plan


def plan_hybrid(cands, start_loc, start_time, minutes, must):
    # 1. DP picks the best set by duration alone (ignores walking and clashes);
    #    the café break's minutes are taken out of the budget first
    dp_trace = {}
    dp_picked = knapsack(cands, minutes - sum(a["duration"] for a in must), dp_trace)[1]
    # 2. WIS keeps the best non-overlapping subset of the fixed-time picks
    fixed = [a for a in dp_picked if a["start"] is not None]
    wis_picked = weighted_interval(fixed)[1]
    picks = greedy_order(wis_picked + [a for a in dp_picked if a["start"] is None], False)
    # 3. place picks with real walking times, then 4. fill leftover time greedily
    rest = greedy_order([a for a in cands if a not in picks], False)
    order, missed = build_itinerary(must + picks + rest, start_loc, start_time, start_time + minutes)
    plan = summarize(order, start_loc, start_time, minutes)
    plan["dp"] = dp_trace  # the full table and backtrack path, drawn as the knapsack landscape

    plan["left_out"] = []
    for a in missed:
        if a in picks:
            reason = "Selected, but no room once walking time was added"
        elif a in fixed:
            reason = "Clashes with a higher-value fixed event (WIS)"
        else:
            reason = "Not in the DP set and no gap left to fit it"
        plan["left_out"].append({"name": a["name"], "reason": reason})

    plan["dropped"] = [a["name"] for a in missed if a in picks]
    return plan


def as_acts(plan):
    return [dict(s, start=s["start"] if s["fixed"] else None) for s in plan["items"]]


def shop_reserve(start_loc):
    # minutes kept aside for the shop at the end: its visit plus the walk there and back to the door
    # (by the triangle inequality this always covers going last stop -> shop -> door)
    shop = ACTIVITIES[SHOP - 1]
    return shop["duration"] + ROUTES[(start_loc, shop["location"])][0] + ROUTES[(shop["location"], start_loc)][0]


def fill_free_time(plan, extra, start_loc, start_time, minutes):
    # Interests come first: keep the plan as it is and only add activities from the
    # visitor's other interests into the time that is still free. None if none fit.
    base = as_acts(plan)
    order, _ = build_itinerary(greedy_order(extra, False), start_loc, start_time, start_time + minutes, base)
    if len(order) == len(base):
        return None
    filled = summarize(order, start_loc, start_time, minutes)
    ids = {a["id"] for a in base}
    filled["added"] = [a["id"] for a in order if a["id"] not in ids]
    filled["left_out"] = plan["left_out"]
    if "dp" in plan:
        filled["dp"], filled["dropped"] = plan["dp"], plan["dropped"]
    return filled


def make_plans(start_loc, start_time, full_minutes, priority, categories, pause=None, shop_last=False):
    # pause = (activity id, minute of day): a café break the visitor asked for at that time.
    # It becomes a fixed event that every plan must contain.
    # shop_last: end the visit at the Museum Shop. Its time (and the walk there and back) is kept
    # aside, the plans are built in what is left, and the shop is added as the last stop.
    minutes = full_minutes - (shop_reserve(start_loc) if shop_last else 0)
    limit = start_time + minutes
    must = []
    if pause:
        act = ACTIVITIES[pause[0] - 1]
        must = [dict(act, value=act["score"] * (priority.get(act["id"], 2) or 2),
                     start=pause[1], end=pause[1] + act["duration"])]
    cands, outside, extra = [], [], []  # extra: fits the visit but not the chosen interests
    for act in ACTIVITIES:
        weight = priority.get(act["id"], 2)
        if must and act["id"] in BREAKS:
            continue  # the pinned break replaces the café's other entries: no coffee right before lunch
        if weight == 0 or (shop_last and act["id"] == SHOP):
            continue
        act = dict(act, value=act["score"] * weight)
        if act["category"] not in categories:
            if act["start"] is None or (not (must and act["start"] < must[0]["end"] and act["end"] > must[0]["start"])
                                        and start_time <= act["start"] and act["end"] <= limit
                                        and start_time + ROUTES[(start_loc, act["location"])][0] <= act["start"]):
                extra.append(act)
        elif act["start"] is None:
            cands.append(act)
        elif must and act["start"] < must[0]["end"] and act["end"] > must[0]["start"]:
            outside.append({"name": act["name"], "reason": "Clashes with your café break"})
        elif act["start"] < start_time or act["end"] > limit:
            outside.append({"name": act["name"], "reason": "Happens outside your time window"})
        elif start_time + ROUTES[(start_loc, act["location"])][0] > act["start"]:
            outside.append({"name": act["name"], "reason": "Starts before you can walk there"})
        else:
            cands.append(act)

    plans = {
        "greedy_score": plan_greedy(cands, False, start_loc, start_time, minutes, must),
        "greedy_ratio": plan_greedy(cands, True, start_loc, start_time, minutes, must),
        "hybrid": plan_hybrid(cands, start_loc, start_time, minutes, must),
    }
    for plan in plans.values():
        plan["left_out"] = outside + plan["left_out"]
        plan["fill"] = fill_free_time(plan, extra, start_loc, start_time, minutes)
        if shop_last:
            shop = ACTIVITIES[SHOP - 1]
            last = dict(shop, value=shop["score"] * (priority.get(SHOP, 2) or 2))
            for p in (plan, plan["fill"]):
                if p:
                    p.update(summarize(as_acts(p) + [last], start_loc, start_time, full_minutes))
    candidates = [{"id": a["id"], "name": a["name"], "location": a["location"], "duration": a["duration"],
                   "value": a["value"], "start": a["start"], "end": a["end"]} for a in cands]
    return {"start_time": start_time, "candidates": candidates, "plans": plans}
