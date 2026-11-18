"""Refresh the private Quark book directory using only share metadata."""
import collections
import getpass
import gzip
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

LIMITS = {".mobi": 10 << 20, ".epub": 10 << 20, ".txt": 2 << 20}
API = "https://drive-pc.quark.cn/1/clouddrive/share/sharepage/"


def request(endpoint, params, body=None):
    url = API + endpoint + "?" + urllib.parse.urlencode({"pr": "ucpro", "fr": "pc", **params})
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"Referer": "https://pan.quark.cn/", "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                payload = json.load(response)
            return payload["data"]
        except (OSError, KeyError, ValueError):
            if attempt == 2:
                raise RuntimeError("夸克未返回完整目录，保留现有索引") from None
            time.sleep(attempt + 1)


def share_session(share):
    match = re.fullmatch(r"https://pan\.quark\.cn/s/([A-Za-z0-9]+)", share)
    if not match:
        raise ValueError("请输入夸克公开分享页地址")
    share_id = match[1]
    token = request("token", {}, {"pwd_id": share_id, "passcode": ""})["stoken"]
    return {"pwd_id": share_id, "stoken": token}


def attach_single_shares(files, links):
    by_file = {(row[0], row[2]): row for row in files}
    for number, line in enumerate(links, start=1):
        url = line.strip()
        if not url:
            continue
        session = share_session(url)
        items = request("detail", {**session, "pdir_fid": "0", "_page": 1, "_size": 100})["list"]
        if len(items) != 1 or items[0]["dir"]:
            raise ValueError(f"单本分享清单第 {number} 行不是单文件分享")
        item = items[0]
        row = by_file.get((item["file_name"], item["size"]))
        if row is None:
            raise ValueError(f"单本分享清单第 {number} 行的文件名或大小与收录版本不符")
        if len(row) > 5:
            raise ValueError(f"单本分享清单第 {number} 行重复指定了同一版本")
        # First five fields are the filename, folder, size, note and parent ID.
        row.extend([None] * (5 - len(row)))
        row.append(url)


def refresh(share, target):
    session = share_session(share)
    folders = collections.deque([("0", [])])
    seen = {"0"}
    files = {}
    counts = collections.Counter()
    while folders:
        fid, path = folders.popleft()
        page = 1
        while True:
            rows = request("detail", {**session, "pdir_fid": fid,
                                      "_page": page, "_size": 100})["list"]
            for row in rows:
                if row["fid"] in seen:
                    raise RuntimeError("分页条目重复，请稍后重新更新")
                seen.add(row["fid"])
                name = row["file_name"]
                if row["dir"]:
                    folders.append((row["fid"], [*path, name]))
                    continue
                ext = Path(name).suffix.lower()
                counts[ext] += 1
                size = row["size"]
                if not 0 < size <= LIMITS.get(ext, 0) or re.search(r"推送服务|过刊密钥", name):
                    continue
                files.setdefault((name, size), [name, " / ".join(path[1:] or path), size, fid])
            if len(rows) < 100:
                break
            page += 1

    selector = Path(__file__).with_name("select-quark-books.mjs")
    selected = subprocess.run(["node", str(selector)], input=json.dumps(list(files.values())).encode(),
                              stdout=subprocess.PIPE, check=True)
    catalog = {"share": share, **json.loads(selected.stdout)}
    link_file = target.with_name("quark-single-links.txt")
    if link_file.exists():
        attach_single_shares(catalog["files"], link_file.read_text(encoding="utf-8-sig").splitlines())
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as temp:
        temp.write(gzip.compress(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0))
    os.replace(temp.name, target)
    print("列出", sum(counts.values()), "个文件，保留", catalog["works"], "组书目，", len(catalog["files"]), "个来源，索引", target.stat().st_size, "字节")


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "data/quark-books.json.gz"
    refresh(os.environ.get("QUARK_BOOK_SHARE") or getpass.getpass("夸克公开分享页："), target)
