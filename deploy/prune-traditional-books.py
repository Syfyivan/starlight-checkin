"""Remove the retired traditional editions from the operator-managed source cache."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

# IDs from the previously deployed 18-book cache. Personal books are in SQLite.
RETIRED = {
    "dc-lunyu", "dc-mengzi", "dc-zhuangzi", "dc-shijing", "dc-lienvzhuan-hant",
    "dc-laozi-wangbi", "dc-zhanguoce", "dc-laozi-heshang-hant",
    "hk-9789882379749", "hk-9789882378070", "hk-871344e1753ca043",
    "hk-5959736f53af35bc", "hk-10ed2ad3dba36a02", "hk-49e030738bc9facb",
    "hk-0f95cb2ed7c8acc5", "hk-78d8139e38f608c1", "hk-27c2a851476e3ff0",
}


def prune(directory):
    manifest = directory / "manifest.json"
    if not manifest.exists():
        return
    data = json.loads(manifest.read_bytes())
    if data.get("version") != 1:
        raise ValueError("Unsupported source cache manifest")
    entries = {b["id"]: b for b in data["books"]}
    paths = []
    for book in RETIRED:
        path = directory / (book + ".bin")
        if not path.exists():
            continue
        entry = entries.get("oa:" + book)
        if (not entry or not stat.S_ISREG(path.lstat().st_mode)
                or path.stat().st_size != entry["bytes"]
                or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]):
            raise ValueError("Unexpected contents of source cache file " + path.name)
        paths.append(path)
    keep = [b for b in data["books"] if b["id"].removeprefix("oa:") not in RETIRED]
    if len(keep) == len(data["books"]):
        return
    data["books"] = keep
    info = manifest.stat()
    with tempfile.NamedTemporaryFile(dir=directory, delete=False) as tmp:
        temp = Path(tmp.name)
    try:
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        if hasattr(os, "chown"):
            os.chown(temp, info.st_uid, info.st_gid)
        temp.chmod(stat.S_IMODE(info.st_mode))
        for path in paths:
            path.unlink()
        os.replace(temp, manifest)
    finally:
        temp.unlink(missing_ok=True)


if __name__ == "__main__":
    prune(Path(sys.argv[1]))

