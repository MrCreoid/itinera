import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import algorithms

FOLDER = os.path.dirname(os.path.abspath(__file__))
# only these files are served, so the Python sources stay private
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/script.js": ("script.js", "text/javascript; charset=utf-8"),
}


def read_plan(data):
    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object.")

    start_loc = data.get("start_location")
    if start_loc not in algorithms.LOCATIONS:
        raise ValueError("Choose a valid starting location.")

    start_time = algorithms.to_min(data.get("start_time", ""))
    if not algorithms.OPEN_MIN <= start_time < algorithms.CLOSE_MIN:
        raise ValueError("The museum is open from %s to %s." % (algorithms.OPEN, algorithms.CLOSE))

    hours = data.get("hours")
    if type(hours) not in (int, float) or not 0.5 <= hours <= 12:
        raise ValueError("Available time must be between 0.5 and 12 hours.")
    minutes = round(hours * 60)
    if start_time + minutes > algorithms.CLOSE_MIN:
        raise ValueError("The museum closes at %s. Choose less time or an earlier start." % algorithms.CLOSE)

    categories = data.get("categories")
    if not isinstance(categories, list) or any(c not in algorithms.CATEGORIES for c in categories):
        raise ValueError("Invalid list of categories.")

    raw = data.get("priority", {})
    if not isinstance(raw, dict):
        raise ValueError("Priorities must be an object.")
    priority = {}
    for key, value in raw.items():
        if not key.isdigit() or type(value) is not int or not 0 <= value <= 3:
            raise ValueError("Priorities must be whole numbers from 0 to 3.")
        priority[int(key)] = value

    pause = None
    raw = data.get("break")
    if raw is not None:
        if not isinstance(raw, dict) or type(raw.get("id")) is not int or raw["id"] not in algorithms.BREAKS:
            raise ValueError("Choose a valid café break.")
        act = algorithms.ACTIVITIES[raw["id"] - 1]
        at = algorithms.to_min(raw.get("time", ""))
        walk_in = algorithms.ROUTES[(start_loc, act["location"])][0]
        if at < start_time + walk_in or at + act["duration"] + walk_in > start_time + minutes:
            raise ValueError("Your café break does not fit inside your visit. Pick another time.")
        pause = (raw["id"], at)

    return start_loc, start_time, minutes, priority, categories, pause


class Handler(BaseHTTPRequestHandler):
    def send(self, status, body, kind):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, obj):
        self.send(status, json.dumps(obj).encode(), "application/json")

    def do_GET(self):
        url = urlparse(self.path)
        if url.path in STATIC:
            name, kind = STATIC[url.path]
            with open(os.path.join(FOLDER, name), "rb") as f:
                self.send(200, f.read(), kind)
        elif url.path == "/api/data":
            self.send_json(200, {
                "activities": algorithms.ACTIVITIES, "locations": algorithms.LOCATIONS,
                "categories": algorithms.CATEGORIES, "paths": algorithms.PATHS,
                "open": algorithms.OPEN_MIN, "close": algorithms.CLOSE_MIN,
            })
        elif url.path == "/api/route":
            query = parse_qs(url.query)
            a = query.get("from", [""])[0]
            b = query.get("to", [""])[0]
            if a not in algorithms.LOCATIONS or b not in algorithms.LOCATIONS:
                self.send_json(400, {"error": "Unknown location."})
                return
            minutes, path = algorithms.ROUTES[(a, b)]
            self.send_json(200, {"minutes": minutes, "path": path})
        else:
            self.send_json(404, {"error": "Not found."})

    def do_POST(self):
        if self.path != "/api/plan":
            self.send_json(404, {"error": "Not found."})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 20000:
                raise ValueError("Request body is missing or too large.")
            args = read_plan(json.loads(self.rfile.read(length)))
        except ValueError as err:  # also covers bad JSON and bad text encoding
            self.send_json(400, {"error": str(err)})
            return
        self.send_json(200, algorithms.make_plans(*args))


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("Server running at http://localhost:8000 (press Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
