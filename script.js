// plain names for visitors, technical names for the comparison table and the player
const PLAN_NAMES = {
  hybrid: "Best overall plan",
  greedy_score: "Favourites first",
  greedy_ratio: "See as much as possible",
};
const ALGO_NAMES = {
  hybrid: "0/1 knapsack DP → weighted interval scheduling → Dijkstra",
  greedy_score: "Greedy, sorted by score → Dijkstra",
  greedy_ratio: "Greedy, sorted by score per minute → Dijkstra",
};
const PRIORITY_NAMES = ["Skip", "Low", "Normal", "High"];
const START_ROOM = "Entrance Hall";
const CATEGORY_ICONS = {
  "Ancient History": "temple", "Fine Art": "palette", "Modern Art": "shapes",
  "Natural Science": "flask", "Hands-on": "brush", "Food & Shop": "cup",
};

let data = null;
let result = null;
let chosenAlgo = "hybrid";
let cand = {}; // candidate id -> activity, for the current result
const priority = {};

function byId(id) {
  return document.getElementById(id);
}

function icon(name) {
  return `<svg class="icon"><use href="#i-${name}"/></svg>`;
}

function fmt(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return m + "m";
  return m === 0 ? h + "h" : h + "h " + m + "m";
}

function toMin(text) {
  const [h, m] = text.split(":");
  return Number(h) * 60 + Number(m);
}

function checkedCategories() {
  const boxes = document.querySelectorAll("#category-list input:checked");
  return Array.from(boxes).map(box => box.value);
}

async function loadData() {
  try {
    const res = await api("/api/data");
    data = await res.json();
  } catch (err) {
    alert("Could not load the museum data.");
    return;
  }

  byId("open-time").textContent = fmt(data.open);
  byId("close-time").textContent = fmt(data.close);

  // arrivals every 30 minutes, up to 30 minutes before closing
  let times = "";
  for (let t = data.open; t < data.close; t += 30) {
    times += `<option>${fmt(t)}</option>`;
  }
  byId("start-time").innerHTML = times;

  let breaks = '<option value="">No break</option>';
  for (const act of data.activities) {
    if (act.location === "Museum Café") breaks += `<option value="${act.id}">${act.name} · ${act.duration} min</option>`;
  }
  byId("break").innerHTML = breaks;

  let rooms = "";
  for (const loc of data.locations) {
    rooms += `<option>${loc}</option>`;
  }
  byId("route-from").innerHTML = rooms;
  byId("route-to").innerHTML = rooms;
  byId("route-to").selectedIndex = 5;

  let chips = "";
  for (const cat of data.categories) {
    chips += `<label class="chip"><input type="checkbox" value="${cat}">${icon(CATEGORY_ICONS[cat])}${cat}</label>`;
  }
  byId("category-list").innerHTML = chips;

  let paths = "";
  for (const [a, b, w] of data.paths) {
    paths += `<li>${a} – ${b}: ${w} min</li>`;
  }
  byId("path-list").innerHTML = paths;

  for (const act of data.activities) {
    priority[act.id] = 2;
  }
  renderActivities();
  updateTimeLimit();
  buildMuseum();
  const hero = makeScene(byId("museum-canvas"), drawMuseum, 0);
  hero.hero = true;
  hero.trip = newTrip();
  showTrip(hero.trip);
  hero.resize();
  arm(hero);
  say(`${data.locations.length} rooms and ${data.paths.length} corridors mapped`);
}

// the slider can never run past closing time
function updateTimeLimit() {
  const slider = byId("hours");
  const start = toMin(byId("start-time").value);
  slider.max = (data.close - start) / 60;
  if (Number(slider.value) > Number(slider.max)) {
    slider.value = slider.max;
  }
  const minutes = Number(slider.value) * 60;
  byId("hours-out").textContent = duration(minutes);
  byId("leave-by").textContent = `You'll leave by ${fmt(start + minutes)} · museum closes ${fmt(data.close)}`;

  // café break times: every half hour that leaves room to walk there and back; lunchtime by default
  const pick = byId("break-time");
  const act = data.activities.find(a => a.id === Number(byId("break").value));
  pick.hidden = !act;
  if (!act) return;
  const want = pick.value ? toMin(pick.value) : 13 * 60;
  let options = "", nearest = null;
  for (let t = start + 30; t + act.duration + 5 <= start + minutes; t += 30) {
    options += `<option>${fmt(t)}</option>`;
    if (nearest === null || Math.abs(t - want) < Math.abs(nearest - want)) nearest = t;
  }
  pick.innerHTML = options || "<option value=''>No room for it</option>";
  if (nearest !== null) pick.value = fmt(nearest);
}

function renderActivities() {
  const cats = checkedCategories();
  let html = "";
  for (const act of data.activities) {
    const timing = act.start === null
      ? '<span class="badge">Anytime</span>'
      : `<span class="badge fixed">${icon("clock")}${fmt(act.start)}–${fmt(act.end)}</span>`;
    let options = "";
    for (let p = 0; p < PRIORITY_NAMES.length; p++) {
      const selected = priority[act.id] === p ? " selected" : "";
      options += `<option value="${p}"${selected}>${PRIORITY_NAMES[p]}</option>`;
    }
    let state = "";
    // nothing is dimmed until the visitor picks at least one interest
    if ((cats.length > 0 && !cats.includes(act.category)) || priority[act.id] === 0) state = " off";
    else if (priority[act.id] === 3) state = " high";

    html += `
      <article class="activity${state}">
        <div class="activity-top">
          <span class="cat-icon" title="${act.category}">${icon(CATEGORY_ICONS[act.category])}</span>
          <div>
            <h3>${act.name}</h3>
            <div class="meta"><span>${icon("pin")}${act.location}</span><span>${icon("clock")}${act.duration} min</span></div>
          </div>
          <span class="score" title="Base score">${icon("star")}${act.score}</span>
        </div>
        <div class="activity-foot">
          ${timing}
          <select data-id="${act.id}" aria-label="Priority for ${act.name}">${options}</select>
        </div>
      </article>`;
  }
  byId("activity-list").innerHTML = html;
}

function showError(message) {
  const error = byId("form-error");
  error.innerHTML = icon("alert") + "<span></span>";
  error.querySelector("span").textContent = message;
  error.hidden = false;
}

async function generatePlan(event) {
  event.preventDefault();
  const button = event.target.querySelector("button[type=submit]");
  byId("form-error").hidden = true;
  if (checkedCategories().length === 0) {
    showError("Pick at least one interest to plan your visit.");
    return;
  }
  chosenAlgo = document.querySelector("input[name=algo]:checked").value;

  const body = {
    hours: Number(byId("hours").value),
    start_time: byId("start-time").value,
    start_location: START_ROOM,
    categories: checkedCategories(),
    priority: priority,
  };
  if (byId("break").value) {
    if (!byId("break-time").value) {
      showError("There is no room for a café break in this visit. Add more time or choose no break.");
      return;
    }
    body.break = { id: Number(byId("break").value), time: byId("break-time").value };
  }

  button.disabled = true;
  say("Working out three plans…");
  try {
    const res = await api("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      showError(json.error);
      return;
    }
    result = json;
  } catch (err) {
    showError("Something went wrong while planning.");
    return;
  } finally {
    button.disabled = false;
  }

  cand = {};
  for (const c of result.candidates) {
    cand[c.id] = c;
  }
  say(`Plan ready: ${result.plans[chosenAlgo].items.length} stops, ${result.plans[chosenAlgo].totals.score} points`);
  showItinerary();
  showComparison();
  showScenes();
  byId("walk").scrollIntoView();
}

function metric(label, value, extra = "", cls = "metric") {
  return `<div class="${cls}"><span class="metric-label">${label}</span>
    <strong>${value}</strong>${extra}</div>`;
}

function showItinerary() {
  const plan = result.plans[chosenAlgo];
  const t = plan.totals;
  const hasPlan = plan.items.length > 0;
  byId("results").hidden = false;
  byId("result-title").textContent = `${PLAN_NAMES[chosenAlgo]}, starting ${fmt(result.start_time)}.`;

  const usedPct = Math.round(100 * t.used / t.budget);
  byId("totals").innerHTML =
    metric("Activities", plan.items.length) +
    metric("Activity time", duration(t.activity)) +
    metric("Walking", duration(t.travel)) +
    metric("Time used", `${duration(t.used)} <small>/ ${duration(t.budget)}</small>`,
      `<div class="bar"><span style="width: ${usedPct}%"></span></div>`) +
    metric("Preference score", t.score, "", "metric highlight");

  byId("totals").hidden = !hasPlan;
  byId("no-plan").hidden = hasPlan;
  byId("plan-body").hidden = !hasPlan;
  if (!hasPlan) return;

  let html = "";
  let clock = result.start_time;
  for (const step of plan.items) {
    if (step.travel > 0) {
      html += `<li class="gap">${icon("walk")}${step.travel} min walk · ${step.route.join(" → ")}</li>`;
    }
    const wait = step.start - clock - step.travel;
    if (wait > 0) {
      html += `<li class="gap">${icon("pause")}${wait} min free before it starts</li>`;
    }
    html += `
      <li class="stop${step.fixed ? " fixed" : ""}">
        <div class="stop-time"><b>${fmt(step.start)}</b><span>${fmt(step.end)}</span></div>
        <div class="stop-card">
          <span class="cat-icon">${icon(CATEGORY_ICONS[step.category])}</span>
          <div>
            <b>${step.name}</b>
            <div class="meta"><span>${icon("pin")}${step.location}</span>
              <span class="badge${step.fixed ? " fixed" : ""}">${step.duration} min${step.fixed ? " · timed" : ""}</span></div>
          </div>
          <span class="score">${icon("star")}${step.value}</span>
        </div>
      </li>`;
    clock = step.end;
  }
  if (t.exit > 0) {
    html += `<li class="gap">${icon("walk")}${t.exit} min walk back to the entrance · out by ${fmt(clock + t.exit)}</li>`;
  }
  byId("timeline").innerHTML = html;

  let route = `<li>${plan.items[0].route[0]} <small>start</small></li>`;
  let lastRoom = plan.items[0].route[0];
  for (const step of plan.items) {
    if (step.location !== lastRoom) {
      route += `<li>${step.location} <small>${fmt(step.start)}</small></li>`;
      lastRoom = step.location;
    }
  }
  byId("route-summary").innerHTML = route;

  const left = byId("left-out");
  left.hidden = plan.left_out.length === 0;
  left.querySelector("summary").textContent = `Not included (${plan.left_out.length})`;
  let items = "";
  for (const item of plan.left_out) {
    items += `<li><b>${item.name}</b><span>${item.reason}</span></li>`;
  }
  left.querySelector("ul").innerHTML = items;
}

function showComparison() {
  const plans = result.plans;
  byId("compare").hidden = false;

  let best = 0;
  for (const key in PLAN_NAMES) {
    best = Math.max(best, plans[key].totals.score);
  }

  let rows = `<thead><tr><th>Planning style</th><th>Score</th><th>Activities</th>
    <th>Time used</th><th>Walking</th><th>Feasibility</th></tr></thead><tbody>`;
  for (const key in PLAN_NAMES) {
    const p = plans[key];
    const width = best ? Math.round(100 * p.totals.score / best) : 0;
    const selected = key === chosenAlgo;
    const feasible = p.items.length
      ? `<span class="ok">${icon("check")}Checked</span>`
      : "No plan";
    rows += `<tr${selected ? ' class="selected"' : ""}>
      <td class="plan-name"><b>${PLAN_NAMES[key]}</b>${selected ? '<span class="tag">Selected</span>' : ""}<small>${ALGO_NAMES[key]}</small></td>
      <td><div class="score-cell"><b>${p.totals.score}</b><div class="bar"><span style="width: ${width}%"></span></div></div></td>
      <td>${p.items.length}</td>
      <td>${duration(p.totals.used)} / ${duration(p.totals.budget)}</td>
      <td>${p.totals.travel} min</td>
      <td>${feasible}</td></tr>`;
  }
  byId("compare-table").innerHTML = rows + "</tbody>";

  byId("compare-note").textContent =
    `Greedy styles can't undo an early pick, so long or short activities can crowd out better combinations. ` +
    `The best overall plan chooses the set as a whole, but ${plans.hybrid.dropped.length} of its picks were dropped once walking was added.`;
}

function showScenes() {
  const plan = result.plans[chosenAlgo];
  if (walk.scene) walk.scene.setPlaying(false);
  if (terrain.scene) terrain.scene.setPlaying(false);
  byId("walk").hidden = plan.items.length === 0;
  byId("terrain").hidden = false;
  if (plan.items.length) startWalk(plan);
  startTerrain(result.plans.hybrid);
}

async function findRoute(event) {
  event.preventDefault();
  const from = encodeURIComponent(byId("route-from").value);
  const to = encodeURIComponent(byId("route-to").value);
  const out = byId("route-result");
  try {
    const res = await api(`/api/route?from=${from}&to=${to}`);
    const json = await res.json();
    out.textContent = res.ok ? `${json.path.join(" → ")} · ${json.minutes} min` : json.error;
  } catch (err) {
    out.textContent = "Could not find a route.";
  }
}


// ---------- canvas scenes ----------
// Two animated views of the chosen plan, both drawn from the real plan data:
// the walk follows plan.items and their Dijkstra routes, the landscape is plan.dp.table.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const NIGHT = { wall: "#fbf5ee", floor: "#f3e9df", line: "#e2d3c5", text: "#3d2f2a", dim: "#86716a",
  warm: "#3d2f2a", glow: "rgba(184, 92, 54, 0.4)" };
// in both scenes: dark brown = the planner at work, terracotta = chosen, sage = the building and what was only considered
const C = { hot: "61, 47, 42", main: "184, 92, 54", dim: "142, 170, 140" };
const ROOM_FILL = "#f6dccb"; // peach clay
const MONO = 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Nunito, "Segoe UI", system-ui, sans-serif'; // the rounded face used for all canvas lettering

for (const proto of [CanvasRenderingContext2D.prototype, Path2D.prototype]) {
  if (!proto.roundRect) proto.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
}

// a scene starts the first time it scrolls into view, then keeps idling (hovering, turning) while visible
const onView = new IntersectionObserver(entries => {
  for (const e of entries) {
    const scene = e.target.scene;
    if (!scene) continue;
    scene.visible = e.isIntersecting;
    if (!scene.visible) continue;
    if (scene.armed) {
      scene.armed = false;
      scene.restart();
    }
    scene.wake();
  }
}, { threshold: 0.25 });

function arm(scene) {
  if (scene.canvas.scene) cancelAnimationFrame(scene.canvas.scene.raf);
  scene.canvas.scene = scene;
  scene.armed = true;
  onView.unobserve(scene.canvas);
  onView.observe(scene.canvas);
}

// a small animation loop. scene.t is the story (pauses, restarts, respects reduced motion);
// scene.clock never stops while the canvas is on screen, so things keep hovering after the story ends
function makeScene(canvas, draw, length) {
  const scene = { canvas, ctx: canvas.getContext("2d"), t: 0, clock: 0, length, playing: false, visible: false, last: 0, raf: 0, dpr: 1,
    lift: {}, hover: null, fit: null, busy: false };
  scene.resize = () => {
    const box = canvas.getBoundingClientRect();
    scene.dpr = Math.min(window.devicePixelRatio || 1, 1.5); // sharp enough, and far fewer pixels to fill on retina screens
    canvas.width = Math.round(box.width * scene.dpr);
    canvas.height = Math.round(box.height * scene.dpr);
    scene.w = box.width;
    scene.h = box.height;
    scene.ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
    draw(scene);
  };
  scene.frame = now => {
    // while the page is being scrolled the canvases hold still, so every frame goes to the scroll itself
    if (now < scrollingUntil) {
      scene.last = now;
      scene.raf = requestAnimationFrame(scene.frame);
      return;
    }
    const dt = Math.min(0.1, (now - scene.last) / 1000);
    scene.last = now;
    scene.clock += dt;
    if (scene.playing) {
      scene.t = Math.min(scene.length, scene.t + dt);
      if (scene.t >= scene.length) scene.setPlaying(false);
    }
    draw(scene);
    // keep going only while the story plays or the drawing says something is still moving (scene.busy)
    if (scene.visible && (scene.playing || scene.busy)) scene.raf = requestAnimationFrame(scene.frame);
  };
  scene.wake = () => {
    if (reduceMotion) return;
    cancelAnimationFrame(scene.raf);
    scene.last = performance.now();
    scene.raf = requestAnimationFrame(scene.frame);
  };
  scene.setPlaying = on => {
    scene.playing = on;
    if (scene.button) {
      scene.button.innerHTML = icon(on ? "stop" : "play");
      scene.button.setAttribute("aria-label", on ? "Pause" : "Play");
    }
    if (on && scene.t >= scene.length) scene.t = 0;
    if (on && scene.visible) scene.wake();
  };
  scene.restart = () => {
    scene.t = 0;
    if (reduceMotion) {
      scene.t = scene.length;
      draw(scene);
    } else {
      scene.setPlaying(true);
    }
  };
  new ResizeObserver(scene.resize).observe(canvas);
  return scene;
}

let scrollingUntil = 0;
window.addEventListener("scroll", () => { scrollingUntil = performance.now() + 140; }, { passive: true });

function ease(x) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
}

function lerp(a, b, x) {
  return a + (b - a) * x;
}

// ----- the museum -----
// Each room has its own shape. Corridors between them come from the server's doorway list and carry
// one dot per walking minute. Coordinates are in a 700 x 460 plan, seen from straight above.
const PLAN = { w: 700, h: 460 };
const ROOMS = {
  "Egyptian Gallery": { x: 92, y: 100, shape: "poly", n: 3, r: 62, label: 46 },
  "Greek & Roman Hall": { x: 262, y: 74, shape: "rect", w: 132, h: 66, label: 48 },
  "Renaissance Gallery": { x: 442, y: 74, shape: "poly", n: 8, r: 48, label: 62 },
  "Modern Art Wing": { x: 608, y: 86, shape: "poly", n: 4, r: 54, label: 68 },
  "Medieval Armory": { x: 92, y: 236, shape: "poly", n: 5, r: 50, down: true, label: 56 },
  "Central Atrium": { x: 350, y: 228, shape: "circle", r: 64, label: 78 },
  "Sculpture Garden": { x: 608, y: 236, shape: "ellipse", w: 124, h: 82, open: true, label: 55 },
  "Museum Café": { x: 92, y: 380, shape: "rect", w: 128, h: 58, round: 29, label: 44 },
  "Entrance Hall": { x: 350, y: 384, shape: "arch", w: 190, h: 80, label: 55 },
  "Natural History Hall": { x: 608, y: 380, shape: "poly", n: 6, r: 50, label: 62 },
};
const museum = { corridors: [] };

function centre(name) {
  return [ROOMS[name].x, ROOMS[name].y];
}

function roomPath(room) {
  const path = new Path2D();
  const { x, y } = room;
  if (room.shape === "circle") path.arc(x, y, room.r, 0, Math.PI * 2);
  if (room.shape === "ellipse") path.ellipse(x, y, room.w / 2, room.h / 2, 0, 0, Math.PI * 2);
  if (room.shape === "rect") path.roundRect(x - room.w / 2, y - room.h / 2, room.w, room.h, room.round || 3);
  if (room.shape === "poly") {
    for (let k = 0; k < room.n; k++) {
      const a = (room.down ? 0.5 : -0.5) * Math.PI + (k * 2 * Math.PI) / room.n;
      path.lineTo(x + room.r * Math.cos(a), y + room.r * Math.sin(a));
    }
    path.closePath();
  }
  if (room.shape === "arch") {
    const l = x - room.w / 2, r = x + room.w / 2, b = y + room.h / 2, t = y - room.h / 2;
    path.moveTo(l, b);
    path.lineTo(l, y);
    path.bezierCurveTo(l, t - 14, r, t - 14, r, y);
    path.lineTo(r, b);
    path.closePath();
  }
  return path;
}

// shapes once, then each corridor from wall to wall: step out from a room's centre until the point leaves its shape
function buildMuseum() {
  const probe = document.createElement("canvas").getContext("2d");
  for (const name in ROOMS) ROOMS[name].path = roomPath(ROOMS[name]);
  const wall = (from, to) => {
    const [x0, y0] = centre(from), [x1, y1] = centre(to);
    const len = Math.hypot(x1 - x0, y1 - y0);
    let d = 0;
    while (probe.isPointInPath(ROOMS[from].path, x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len)) d += 1;
    return [x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len];
  };
  museum.corridors = data.paths.map(([a, b, w]) => ({ a, b, w, p: wall(a, b), q: wall(b, a) }));
}

// Dijkstra on the corridor graph. The server has its own (algorithms.py) for planning; this copy keeps the
// order rooms were settled in, so the search itself can be shown.
// ponytail: O(V^2) scan for the nearest room, fine for 10 rooms; use a heap if the museum grows
function dijkstra(from, to) {
  const dist = { [from]: 0 }, prev = {}, order = [], done = new Set();
  for (;;) {
    let u = null;
    for (const name in dist) if (!done.has(name) && (u === null || dist[name] < dist[u])) u = name;
    if (u === null) break;
    done.add(u);
    order.push(u);
    if (u === to) break;
    for (const [a, b, w] of data.paths) {
      const v = a === u ? b : b === u ? a : null;
      if (v && !done.has(v) && dist[u] + w < (dist[v] ?? Infinity)) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return { dist, order, path };
}

// ----- the trip: rooms clicked on the top map, routed in click order -----

const SEARCH_STEP = 0.07; // seconds between rooms being settled
const PATH_TIME = 0.55; // seconds for the found path to draw

function newTrip() {
  return { stops: [START_ROOM], legs: [], total: 0 };
}

function tripClick(scene, room) {
  const trip = scene.trip;
  const from = trip.stops[trip.stops.length - 1];
  if (room === from) return;
  const search = dijkstra(from, room);
  trip.legs.push({ search, points: search.path.map(centre), at: scene.clock });
  trip.stops.push(room);
  trip.total += search.dist[room];
  showTrip(trip);
  say(`Shortest path found: ${search.dist[room]} min, after checking ${search.order.length} rooms`);
}

function showTrip(trip) {
  byId("trip-total").textContent = `${trip.total} min`;
  byId("map-hint").textContent = trip.legs.length
    ? trip.legs.map((leg, k) => `Leg ${k + 1}: ${leg.search.path.join(" → ")} (${leg.search.dist[leg.search.path[leg.search.path.length - 1]]} min)`).join("  ·  ")
    : "Click rooms in the order you want to visit them. Each click runs Dijkstra from your last stop.";
}

// ----- the walk -----

const walk = { scene: null, plan: null, legs: [], total: 0 };

function startWalk(plan) {
  walk.plan = plan;

  // one leg per plan item: a route through the corridors, then a stay in the room
  const t0 = result.start_time;
  let loc = START_ROOM;
  let clock = t0;
  walk.legs = [];
  for (const item of plan.items) {
    const route = [loc, ...item.route.slice(1)];
    walk.legs.push({ item, route, points: route.map(centre), leave: clock, arrive: clock + item.travel, start: item.start, end: item.end });
    clock = item.end;
    loc = item.location;
  }
  walk.t0 = t0;
  walk.t1 = clock;
  // screen time is per event, not per minute: a 2-minute walk stays visible and a 90-minute tour doesn't drag
  walk.segs = [];
  let at = 0.5;
  const seg = (m0, m1, dur) => {
    if (m1 <= m0) return;
    walk.segs.push({ m0, m1, a0: at, a1: at + dur });
    at += dur;
  };
  for (const leg of walk.legs) {
    seg(leg.leave, leg.arrive, 0.5 + 0.12 * leg.item.travel);
    seg(leg.arrive, leg.start, 0.25);
    seg(leg.start, leg.end, 0.8);
  }
  walk.scene = makeScene(byId("walk-canvas"), drawMuseum, at + 1);
  walk.scene.button = byId("walk-play");

  byId("walk-stops").innerHTML = plan.items.map((s, k) => `<li data-stop="${k}">
    <b>${fmt(s.start)}</b><span>${s.name}</span><small>${s.location}</small></li>`).join("");
  walk.scene.resize();
  arm(walk.scene);
}

// minute of the day at animation time t, read off the per-event segments
function walkClock(scene) {
  for (const s of walk.segs) {
    if (scene.t < s.a1) return lerp(s.m0, s.m1, Math.max(0, (scene.t - s.a0) / (s.a1 - s.a0)));
  }
  return walk.t1;
}

function positionAt(minute) {
  let last = walk.legs[0] ? walk.legs[0].points[0] : centre(START_ROOM);
  for (const leg of walk.legs) {
    if (minute < leg.leave) return { pos: last, leg: null, moving: false };
    if (minute < leg.arrive) {
      const f = (minute - leg.leave) / (leg.arrive - leg.leave);
      return { pos: alongPath(leg.points, f), leg, moving: true };
    }
    last = leg.points[leg.points.length - 1];
    if (minute < leg.end) return { pos: last, leg, moving: false, inside: true };
  }
  return { pos: last, leg: walk.legs[walk.legs.length - 1] || null, moving: false, done: true };
}

function alongPath(points, f) {
  let total = 0;
  const segs = [];
  for (let k = 1; k < points.length; k++) {
    const d = Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    segs.push(d);
    total += d;
  }
  let left = f * total;
  for (let k = 1; k < points.length; k++) {
    if (left <= segs[k - 1]) {
      const g = segs[k - 1] ? left / segs[k - 1] : 0;
      return [lerp(points[k - 1][0], points[k][0], g), lerp(points[k - 1][1], points[k][1], g)];
    }
    left -= segs[k - 1];
  }
  return points[points.length - 1];
}

// the first f (0..1) of a path through room centres
function trace(ctx, points, f) {
  ctx.beginPath();
  for (let k = 0; k <= 60; k++) {
    const p = alongPath(points, (f * k) / 60);
    k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
  }
  ctx.stroke();
}

// a small round tag with a number in it
function badge(ctx, x, y, text, strong) {
  ctx.fillStyle = strong ? `rgb(${C.main})` : NIGHT.text;
  ctx.beginPath();
  ctx.arc(x, y, strong ? 13 : 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = NIGHT.wall;
  ctx.font = `700 ${strong ? 13 : 10}px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + (strong ? 4.5 : 3.5));
}

// One drawing for both museum canvases: the map at the top (click rooms to route between them)
// and the walk (the chosen plan played back)
function drawMuseum(scene) {
  const { ctx, w, h } = scene;
  const hero = scene.hero;
  const minute = hero ? -1 : walkClock(scene);
  const now = hero ? null : positionAt(minute);
  const time = scene.clock;
  ctx.clearRect(0, 0, w, h);

  // fit the plan under the clock, leaving room on the right for the day strip
  const pad = w > 760 ? 28 : 8;
  const top = hero ? 12 : 84;
  const stripW = !hero && w > 760 ? 150 : 0;
  const sc = Math.min((w - pad * 2 - stripW) / PLAN.w, (h - top - pad) / PLAN.h);
  scene.fit = { sc, ox: (w - stripW - PLAN.w * sc) / 2, oy: top + (h - top - pad - PLAN.h * sc) / 2 };
  if (stripW) drawDayStrip(ctx, w - pad - 96, top, 96, h - top - pad, minute);

  scene.busy = Boolean(hero); // the top map keeps its corridor beads drifting while it is on screen
  // which rooms the plan chose and where each is in its life (walk only), and which corridors are in use
  const state = {};
  const used = new Set();
  const use = route => route.forEach((name, k) => k && used.add(route[k - 1] + "|" + name).add(name + "|" + route[k - 1]));
  if (hero) {
    scene.trip.legs.forEach((leg, k) => {
      const age = k === scene.trip.legs.length - 1 ? time - leg.at : Infinity;
      const drawn = leg.search.order.length * SEARCH_STEP + PATH_TIME;
      if (age < drawn + 0.45) scene.busy = true; // the last rings are still fading
      if (age >= drawn) use(leg.search.path);
    });
  } else {
    walk.legs.forEach((leg, k) => {
      const s = state[leg.item.location] || (state[leg.item.location] = { stops: [], lit: false, done: false });
      s.stops.push(k + 1);
      if (minute >= leg.start && minute < leg.end) s.lit = true;
      else if (minute >= leg.end) s.done = true;
      if (minute >= leg.arrive) use(leg.route);
    });
  }

  ctx.save();
  ctx.translate(scene.fit.ox, scene.fit.oy);
  ctx.scale(sc, sc);

  // corridors: a walkway from wall to wall with one dot per walking minute
  for (const c of museum.corridors) {
    const on = used.has(c.a + "|" + c.b);
    for (const [width, colour] of [[15, on ? `rgb(${C.main})` : `rgb(${C.dim})`], [12, on ? `rgb(${C.main})` : NIGHT.wall]]) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(c.p[0], c.p[1]);
      ctx.lineTo(c.q[0], c.q[1]);
      ctx.stroke();
    }
    ctx.fillStyle = NIGHT.text;
    for (let k = 0; k < c.w; k++) {
      const f = (k + 0.5) / c.w;
      ctx.beginPath();
      ctx.arc(lerp(c.p[0], c.q[0], f), lerp(c.p[1], c.q[1], f), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hero) {
      const f = 0.5 - 0.5 * Math.cos(time * 0.6 + c.p[0] * 0.02 + c.p[1] * 0.03);
      ctx.fillStyle = `rgba(${C.main}, 0.75)`;
      ctx.beginPath();
      ctx.arc(lerp(c.p[0], c.q[0], f), lerp(c.p[1], c.q[1], f), 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // the minutes, written beside the walkway
    const len = Math.hypot(c.q[0] - c.p[0], c.q[1] - c.p[1]);
    const nx = -(c.q[1] - c.p[1]) / len, ny = (c.q[0] - c.p[0]) / len;
    ctx.fillStyle = NIGHT.dim;
    ctx.font = `600 10px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(`${c.w}m`, (c.p[0] + c.q[0]) / 2 + nx * 18, (c.p[1] + c.q[1]) / 2 + ny * 18 + 3.5);
  }

  // rooms: each lifts off the floor (shadow grows) when hovered or when its activity is running
  for (const name in ROOMS) {
    const r = ROOMS[name];
    const s = state[name];
    const hov = scene.hover === name;
    const target = (s && s.lit ? 7 : 0) + (hov ? 5 : 0);
    const lift = scene.lift[name] = lerp(scene.lift[name] || 0, target, reduceMotion ? 1 : 0.2);
    if (Math.abs(target - lift) > 0.05) scene.busy = true;
    ctx.save();
    ctx.translate(0, -lift);
    // blurred shadows are the costliest thing here, so only a lifted room casts one
    if (lift > 0.3) {
      ctx.shadowColor = "rgba(90, 60, 45, 0.4)";
      ctx.shadowBlur = lift * 2.5 * scene.dpr;
      ctx.shadowOffsetY = lift * 1.8 * scene.dpr;
    }
    ctx.fillStyle = s && s.lit ? `rgb(${C.main})` : ROOM_FILL;
    ctx.fill(r.path);
    ctx.shadowColor = "transparent";
    if (s && s.done && !s.lit) {
      ctx.fillStyle = `rgba(${C.main}, 0.25)`;
      ctx.fill(r.path);
    }
    ctx.strokeStyle = s && !s.lit ? `rgb(${C.main})` : hov || (s && s.lit) ? NIGHT.text : `rgb(${C.dim})`;
    ctx.lineWidth = hov ? 3.5 : s ? 2.5 : 1.5;
    if (r.open) ctx.setLineDash([6, 5]); // open-air
    ctx.stroke(r.path);
    ctx.setLineDash([]);
    if (s) {
      ctx.fillStyle = s.lit ? NIGHT.wall : `rgb(${C.main})`;
      ctx.font = `700 15px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText((s.done && !s.lit ? "✓ " : "") + s.stops.join("·"), r.x, r.y + 5);
    }
    // name plate under the room, on its own patch so a corridor passing behind stays legible
    ctx.font = `700 9.5px ${MONO}`;
    ctx.textAlign = "center";
    const plate = ctx.measureText(name.toUpperCase()).width + 10;
    ctx.fillStyle = NIGHT.wall;
    ctx.fillRect(r.x - plate / 2, r.y + r.label + 2, plate, 14);
    ctx.fillStyle = NIGHT.text;
    ctx.fillText(name.toUpperCase(), r.x, r.y + r.label + 12);
    ctx.restore();
  }

  if (hero) drawTrip(ctx, scene.trip, time);
  else drawVisitor(ctx, minute, now, time);
  ctx.restore();
  drawRoomCard(scene, ctx);
  if (hero) return;

  // HUD text
  byId("walk-clock").textContent = fmt(Math.round(minute));
  let status = "Arriving at the entrance";
  if (now.done) status = `Day over · ${walk.plan.totals.score} points`;
  else if (now.moving) status = `Walking to ${now.leg.item.location} · ${now.leg.item.travel} min`;
  else if (now.inside) status = `${now.leg.item.name} · until ${fmt(now.leg.end)}`;
  else if (now.leg === null && walk.legs[0] && minute < walk.legs[0].leave) status = "Waiting at the entrance";
  else {
    const next = walk.legs.find(l => l.leave >= minute);
    if (next) status = `Waiting for ${next.item.name} at ${fmt(next.start)}`;
  }
  if (!now.done) {
    const soFar = walk.legs.reduce((sum, leg) => sum + (minute >= leg.start ? leg.item.value : 0), 0);
    status += ` · ${soFar} pts so far`;
  }
  byId("walk-status").textContent = status;
  byId("walk-progress").style.transform = `scaleX(${(minute - walk.t0) / Math.max(1, walk.t1 - walk.t0)})`;
  for (const li of byId("walk-stops").children) {
    const leg = walk.legs[+li.dataset.stop];
    li.classList.toggle("on", minute >= leg.start && minute < leg.end);
    li.classList.toggle("past", minute >= leg.end);
  }
}

// the trip on the top map. The newest leg shows Dijkstra at work: rooms light up in the order they are settled,
// each tagged with its distance from the leg's start, and only then does the shortest path draw itself
function drawTrip(ctx, trip, time) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  trip.legs.forEach((leg, k) => {
    const { order, dist, path } = leg.search;
    const newest = k === trip.legs.length - 1;
    const age = time - leg.at;
    if (newest) {
      order.forEach((name, j) => {
        const f = (age - j * SEARCH_STEP) / 0.45;
        if (f < 0) return;
        const r = ROOMS[name];
        if (f < 1) {
          ctx.strokeStyle = `rgba(${C.main}, ${1 - f})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 16 + 60 * f, 0, Math.PI * 2);
          ctx.stroke();
        }
        badge(ctx, r.x + 30, r.y - 24, String(dist[name]), false);
      });
    }
    // the path starts drawing as soon as the last room is settled, led by a dot at constant speed
    const f = newest ? Math.min(1, (age - order.length * SEARCH_STEP) / PATH_TIME) : 1;
    if (f <= 0) return;
    ctx.strokeStyle = `rgb(${C.main})`;
    ctx.lineWidth = 5;
    if (f < 1) {
      trace(ctx, leg.points, f);
      const head = alongPath(leg.points, f);
      ctx.fillStyle = NIGHT.text;
      ctx.beginPath();
      ctx.arc(head[0], head[1], 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      leg.points.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }
  });
  trip.stops.forEach((name, k) => badge(ctx, ROOMS[name].x, ROOMS[name].y, k ? String(k) : "S", true));
}

// the visitor on the walk: marching dashes for the route so far, a light dot with two arcs in orbit, and a tag
function drawVisitor(ctx, minute, now, time) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 7]);
  ctx.lineDashOffset = -time * 22;
  for (const leg of walk.legs) {
    if (minute <= leg.leave) continue;
    const f = Math.min(1, (minute - leg.leave) / Math.max(1, leg.arrive - leg.leave));
    const age = Math.max(0, Math.min(1, (minute - leg.arrive) / 90));
    ctx.strokeStyle = `rgba(${C.hot}, ${0.95 - 0.6 * age})`;
    trace(ctx, leg.points, f);
  }
  ctx.setLineDash([]);

  const [vx, vy] = now.pos;
  const pulse = (time * 0.8) % 1;
  ctx.strokeStyle = `rgba(${C.hot}, ${0.5 * (1 - pulse)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(vx, vy, 8 + 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = NIGHT.text;
  ctx.beginPath();
  ctx.arc(vx, vy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = NIGHT.text;
  ctx.lineWidth = 2;
  for (const a of [time * 3, time * 3 + Math.PI]) {
    ctx.beginPath();
    ctx.arc(vx, vy, 13, a, a + 1.8);
    ctx.stroke();
  }
  const scoring = now.inside && minute >= now.leg.start;
  const tag = now.moving ? `shortest path · ${now.leg.item.travel} min` : scoring ? `+${now.leg.item.value} pts` : "";
  if (tag) {
    ctx.font = `700 11px ${MONO}`;
    ctx.textAlign = "center";
    const half = ctx.measureText(tag).width / 2 + 7;
    ctx.fillStyle = NIGHT.text;
    ctx.beginPath();
    ctx.roundRect(vx - half, vy - 40, half * 2, 18, 3);
    ctx.fill();
    ctx.fillStyle = NIGHT.wall;
    ctx.fillText(tag, vx, vy - 27);
  }
}

// hovering a room opens a card: what is in it, and which of those the plan took
function drawRoomCard(scene, ctx) {
  const room = ROOMS[scene.hover];
  if (!room) return;
  const planned = new Set(walk.legs.map(leg => leg.item.name));
  const lines = data.activities.filter(a => a.location === scene.hover)
    .map(a => `${planned.has(a.name) ? "✓" : "·"} ${a.name} · ${a.duration} min · ${a.score} pts`);
  if (!lines.length) lines.push("No activities here");
  if (scene.hero) lines.push("click: route here from your last stop");
  ctx.font = `600 11px ${MONO}`;
  const width = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24;
  const height = 30 + lines.length * 16;
  const mx = scene.fit.ox + room.x * scene.fit.sc;
  const my = scene.fit.oy + (room.y - 44) * scene.fit.sc;
  const x = Math.min(scene.w - width - 8, Math.max(8, mx - width / 2));
  const y = Math.max(8, my - height);
  ctx.fillStyle = NIGHT.text;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 3);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.fillStyle = NIGHT.floor;
  ctx.font = `700 12px ${MONO}`;
  ctx.fillText(scene.hover, x + 12, y + 20);
  ctx.font = `600 11px ${MONO}`;
  lines.forEach((l, k) => {
    ctx.fillStyle = l[0] === "✓" ? "#f6c3a6" : "#d9c7ba";
    ctx.fillText(l, x + 12, y + 40 + k * 16);
  });
}

// the room under a pointer event, or null
function roomUnder(scene, e) {
  const x = (e.offsetX - scene.fit.ox) / scene.fit.sc, y = (e.offsetY - scene.fit.oy) / scene.fit.sc;
  scene.ctx.save();
  scene.ctx.setTransform(1, 0, 0, 1, 0, 0);
  const name = Object.keys(ROOMS).find(room => scene.ctx.isPointInPath(ROOMS[room].path, x, y)) || null;
  scene.ctx.restore();
  return name;
}

// hover a room on either museum canvas; on the top map a click adds it to the trip
function watchRooms(canvas) {
  const redraw = () => {
    const scene = canvas.scene;
    if (scene) reduceMotion ? drawMuseum(scene) : scene.wake();
  };
  canvas.addEventListener("pointermove", e => {
    const scene = canvas.scene;
    if (!scene || !scene.fit) return;
    scene.hover = roomUnder(scene, e);
    canvas.style.cursor = scene.hover && scene.hero ? "pointer" : "default";
    redraw();
  });
  canvas.addEventListener("pointerleave", () => {
    if (canvas.scene) canvas.scene.hover = null;
    redraw();
  });
  canvas.addEventListener("click", e => {
    const scene = canvas.scene;
    const room = scene && scene.hero && scene.fit && roomUnder(scene, e);
    if (room) tripClick(scene, room);
    redraw();
  });
}

// the day as a vertical strip: hour ticks, one block per activity, the current minute as a line
function drawDayStrip(ctx, x, y, width, height, minute) {
  const span = Math.max(60, walk.t1 - walk.t0);
  const Y = m => y + ((m - walk.t0) / span) * height;
  ctx.strokeStyle = NIGHT.line;
  ctx.lineWidth = 1;
  ctx.fillStyle = NIGHT.dim;
  ctx.font = "600 10px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "right";
  for (let m = Math.ceil(walk.t0 / 60) * 60; m <= walk.t1; m += 60) {
    ctx.beginPath();
    ctx.moveTo(x, Y(m));
    ctx.lineTo(x + width, Y(m));
    ctx.stroke();
    ctx.fillText(fmt(m), x - 6, Y(m) + 3);
  }
  for (const leg of walk.legs) {
    const top = Y(leg.start), bottom = Y(leg.end);
    const live = minute >= leg.start && minute < leg.end;
    const past = minute >= leg.end;
    ctx.fillStyle = `rgba(${live || past ? C.main : C.dim}, ${live ? 0.9 : 0.3})`;
    ctx.fillRect(x + 8, top, width - 16, Math.max(2, bottom - top));
    if (leg.arrive > leg.leave) {
      ctx.fillStyle = "rgba(61, 47, 42, 0.18)";
      ctx.fillRect(x + width / 2 - 1, Y(leg.leave), 2, Y(leg.arrive) - Y(leg.leave));
    }
  }
  ctx.strokeStyle = NIGHT.warm;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 2, Y(minute));
  ctx.lineTo(x + width + 2, Y(minute));
  ctx.stroke();
}

// ----- the knapsack landscape -----

const terrain = { scene: null, dp: null, yaw: -0.5, pitch: 0.72, dragging: null };

function startTerrain(plan) {
  const dp = plan.dp;
  terrain.dp = dp;
  terrain.items = dp.items.map(id => cand[id]);
  terrain.top = dp.table[dp.items.length][dp.capacity] || 1;
  // every 5 minutes is one column; the table already has one entry per minute
  terrain.cols = [];
  for (let c = 0; c <= dp.capacity; c += 5) terrain.cols.push(c);
  // the fill (one second per row, min 6 s) then the backtrack (0.45 s per step), then a hold
  terrain.fillTime = Math.max(6, Math.min(14, dp.items.length * 0.8));
  terrain.walkTime = dp.path.length * 0.45;
  terrain.scene = makeScene(byId("terrain-canvas"), drawTerrain, terrain.fillTime + terrain.walkTime + 3);
  terrain.scene.button = byId("terrain-play");
  byId("terrain-picks").innerHTML = terrain.items.map((a, i) => `<li data-row="${i + 1}"><b>${a.name}</b><small>${a.duration} min · ${a.value} pts</small></li>`).join("");
  terrain.scene.resize();
  terrain.touched = false;
  arm(terrain.scene);
}

// project a table cell (row i, column index k, height v) to the canvas
function project(scene, i, k, v) {
  const n = terrain.dp.items.length;
  const m = terrain.cols.length;
  const size = Math.min(scene.w, scene.h * 1.4) * 0.8;
  const x = (k / (m - 1) - 0.5) * size * 0.95;
  const z = (i / Math.max(1, n) - 0.5) * size * 0.55;
  const y = -(v / terrain.top) * size * 0.34;
  const cy = Math.cos(terrain.yaw), sy = Math.sin(terrain.yaw);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const cp = Math.cos(terrain.pitch), sp = Math.sin(terrain.pitch);
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const persp = 1 / (1 + z2 / (size * 2.2));
  // the whole table hovers: a slow bob on top of the projection
  // nudged right on wide canvases to leave room for the ridge names
  const cx = scene.w / 2 + (scene.w >= 700 ? 60 : 0);
  return [cx + x1 * persp, scene.h * 0.56 + y2 * persp + 5 * Math.sin(scene.clock * 1.2), z2];
}

function drawTerrain(scene) {
  const { ctx, w, h } = scene;
  const dp = terrain.dp;
  const n = dp.items.length;
  const cols = terrain.cols;
  const t = scene.t;
  // it turns itself slowly until the viewer takes over by dragging
  if (!terrain.touched) terrain.yaw = -0.5 + 0.22 * Math.sin(scene.clock * 0.35);
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(w / 2, h * 0.5, 20, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  bg.addColorStop(0, "#fbf5ee");
  bg.addColorStop(1, NIGHT.wall);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (n === 0) {
    ctx.fillStyle = NIGHT.dim;
    ctx.font = "16px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("No activities matched, so the table is empty.", w / 2, h / 2);
    return;
  }

  // how many rows have risen, and how far along the backtrack we are
  const risen = Math.min(n, (t / terrain.fillTime) * n);
  const walkStep = Math.max(0, (t - terrain.fillTime) / 0.45);
  const visited = dp.path.slice(0, Math.floor(walkStep));
  const takenRows = {};
  const seenRows = {};
  for (const s of visited) {
    seenRows[s.i] = true;
    if (s.take) takenRows[s.i] = true;
  }

  // floor grid: one line per hour across the table, and the back and front edges
  ctx.strokeStyle = "rgba(61, 47, 42, 0.18)";
  ctx.lineWidth = 1;
  for (let k = 0; k < cols.length; k += 12) {
    const a = project(scene, 0, k, 0), b = project(scene, n, k, 0);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  for (const i of [0, n]) {
    const a = project(scene, i, 0, 0), b = project(scene, i, cols.length - 1, 0);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  // draw ridges back to front so nearer ones overlap
  const order = [];
  for (let i = 0; i <= n; i++) order.push(i);
  order.sort((a, b) => project(scene, b, 0, 0)[2] - project(scene, a, 0, 0)[2]);

  for (const i of order) {
    const rise = i === 0 ? 1 : ease(Math.min(1, Math.max(0, risen - (i - 1))));
    if (rise <= 0) continue;
    const pts = cols.map((c, k) => project(scene, i, k, dp.table[i][c] * rise));
    const base = cols.map((c, k) => project(scene, i, k, 0));
    const taken = takenRows[i];
    const skipped = seenRows[i] && !taken;
    // filled ridge
    ctx.beginPath();
    ctx.moveTo(base[0][0], base[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(base[base.length - 1][0], base[base.length - 1][1]);
    ctx.closePath();
    const shade = 0.55 + 0.45 * (i / n);
    // each face is lit from the crest down, like a hillside at dusk
    const crest = Math.min(...pts.map(p => p[1]));
    const foot = Math.max(...base.map(p => p[1]));
    const face = ctx.createLinearGradient(0, crest, 0, foot);
    if (taken) {
      face.addColorStop(0, `rgb(${C.main})`);
      face.addColorStop(1, "#f0c3ab");
    } else {
      face.addColorStop(0, skipped ? "#f3e9df" : "#c9d8c4");
      face.addColorStop(1, NIGHT.wall);
    }
    ctx.fillStyle = face;
    ctx.fill();
    ctx.strokeStyle = taken ? `rgb(${C.main})` : `rgba(${C.hot}, ${skipped ? 0.2 : 0.3 + 0.6 * shade})`;
    ctx.lineWidth = taken ? 2 : 1.2;
    ctx.beginPath();
    for (const [k, p] of pts.entries()) k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    ctx.stroke();
    // name each ridge at its left end, marked once the backtrack has decided it
    if (i > 0 && w >= 700) {
      ctx.fillStyle = taken ? `rgb(${C.main})` : skipped ? NIGHT.dim : NIGHT.text;
      ctx.font = `600 10px ${MONO}`;
      ctx.textAlign = "right";
      ctx.globalAlpha = rise;
      ctx.fillText((taken ? "✓ " : skipped ? "✕ " : "") + terrain.items[i - 1].name.slice(0, 26), base[0][0] - 10, base[0][1] + 3);
      ctx.globalAlpha = 1;
    }
  }

  // backtrack: a glowing cord through the visited cells, and a lantern at the current one
  if (visited.length) {
    ctx.save();
    ctx.shadowColor = NIGHT.glow;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = NIGHT.warm;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    visited.forEach((s, k) => {
      const p = cellPoint(scene, s);
      k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    });
    // partial segment to the next step
    const next = dp.path[visited.length];
    if (next) {
      const a = cellPoint(scene, visited[visited.length - 1]);
      const b = cellPoint(scene, next);
      const f = ease(walkStep - visited.length);
      ctx.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f));
    }
    ctx.stroke();
    const head = next ? (() => { const a = cellPoint(scene, visited[visited.length - 1]); const b = cellPoint(scene, next); const f = ease(walkStep - visited.length); return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)]; })() : cellPoint(scene, visited[visited.length - 1]);
    const halo = ctx.createRadialGradient(head[0], head[1], 1, head[0], head[1], 22);
    halo.addColorStop(0, "rgba(255, 247, 230, 0.95)");
    halo.addColorStop(1, "rgba(61, 47, 42, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (t >= terrain.fillTime && dp.path.length) {
    // the start of the backtrack: the summit
    const p = cellPoint(scene, { i: n, c: dp.capacity });
    const halo = ctx.createRadialGradient(p[0], p[1], 1, p[0], p[1], 26);
    halo.addColorStop(0, "rgba(255, 247, 230, 0.95)");
    halo.addColorStop(1, "rgba(61, 47, 42, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // axis labels
  ctx.fillStyle = NIGHT.dim;
  ctx.font = "600 11px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  // the time axis is labelled along whichever edge faces the viewer
  const front = project(scene, 0, 0, 0)[1] > project(scene, n, 0, 0)[1] ? 0 : n;
  const a0 = project(scene, front, 0, 0), a1 = project(scene, front, cols.length - 1, 0);
  ctx.fillText("0 min", a0[0], a0[1] + 18);
  ctx.fillText(`${dp.capacity} min`, a1[0], a1[1] + 18);
  ctx.fillText("time budget →", (a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2 + 18);
  const top = project(scene, n, cols.length - 1, dp.table[n][dp.capacity]);
  if (risen >= n) {
    ctx.fillStyle = NIGHT.warm;
    ctx.font = "600 13px ui-monospace, Menlo, monospace";
    ctx.fillText(`${dp.table[n][dp.capacity]} pts`, top[0] + 28, top[1] - 6);
  }

  // HUD and picks list
  const row = Math.min(n, Math.max(1, Math.ceil(risen)));
  let readout = `row ${row} of ${n}`;
  let status = risen < n ? `Raising ${terrain.items[row - 1].name}` : "Table complete";
  if (visited.length) {
    const s = visited[visited.length - 1];
    readout = `dp[${s.i}][${s.c}] = ${dp.table[s.i][s.c]}`;
    const a = terrain.items[s.i - 1];
    status = s.take ? `Taken: ${a.name} (value changed from the row above)` : `Skipped: ${a.name} (same value as the row above)`;
  }
  if (t >= scene.length - 0.05) status = `${Object.keys(takenRows).length} activities taken · ${dp.table[n][dp.capacity]} points`;
  byId("terrain-readout").textContent = readout;
  byId("terrain-status").textContent = status;
  for (const li of byId("terrain-picks").children) {
    li.classList.toggle("taken", Boolean(takenRows[li.dataset.row]));
    li.classList.toggle("seen", visited.some(s => s.i === +li.dataset.row));
  }
}

function cellPoint(scene, step) {
  const k = Math.round(step.c / 5);
  return project(scene, step.i, k, terrain.dp.table[step.i][terrain.cols[k]]);
}

// drag to orbit the landscape
byId("terrain-canvas").addEventListener("pointerdown", e => {
  terrain.touched = true;
  terrain.dragging = { x: e.clientX, y: e.clientY, yaw: terrain.yaw, pitch: terrain.pitch };
  e.target.setPointerCapture(e.pointerId);
});
byId("terrain-canvas").addEventListener("pointermove", e => {
  if (!terrain.dragging) return;
  terrain.yaw = terrain.dragging.yaw + (e.clientX - terrain.dragging.x) * 0.006;
  terrain.pitch = Math.min(1.4, Math.max(0.35, terrain.dragging.pitch + (e.clientY - terrain.dragging.y) * 0.005));
  if (!terrain.scene.playing) drawTerrain(terrain.scene);
});
byId("terrain-canvas").addEventListener("pointerup", () => { terrain.dragging = null; });
watchRooms(byId("museum-canvas"));
watchRooms(byId("walk-canvas"));
byId("trip-reset").addEventListener("click", () => {
  const scene = byId("museum-canvas").scene;
  if (!scene) return;
  scene.trip = newTrip();
  showTrip(scene.trip);
  reduceMotion ? drawMuseum(scene) : scene.wake();
});
byId("walk-play").addEventListener("click", () => walk.scene && walk.scene.setPlaying(!walk.scene.playing));
byId("walk-restart").addEventListener("click", () => walk.scene && walk.scene.restart());
byId("terrain-play").addEventListener("click", () => terrain.scene && terrain.scene.setPlaying(!terrain.scene.playing));
byId("terrain-restart").addEventListener("click", () => terrain.scene && terrain.scene.restart());

// the header status line types itself
let typing = 0;
function say(text) {
  const el = byId("sys");
  clearInterval(typing);
  let k = 0;
  typing = setInterval(() => {
    el.textContent = text.slice(0, ++k);
    if (k >= text.length) clearInterval(typing);
  }, 18);
}

byId("hours").addEventListener("input", updateTimeLimit);
byId("start-time").addEventListener("change", updateTimeLimit);
byId("break").addEventListener("change", updateTimeLimit);
byId("category-list").addEventListener("change", renderActivities);
byId("activity-list").addEventListener("change", event => {
  priority[event.target.dataset.id] = Number(event.target.value);
  renderActivities();
});
byId("plan-form").addEventListener("submit", generatePlan);
byId("route-form").addEventListener("submit", findRoute);
loadData();
