"""Voix off : un fichier MP3 par scène (edge-tts) et leurs durées dans out/<id>/durations.json."""
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

import edge_tts
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def duration(path: Path) -> float:
    err = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


async def main(spec_path: str) -> None:
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    out = Path(__file__).parent / "out" / spec["id"].replace(".", "_")
    out.mkdir(parents=True, exist_ok=True)
    durations = {}
    for i, scene in enumerate(spec["scenes"]):
        mp3 = out / f"{i:02d}-{scene['key']}.mp3"
        await edge_tts.Communicate(scene["text"], spec.get("voice", "ar-DZ-IsmaelNeural"), rate="-5%").save(str(mp3))
        durations[scene["key"]] = round(duration(mp3), 2)
        print(f"{scene['key']}: {durations[scene['key']]} s")
    (out / "durations.json").write_text(json.dumps(durations, indent=2), encoding="utf-8")


asyncio.run(main(sys.argv[1]))
