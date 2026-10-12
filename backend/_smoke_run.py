import sys
import time

import httpx

c = httpx.Client(base_url="http://localhost:8001/api", timeout=120)
c.post("/auth/login", json={"email": "contato@victorhamber.com", "password": sys.argv[1]}).raise_for_status()
before = c.get("/stats").json()
r = c.post("/searches", json={"term": "mentoria online", "country": "BR", "media_type": "all", "max_ads": 20})
print(r.status_code, r.text[:200])
sid = r.json()["id"]
runs = c.get(f"/searches/{sid}/runs").json()
if not runs:
    print(c.post(f"/searches/{sid}/run").text[:200])
for _ in range(60):
    runs = c.get(f"/searches/{sid}/runs").json()
    if runs and runs[0]["status"] in ("done", "failed", "error"):
        break
    time.sleep(5)
print({k: runs[0][k] for k in ("status", "ads_found", "creatives_found", "error")})
print("antes", before, "depois", c.get("/stats").json())
print("criativos da busca", c.get("/creatives", params={"search_id": sid}).json()["total"])
print("ofertas da busca", c.get("/offers", params={"search_id": sid}).json()["total"])
