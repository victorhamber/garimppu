import sys

import httpx

B = "http://localhost:8001/api"
c = httpx.Client(base_url=B, timeout=120)
fails = []


def check(label, r, ok=(200, 201, 204)):
    good = r.status_code in ok
    if not good:
        fails.append(label)
    body = r.text[:160].replace("\n", " ")
    print(f"{'OK ' if good else 'ERR'} {r.status_code} {label} :: {body}")
    return r


check("login", c.post("/auth/login", json={"email": "contato@victorhamber.com", "password": sys.argv[1]}))
check("me", c.get("/auth/me"))
check("stats", c.get("/stats"))
check("niches", c.get("/niches"))
for scope in ("mine", "all"):
    for sort in ("score", "duplicates", "days_active", "growth", "recent"):
        check(f"creatives {scope} {sort}", c.get("/creatives", params={"scope": scope, "sort": sort, "limit": 5}))
    for sort in ("score", "advertisers", "ads", "creatives", "days_active", "recent"):
        check(f"offers {scope} {sort}", c.get("/offers", params={"scope": scope, "sort": sort, "limit": 5}))
check("creatives q", c.get("/creatives", params={"q": "curso", "scope": "all", "min_duplicates": 2, "active_only": True}))
check("offers q", c.get("/offers", params={"q": "hotmart", "scope": "all", "kind": "infoproduto", "min_advertisers": 2}))
check("csv", c.get("/creatives/export.csv", params={"scope": "all"}))

cr = c.get("/creatives", params={"scope": "all", "limit": 1}).json()
items = cr["items"] if isinstance(cr, dict) else cr
cid = items[0]["id"]
detail = check("creative detail", c.get(f"/creatives/{cid}")).json()
page_id = (detail.get("page") or {}).get("page_id") or (detail.get("ads") or [{}])[0].get("page_id")
if page_id:
    check("page", c.get(f"/pages/{page_id}"))

searches = check("searches", c.get("/searches")).json()
sid = searches[0]["id"]
check("search detail", c.get(f"/searches/{sid}"))
runs = check("search runs", c.get(f"/searches/{sid}/runs")).json()
if runs:
    check("run", c.get(f"/runs/{runs[0]['id']}"))
check("creatives by search", c.get("/creatives", params={"search_id": sid}))
check("offers by search", c.get("/offers", params={"search_id": sid}))

cols = check("collections", c.get("/collections")).json()
new = check("collection create", c.post("/collections", json={"name": "Teste PG"})).json()
check("collection add item", c.post(f"/collections/{new['id']}/items", json={"creative_id": cid}))
check("collection detail", c.get(f"/collections/{new['id']}"))
check("creatives in collection", c.get("/creatives", params={"collection_id": new["id"]}))
check("collection dup name", c.post("/collections", json={"name": "Teste PG"}), ok=(400, 409))
check("collection delete", c.delete(f"/collections/{new['id']}"))

check("admin users", c.get("/admin/users", params={"q": "victor"}))
check("admin events", c.get("/admin/events"))
check("admin settings", c.get("/admin/settings"))
check("admin webhook", c.get("/admin/webhook"))
check("admin email", c.get("/admin/email"))
lic = check("license create", c.post("/admin/users", json={"email": "pgtest@example.com", "name": "PG"})).json()
uid = (lic.get("user") or lic).get("id")
check("license patch", c.patch(f"/admin/users/{uid}", json={"is_active": False}))
check("license events", c.get(f"/admin/users/{uid}/events"))
check("license delete", c.delete(f"/admin/users/{uid}"))

print("\nFALHAS:", fails or "nenhuma")
