import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import algorithms as A
from server import Handler


def act(id, value, duration, start=None, location="Museum Café"):
    return {"id": id, "name": "A%d" % id, "category": "Food", "location": location, "value": value,
            "duration": duration, "start": start, "end": start + duration if start is not None else None}


class AlgorithmTests(unittest.TestCase):
    def test_greedy_and_dp_differ(self):
        acts = [act(1, 10, 60), act(2, 8, 50), act(3, 8, 50)]
        order, _ = A.build_itinerary(A.greedy_order(acts, False), "Museum Café", 0, 100)
        self.assertEqual([a["id"] for a in order], [1])
        value, picked = A.knapsack(acts, 100)
        self.assertEqual(value, 16)
        self.assertEqual([a["id"] for a in picked], [2, 3])

    def test_greedy_ratio_order(self):
        acts = [act(1, 10, 100), act(2, 3, 10)]
        self.assertEqual([a["id"] for a in A.greedy_order(acts, True)], [2, 1])

    def test_binary_search(self):
        ends = [100, 200, 300, 400]
        self.assertEqual(A.last_compatible(ends, 250, 4), 1)
        self.assertEqual(A.last_compatible(ends, 300, 4), 2)
        self.assertEqual(A.last_compatible(ends, 50, 4), -1)
        self.assertEqual(A.last_compatible(ends, 1000, 2), 1)

    def test_weighted_interval_no_overlap(self):
        acts = [act(1, 5, 60, 0), act(2, 8, 60, 30), act(3, 4, 60, 60), act(4, 6, 30, 90)]
        value, picked = A.weighted_interval(acts)
        self.assertEqual(value, 14)
        self.assertEqual([a["id"] for a in picked], [2, 4])
        for x, y in zip(picked, picked[1:]):
            self.assertLessEqual(x["end"], y["start"])

    def test_dijkstra(self):
        minutes, path = A.ROUTES[("Museum Café", "Modern Art Wing")]
        self.assertEqual(minutes, 8)
        self.assertEqual(path, ["Museum Café", "Entrance Hall", "Central Atrium", "Renaissance Gallery", "Modern Art Wing"])
        self.assertEqual(A.ROUTES[("Museum Café", "Museum Café")], (0, ["Museum Café"]))

    def test_itineraries_are_valid(self):
        for start_loc in A.LOCATIONS:
            for start in (600, 720, 900):
                for hours in (1, 3, 6, 8):
                    minutes = hours * 60
                    if start + minutes > A.CLOSE_MIN:
                        continue
                    plans = A.make_plans(start_loc, start, minutes, {}, A.CATEGORIES)["plans"]
                    for plan in plans.values():
                        self.check_plan(plan, start_loc, start, minutes)

    def check_plan(self, plan, start_loc, start, minutes):
        clock, loc, seen = start, start_loc, set()
        for step in plan["items"]:
            self.assertNotIn(step["id"], seen)
            seen.add(step["id"])
            self.assertEqual(step["travel"], A.ROUTES[(loc, step["location"])][0])
            self.assertGreaterEqual(step["start"], clock + step["travel"])
            if step["fixed"]:
                original = A.ACTIVITIES[step["id"] - 1]
                self.assertEqual(step["start"], original["start"])
            clock, loc = step["end"], step["location"]
        self.assertLessEqual(clock, start + minutes)
        self.assertEqual(plan["totals"]["used"], clock - start if plan["items"] else 0)

    def test_results_are_deterministic(self):
        first = A.make_plans("Entrance Hall", 600, 360, {}, A.CATEGORIES)
        second = A.make_plans("Entrance Hall", 600, 360, {}, A.CATEGORIES)
        self.assertEqual(first, second)

    def test_dp_trace(self):
        result = A.make_plans("Entrance Hall", 600, 360, {}, A.CATEGORIES)
        dp = result["plans"]["hybrid"]["dp"]
        taken = [dp["items"][s["i"] - 1] for s in dp["path"] if s["take"]]
        value = sum(c["value"] for c in result["candidates"] if c["id"] in taken)
        self.assertEqual(value, dp["table"][-1][dp["capacity"]])
        self.assertEqual(len(dp["table"]), len(dp["items"]) + 1)

    def test_skip_and_categories(self):
        plans = A.make_plans("Entrance Hall", 600, 480, {20: 0}, ["Food & Shop"])["plans"]
        for plan in plans.values():
            names = [s["name"] for s in plan["items"]]
            self.assertNotIn("Lunch at the Café", names)
            self.assertEqual(sorted(names), ["Coffee Break", "Museum Shop"])


    def test_cafe_break_is_in_every_plan(self):
        plans = A.make_plans("Entrance Hall", 600, 360, {}, A.CATEGORIES, (20, 780))["plans"]
        for plan in plans.values():
            lunch = [s for s in plan["items"] if s["id"] == 20]
            self.assertEqual([(s["start"], s["end"]) for s in lunch], [(780, 820)])
            for s in plan["items"]:  # nothing overlaps the break
                self.assertTrue(s["id"] == 20 or s["end"] <= 780 or s["start"] >= 820)
            last = plan["items"][-1]
            self.assertLessEqual(last["end"] + plan["totals"]["exit"], 960)
            self.assertEqual(plan["totals"]["exit"], A.ROUTES[(last["location"], "Entrance Hall")][0])


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.url = "http://127.0.0.1:%d" % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def post(self, body):
        req = Request(self.url + "/api/plan", data=body, headers={"Content-Type": "application/json"})
        try:
            with urlopen(req) as res:
                return res.status, json.loads(res.read())
        except HTTPError as err:
            return err.code, json.loads(err.read())

    def test_static_and_data(self):
        with urlopen(self.url + "/") as res:
            self.assertIn(b'id="plan-form"', res.read())
        with urlopen(self.url + "/api/data") as res:
            self.assertEqual(len(json.loads(res.read())["activities"]), len(A.ACTIVITIES))

    def test_source_files_not_served(self):
        with self.assertRaises(HTTPError):
            urlopen(self.url + "/server.py")

    def test_plan_matches_python(self):
        body = {"hours": 6, "start_time": "10:00", "start_location": "Entrance Hall",
                "categories": A.CATEGORIES, "priority": {"1": 3}}
        status, data = self.post(json.dumps(body).encode())
        self.assertEqual(status, 200)
        expected = A.make_plans("Entrance Hall", 600, 360, {1: 3}, A.CATEGORIES)
        self.assertEqual(data, json.loads(json.dumps(expected)))

    def test_invalid_inputs(self):
        good = {"hours": 6, "start_time": "10:00", "start_location": "Entrance Hall", "categories": [], "priority": {}}
        bad = [
            dict(good, hours=-1), dict(good, hours="6"), dict(good, hours=True),
            dict(good, start_time="25:00"), dict(good, start_time="ab"),
            dict(good, start_location="Moon"), dict(good, categories=["Nope"]),
            dict(good, priority={"1": 9}), [1, 2],
            dict(good, start_time="09:00"), dict(good, start_time="18:00", hours=1),
            dict(good, start_time="17:00", hours=2),
            dict(good, **{"break": {"id": 1, "time": "13:00"}}), dict(good, **{"break": {"id": 20, "time": "09:00"}}),
            dict(good, **{"break": {"id": 20, "time": "15:50"}}), dict(good, **{"break": "lunch"}),
        ]
        for body in bad:
            status, data = self.post(json.dumps(body).encode())
            self.assertEqual(status, 400, body)
            self.assertIn("error", data)
        self.assertEqual(self.post(b"{not json")[0], 400)
        status, data = self.post(json.dumps(good).encode())
        self.assertEqual(status, 200)
        self.assertEqual(data["plans"]["hybrid"]["items"], [])

    def test_route_endpoint(self):
        with urlopen(self.url + "/api/route?from=Entrance%20Hall&to=Modern%20Art%20Wing") as res:
            data = json.loads(res.read())
        self.assertEqual(data["minutes"], A.ROUTES[("Entrance Hall", "Modern Art Wing")][0])
        with self.assertRaises(HTTPError):
            urlopen(self.url + "/api/route?from=x&to=y")


if __name__ == "__main__":
    unittest.main()
