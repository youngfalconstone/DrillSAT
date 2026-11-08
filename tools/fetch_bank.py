"""Fetch full question content (stem HTML, choices, keys, rationale) for every question ID
listed in the College Board question-bank PDFs, from College Board's public question-bank API.

Usage: python tools/fetch_bank.py <math_list.json> <rw_list.json> <out_dir>
Resumable: already-fetched ids are skipped.
"""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-question"
DISCLOSED = "https://saic.collegeboard.org/disclosed/{ibn}.json"

def fetch(item, out_dir):
    qid = item["questionId"]
    path = os.path.join(out_dir, qid + ".json")
    if os.path.exists(path):
        return qid, "cached"
    last_err = None
    for attempt in range(4):
        try:
            if item.get("external_id"):
                req = urllib.request.Request(API, data=json.dumps({"external_id": item["external_id"]}).encode(),
                                             headers={"Content-Type": "application/json"}, method="POST")
            else:
                req = urllib.request.Request(DISCLOSED.format(ibn=item["ibn"]))
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.loads(r.read().decode("utf-8"))
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"meta": item, "content": data}, f)
            return qid, "ok"
        except Exception as e:  # noqa
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    return qid, f"FAILED {last_err}"

def main():
    math_list, rw_list, out_dir = sys.argv[1:4]
    items = json.load(open(math_list)) + json.load(open(rw_list))
    os.makedirs(out_dir, exist_ok=True)
    ok = cached = failed = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(fetch, it, out_dir) for it in items]
        for i, f in enumerate(as_completed(futs)):
            qid, status = f.result()
            if status == "ok": ok += 1
            elif status == "cached": cached += 1
            else:
                failed += 1; print(qid, status, flush=True)
            if (i + 1) % 200 == 0:
                print(f"{i+1}/{len(items)} ok={ok} cached={cached} failed={failed}", flush=True)
    print(f"done ok={ok} cached={cached} failed={failed}")

if __name__ == "__main__":
    main()
