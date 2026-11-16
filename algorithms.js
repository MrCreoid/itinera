// Browser port of algorithms.py + server.py's request validation, so the site runs on GitHub Pages
// without a Python server. algorithms.py stays the reference implementation (see test_algorithms.py).

const OPEN = "10:00";
const CLOSE = "18:00";

const LOCATIONS = ["Entrance Hall", "Central Atrium", "Egyptian Gallery", "Greek & Roman Hall",
  "Renaissance Gallery", "Modern Art Wing", "Medieval Armory", "Sculpture Garden",
  "Natural History Hall", "Museum Café"];

// [room, room, walking minutes] for every doorway
const PATHS = [
  ["Entrance Hall", "Central Atrium", 2],
  ["Entrance Hall", "Museum Café", 2],
  ["Entrance Hall", "Natural History Hall", 3],
  ["Central Atrium", "Greek & Roman Hall", 2],
  ["Central Atrium", "Renaissance Gallery", 2],
  ["Central Atrium", "Medieval Armory", 3],
  ["Central Atrium", "Sculpture Garden", 3],
  ["Egyptian Gallery", "Greek & Roman Hall", 2],
  ["Egyptian Gallery", "Medieval Armory", 2],
  ["Greek & Roman Hall", "Renaissance Gallery", 2],
  ["Renaissance Gallery", "Modern Art Wing", 2],
  ["Modern Art Wing", "Sculpture Garden", 2],
  ["Sculpture Garden", "Natural History Hall", 3],
  ["Medieval Armory", "Museum Café", 3],
];

const CATEGORIES = ["Ancient History", "Fine Art", "Modern Art", "Natural Science", "Hands-on", "Food & Shop"];

// [name, category, room, duration in minutes, fixed start or null, preference score]
const DATA = [
  ["Mummies and Tombs Tour", "Ancient History", "Egyptian Gallery", 45, "10:30", 9],
  ["Roman Coins Talk", "Ancient History", "Greek & Roman Hall", 30, "12:00", 6],
  ["Knights and Armour Demo", "Ancient History", "Medieval Armory", 40, "11:30", 8],
  ["Renaissance Masters Tour", "Fine Art", "Renaissance Gallery", 60, "13:00", 9],
  ["Modern Art Curator Talk", "Modern Art", "Modern Art Wing", 45, "15:00", 8],
  ["Evening Highlights Tour", "Fine Art", "Central Atrium", 60, "16:30", 7],
  ["Dinosaur Fossil Show", "Natural Science", "Natural History Hall", 40, "11:00", 8],
  ["Planet Earth Film", "Natural Science", "Central Atrium", 30, "14:30", 6],
  ["Live Sketching Class", "Hands-on", "Sculpture Garden", 60, "14:00", 7],
  ["Clay Pottery Workshop", "Hands-on", "Greek & Roman Hall", 45, "16:00", 6],
  ["Egyptian Gallery Visit", "Ancient History", "Egyptian Gallery", 40, null, 7],
  ["Greek and Roman Sculptures", "Ancient History", "Greek & Roman Hall", 35, null, 6],
  ["Armour Collection Walk", "Ancient History", "Medieval Armory", 25, null, 5],
  ["Renaissance Paintings", "Fine Art", "Renaissance Gallery", 45, null, 8],
  ["Sculpture Garden Stroll", "Fine Art", "Sculpture Garden", 25, null, 4],
  ["Modern Art Collection", "Modern Art", "Modern Art Wing", 40, null, 7],
  ["Light Installation", "Modern Art", "Modern Art Wing", 20, null, 5],
  ["Dinosaur Skeletons", "Natural Science", "Natural History Hall", 35, null, 8],
  ["Gem and Mineral Room", "Natural Science", "Natural History Hall", 20, null, 4],
  ["Lunch at the Café", "Food & Shop", "Museum Café", 40, null, 5],
  ["Coffee Break", "Food & Shop", "Museum Café", 15, null, 2],
  ["Museum Shop", "Food & Shop", "Entrance Hall", 20, null, 3],
];

function toMin(text) {
  const parts = String(text).split(":");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
    throw new Error("Time must be in HH:MM format.");
  }
  const h = Number(parts[0]), m = Number(parts[1]);
  if (h > 23 || m > 59) throw new Error("Time must be between 00:00 and 23:59.");
  return h * 60 + m;
}

const OPEN_MIN = toMin(OPEN);
const CLOSE_MIN = toMin(CLOSE);

const ACTIVITIES = DATA.map(([name, category, location, duration, start, score], i) => {
  const begin = start ? toMin(start) : null;
  return { id: i + 1, name, category, location, duration, score, start: begin, end: start ? begin + duration : null };
});

// activities a visitor can pin to a time of their choice as a meal break
const BREAKS = ACTIVITIES.filter((a) => a.location === "Museum Café").map((a) => a.id);
const SHOP = ACTIVITIES.find((a) => a.name === "Museum Shop").id;

const GRAPH = Object.fromEntries(LOCATIONS.map((loc) => [loc, []]));
for (const [a, b, w] of PATHS) {
  GRAPH[a].push([b, w]);
  GRAPH[b].push([a, w]);
}

// ---------- Dijkstra ----------

function dijkstra(source) {
  const dist = Object.fromEntries(LOCATIONS.map((loc) => [loc, Infinity]));
  const prev = Object.fromEntries(LOCATIONS.map((loc) => [loc, null]));
  dist[source] = 0;
  const heap = [[0, source]];
  while (heap.length) {
    // ponytail: linear-scan min-heap, 10 rooms; a real heap if the museum grows
    let k = 0;
    for (let i = 1; i < heap.length; i++) {
      if (heap[i][0] < heap[k][0] || (heap[i][0] === heap[k][0] && heap[i][1] < heap[k][1])) k = i;
    }
    const [d, loc] = heap.splice(k, 1)[0];
    if (d > dist[loc]) continue; // stale heap entry, a shorter distance was already found
    for (const [nxt, w] of GRAPH[loc]) {
      if (d + w < dist[nxt]) {
        dist[nxt] = d + w;
        prev[nxt] = loc;
        heap.push([dist[nxt], nxt]);
      }
    }
  }
  return [dist, prev];
}

function shortestRoute(a, b) {
  const [dist, prev] = dijkstra(a);
  const path = [b];
  while (path[path.length - 1] !== a) path.push(prev[path[path.length - 1]]);
  path.reverse();
  return [dist[b], path];
}

const ROUTES = {};
for (const a of LOCATIONS) for (const b of LOCATIONS) ROUTES[a + "|" + b] = shortestRoute(a, b);
const route = (a, b) => ROUTES[a + "|" + b];

// ---------- Greedy ----------

function greedyOrder(acts, byRatio) {
  // Array.prototype.sort is stable, so ties keep dataset order and results stay deterministic
  const key = byRatio ? (a) => a.value / a.duration : (a) => a.value;
  return acts.slice().sort((x, y) => key(y) - key(x));
}

// ---------- Dynamic programming (0/1 knapsack) ----------

function knapsack(acts, capacity, trace) {
  const n = acts.length;
  // dp[i][c] = best score using the first i activities within c minutes
  const dp = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const w = acts[i - 1].duration, v = acts[i - 1].value;
    for (let c = 0; c <= capacity; c++) {
      dp[i][c] = dp[i - 1][c];
      if (w <= c && dp[i - 1][c - w] + v > dp[i][c]) dp[i][c] = dp[i - 1][c - w] + v;
    }
  }
  const picked = [], path = [];
  let c = capacity;
  for (let i = n; i > 0; i--) {
    const take = dp[i][c] !== dp[i - 1][c];
    path.push({ i, c, take });
    if (take) {
      picked.push(acts[i - 1]);
      c -= acts[i - 1].duration;
    }
  }
  picked.reverse();
  if (trace) Object.assign(trace, { capacity, items: acts.map((a) => a.id), table: dp, path });
  return [dp[n][capacity], picked];
}

// ---------- Weighted interval scheduling ----------

function lastCompatible(ends, start, j) {
  // binary search in ends[0..j-1] for the last activity finishing by `start`
  let lo = 0, hi = j - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ends[mid] <= start) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

function weightedInterval(acts) {
  acts = acts.slice().sort((x, y) => x.end - y.end);
  const ends = acts.map((a) => a.end);
  const n = acts.length;
  const p = acts.map((a, j) => lastCompatible(ends, a.start, j));
  // best[j] = best score using the first j activities (by finish time)
  const best = new Array(n + 1).fill(0);
  for (let j = 0; j < n; j++) best[j + 1] = Math.max(best[j], acts[j].value + best[p[j] + 1]);
  const picked = [];
  let j = n - 1;
  while (j >= 0) {
    if (best[j + 1] !== best[j]) { picked.push(acts[j]); j = p[j]; } else j--;
  }
  picked.reverse();
  return [best[n], picked];
}

// ---------- Building a feasible itinerary ----------

function simulate(order, startLoc, startTime) {
  // Walk through `order` from the start; returns [finish, steps] or null if a fixed slot is missed.
  let time = startTime, loc = startLoc;
  const steps = [];
  for (const act of order) {
    const [travel, path] = route(loc, act.location);
    let begin = time + travel;
    if (act.start !== null) {
      if (begin > act.start) return null;
      begin = act.start;
    }
    steps.push({
      id: act.id, name: act.name, category: act.category, location: act.location,
      duration: act.duration, value: act.value, start: begin, end: begin + act.duration,
      fixed: act.start !== null, travel, route: path,
    });
    time = begin + act.duration;
    loc = act.location;
  }
  return [time, steps];
}

function buildItinerary(acts, startLoc, startTime, limit, order = []) {
  // Insert activities one by one (into `order`, if given) at the position with the least
  // total walking (then earliest finish); skip any activity that cannot be placed validly.
  const missed = [];
  for (const act of acts) {
    let best = null;
    for (let pos = 0; pos <= order.length; pos++) {
      const trial = [...order.slice(0, pos), act, ...order.slice(pos)];
      const result = simulate(trial, startLoc, startTime);
      if (result === null) continue;
      // the visitor must also be able to walk back to the door they came in by
      const last = pos === order.length ? act.location : order[order.length - 1].location;
      if (result[0] + route(last, startLoc)[0] > limit) continue;
      const cost = [result[1].reduce((s, x) => s + x.travel, 0), result[0]];
      if (best === null || cost[0] < best[0][0] || (cost[0] === best[0][0] && cost[1] < best[0][1])) {
        best = [cost, trial];
      }
    }
    if (best) order = best[1]; else missed.push(act);
  }
  return [order, missed];
}

function summarize(order, startLoc, startTime, minutes) {
  const [finish, steps] = simulate(order, startLoc, startTime);
  const activity = steps.reduce((s, x) => s + x.duration, 0);
  const travel = steps.reduce((s, x) => s + x.travel, 0);
  const used = finish - startTime;
  return {
    items: steps,
    totals: {
      score: steps.reduce((s, x) => s + x.value, 0), activity, travel,
      wait: used - activity - travel, used, budget: minutes,
      exit: order.length ? route(order[order.length - 1].location, startLoc)[0] : 0, // walk back to the door
      exit_route: order.length ? route(order[order.length - 1].location, startLoc)[1] : [],
    },
  };
}

// ---------- Planners ----------

const has = (list, act) => list.some((a) => a.id === act.id);

function planGreedy(cands, byRatio, startLoc, startTime, minutes, must) {
  // `must` (the café break, if any) goes in first, so it is always placed
  const [order, missed] = buildItinerary(must.concat(greedyOrder(cands, byRatio)), startLoc, startTime, startTime + minutes);
  const plan = summarize(order, startLoc, startTime, minutes);
  plan.left_out = missed.map((a) => ({ name: a.name, reason: "Did not fit (time limit, clash or walking time)" }));
  return plan;
}

function planHybrid(cands, startLoc, startTime, minutes, must) {
  // 1. DP picks the best set by duration alone (ignores walking and clashes);
  //    the café break's minutes are taken out of the budget first
  const dpTrace = {};
  const dpPicked = knapsack(cands, minutes - must.reduce((s, a) => s + a.duration, 0), dpTrace)[1];
  // 2. WIS keeps the best non-overlapping subset of the fixed-time picks
  const fixed = dpPicked.filter((a) => a.start !== null);
  const wisPicked = weightedInterval(fixed)[1];
  const picks = greedyOrder(wisPicked.concat(dpPicked.filter((a) => a.start === null)), false);
  // 3. place picks with real walking times, then 4. fill leftover time greedily
  const rest = greedyOrder(cands.filter((a) => !has(picks, a)), false);
  const [order, missed] = buildItinerary(must.concat(picks, rest), startLoc, startTime, startTime + minutes);
  const plan = summarize(order, startLoc, startTime, minutes);
  plan.dp = dpTrace; // the full table and backtrack path, drawn as the knapsack landscape

  plan.left_out = missed.map((a) => ({
    name: a.name,
    reason: has(picks, a) ? "Selected, but no room once walking time was added"
      : has(fixed, a) ? "Clashes with a higher-value fixed event (WIS)"
      : "Not in the DP set and no gap left to fit it",
  }));
  plan.dropped = missed.filter((a) => has(picks, a)).map((a) => a.name);
  return plan;
}

const asActs = (plan) => plan.items.map((s) => ({ ...s, start: s.fixed ? s.start : null }));

function fillFreeTime(plan, extra, startLoc, startTime, minutes) {
  // Interests come first: keep the plan as it is and only add activities from the
  // visitor's other interests into the time that is still free. null if none fit.
  const base = asActs(plan);
  const [order] = buildItinerary(greedyOrder(extra, false), startLoc, startTime, startTime + minutes, base);
  if (order.length === base.length) return null;
  const filled = summarize(order, startLoc, startTime, minutes);
  filled.added = order.filter((a) => !has(base, a)).map((a) => a.id);
  filled.left_out = plan.left_out;
  if (plan.dp) { filled.dp = plan.dp; filled.dropped = plan.dropped; }
  return filled;
}

function makePlans(startLoc, startTime, fullMinutes, priority, categories, pause, shopLast = false) {
  // pause = [activity id, minute of day]: a café break the visitor asked for at that time.
  // It becomes a fixed event that every plan must contain.
  // shopLast: end the visit at the Museum Shop. Its time (and the walk there and back) is kept
  // aside, the plans are built in what is left, and the shop is added as the last stop.
  const shop = ACTIVITIES[SHOP - 1];
  const minutes = fullMinutes - (shopLast ? shopReserve(startLoc) : 0);
  const limit = startTime + minutes;
  let must = [];
  if (pause) {
    const act = ACTIVITIES[pause[0] - 1];
    must = [{ ...act, value: act.score * ((priority[act.id] ?? 2) || 2), start: pause[1], end: pause[1] + act.duration }];
  }
  const cands = [], outside = [], extra = []; // extra: fits the visit but not the chosen interests
  for (let act of ACTIVITIES) {
    const weight = priority[act.id] ?? 2;
    if (must.length && BREAKS.includes(act.id)) continue; // the pinned break replaces the café's other entries
    if (weight === 0 || (shopLast && act.id === SHOP)) continue;
    act = { ...act, value: act.score * weight };
    if (!categories.includes(act.category)) {
      const fits = act.start === null || (!(must.length && act.start < must[0].end && act.end > must[0].start)
        && act.start >= startTime && act.end <= limit && startTime + route(startLoc, act.location)[0] <= act.start);
      if (fits) extra.push(act);
    } else if (act.start === null) cands.push(act);
    else if (must.length && act.start < must[0].end && act.end > must[0].start) {
      outside.push({ name: act.name, reason: "Clashes with your café break" });
    } else if (act.start < startTime || act.end > limit) {
      outside.push({ name: act.name, reason: "Happens outside your time window" });
    } else if (startTime + route(startLoc, act.location)[0] > act.start) {
      outside.push({ name: act.name, reason: "Starts before you can walk there" });
    } else cands.push(act);
  }

  const plans = {
    greedy_score: planGreedy(cands, false, startLoc, startTime, minutes, must),
    greedy_ratio: planGreedy(cands, true, startLoc, startTime, minutes, must),
    hybrid: planHybrid(cands, startLoc, startTime, minutes, must),
  };
  for (const plan of Object.values(plans)) {
    plan.left_out = outside.concat(plan.left_out);
    plan.fill = fillFreeTime(plan, extra, startLoc, startTime, minutes);
    if (shopLast) {
      const last = { ...shop, value: shop.score * ((priority[SHOP] ?? 2) || 2) };
      for (const p of [plan, plan.fill]) {
        if (p) Object.assign(p, summarize(asActs(p).concat(last), startLoc, startTime, fullMinutes));
      }
    }
  }
  const candidates = cands.map(({ id, name, location, duration, value, start, end }) => ({ id, name, location, duration, value, start, end }));
  return { start_time: startTime, candidates, plans };
}

// minutes kept aside for the shop at the end: its visit plus the walk there and back to the door
// (by the triangle inequality this always covers going last stop -> shop -> door)
const shopReserve = (startLoc) => {
  const shop = ACTIVITIES[SHOP - 1];
  return shop.duration + route(startLoc, shop.location)[0] + route(shop.location, startLoc)[0];
};

// ---------- Request validation (was server.py's read_plan) ----------

function readPlan(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Request body must be a JSON object.");

  const startLoc = data.start_location;
  if (!LOCATIONS.includes(startLoc)) throw new Error("Choose a valid starting location.");

  const startTime = toMin(data.start_time ?? "");
  if (!(OPEN_MIN <= startTime && startTime < CLOSE_MIN)) throw new Error(`The museum is open from ${OPEN} to ${CLOSE}.`);

  const hours = data.hours;
  if (typeof hours !== "number" || !Number.isFinite(hours) || !(0.5 <= hours && hours <= 12)) {
    throw new Error("Available time must be between 0.5 and 12 hours.");
  }
  const minutes = Math.round(hours * 60);
  if (startTime + minutes > CLOSE_MIN) throw new Error(`The museum closes at ${CLOSE}. Choose less time or an earlier start.`);

  const categories = data.categories;
  if (!Array.isArray(categories) || categories.some((c) => !CATEGORIES.includes(c))) throw new Error("Invalid list of categories.");

  const raw = data.priority ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Priorities must be an object.");
  const priority = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d+$/.test(key) || !Number.isInteger(value) || value < 0 || value > 3) {
      throw new Error("Priorities must be whole numbers from 0 to 3.");
    }
    priority[Number(key)] = value;
  }

  const shopLast = data.shop_last ?? false;
  if (typeof shopLast !== "boolean") throw new Error("shop_last must be true or false.");
  const reserve = shopLast ? shopReserve(startLoc) : 0;
  if (reserve > minutes) throw new Error("There is not enough time to end at the Museum Shop.");

  let pause = null;
  const brk = data.break;
  if (brk != null) {
    if (typeof brk !== "object" || !Number.isInteger(brk.id) || !BREAKS.includes(brk.id)) throw new Error("Choose a valid café break.");
    const act = ACTIVITIES[brk.id - 1];
    const at = toMin(brk.time ?? "");
    const walkIn = route(startLoc, act.location)[0];
    if (at < startTime + walkIn || at + act.duration + walkIn > startTime + minutes - reserve) {
      throw new Error("Your café break does not fit inside your visit. Pick another time.");
    }
    pause = [brk.id, at];
  }
  return [startLoc, startTime, minutes, priority, categories, pause, shopLast];
}

// Same three endpoints server.py served, with a fetch-shaped result so script.js barely changes.
function api(url, opts) {
  const reply = (ok, body) => ({ ok, json: async () => body });
  const u = new URL(url, "http://local/");
  try {
    if (u.pathname === "/api/data") {
      return reply(true, { activities: ACTIVITIES, locations: LOCATIONS, categories: CATEGORIES, paths: PATHS, open: OPEN_MIN, close: CLOSE_MIN });
    }
    if (u.pathname === "/api/route") {
      const a = u.searchParams.get("from") ?? "", b = u.searchParams.get("to") ?? "";
      if (!LOCATIONS.includes(a) || !LOCATIONS.includes(b)) return reply(false, { error: "Unknown location." });
      const [minutes, path] = route(a, b);
      return reply(true, { minutes, path });
    }
    if (u.pathname === "/api/plan") return reply(true, makePlans(...readPlan(JSON.parse(opts.body))));
    return reply(false, { error: "Not found." });
  } catch (err) {
    return reply(false, { error: err.message });
  }
}

if (typeof module !== "undefined") module.exports = { api }; // for the parity check against algorithms.py
