"""Assemble la vidéo enregistrée et la voix off en MP4 (H.264 + AAC)."""
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
here = Path(__file__).parent
spec = json.loads((here / sys.argv[1]).read_text(encoding="utf-8"))
out = here / "out" / spec["id"].replace(".", "_")
timeline = json.loads((out / "timeline.json").read_text(encoding="utf-8"))

trim = max(0.0, timeline["scenes"][0]["start"] - 0.3)
total = timeline["end"] - trim
inputs = ["-ss", f"{trim:.2f}", "-i", timeline["video"]]
filters, labels = [], []
for i, scene in enumerate(spec["scenes"]):
    mp3 = out / f"{i:02d}-{scene['key']}.mp3"
    inputs += ["-i", str(mp3)]
    delay = int((timeline["scenes"][i]["start"] - trim + 0.25) * 1000)
    filters.append(f"[{i + 1}:a]adelay={delay}|{delay}[a{i}]")
    labels.append(f"[a{i}]")
filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:dropout_transition=0[a]")

dest_dir = here.parent / "videos-mp4"
dest_dir.mkdir(exist_ok=True)
safe = spec["title"].replace(" ", "-").replace("'", "")
dest = dest_dir / f"{spec['id']}-{safe}.mp4"
cmd = [FFMPEG, "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[a]",
       "-t", f"{total:.2f}", "-vf", "scale=1280:-2", "-c:v", "libx264", "-profile:v", "main", "-preset", "slow",
       "-crf", "27", "-pix_fmt", "yuv420p", "-r", "25", "-c:a", "aac", "-b:a", "96k", "-ac", "1",
       "-movflags", "+faststart", str(dest)]
subprocess.run(cmd, check=True, capture_output=True)
print("MP4", dest)
