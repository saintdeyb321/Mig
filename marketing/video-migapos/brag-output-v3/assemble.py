import json
import math
import sys
import textwrap
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
sys.path.insert(0, str(CACHE / "voice-deps"))
import numpy as np

FPS = 30
RATE = 24000
STEP = RATE // FPS
TARGET = 105 * FPS
BEATS = {
    "pos-add": [(0.61, "pos-add")],
    "pos-total": [(0.45, "pos-total")],
    "product-search": [(0.50, "product-search")],
    "branch-after": [(0.49, "branch-after")],
    "orders-debt": [(0.49, "orders-debt"), (0.78, "orders-closed")],
    "agenda-search": [(0.50, "agenda-search")],
    "report-periods": [(0.28, "report-week"), (0.52, "report-month"), (0.76, "report-year")],
}


def timestamp(frame):
    ms = round(frame * 1000 / FPS)
    seconds, ms = divmod(ms, 1000)
    minutes, seconds = divmod(seconds, 60)
    return f"00:{minutes:02}:{seconds:02},{ms:03}"


scenes = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
measured = json.loads((CACHE / "voice-lengths.json").read_text())
geometry = json.loads((CACHE / "shots.json").read_text())
assert len(scenes) == len(measured) == 12
for chapter, lengths in zip(scenes, measured):
    assert len(chapter["cues"]) == len(lengths)
    chapter["speechFrames"] = [math.ceil(length / STEP) for length in lengths]
    chapter["lead"] = 7 if chapter["id"] == "hook" else 17
    chapter["gap"] = 10 if chapter["id"] == "hook" else 12
    tail = 4 if chapter["id"] == "hook" else 16 if chapter["id"] in {"export", "settings"} else 47
    chapter["minimum"] = sum(chapter["speechFrames"]) + chapter["lead"] + tail + chapter["gap"] * (len(lengths) - 1)
    chapter["duration"] = max(chapter["target"] * FPS, chapter["minimum"])

overflow = sum(chapter["duration"] for chapter in scenes) - TARGET
for chapter in sorted(scenes, key=lambda chapter: chapter["duration"] - chapter["minimum"], reverse=True):
    shift = min(chapter["duration"] - chapter["minimum"], max(0, overflow))
    chapter["duration"] -= shift
    overflow -= shift

duration = sum(chapter["duration"] for chapter in scenes)
audio = np.zeros(duration * STEP, dtype=np.float32)
chapters = []
boards = []
runs = []
subtitles = []
from_frame = 0
for chapter in scenes:
    until = from_frame + chapter["duration"]
    current = from_frame + chapter["lead"]
    cues = []
    shots = [(from_frame, chapter["cues"][0]["shot"])]
    for index, (cue, length) in enumerate(zip(chapter["cues"], chapter["speechFrames"])):
        samples = np.load(CACHE / "lines" / f'{chapter["id"]}-{index}.npy', allow_pickle=False)
        audio[current * STEP:current * STEP + len(samples)] = samples
        end = current + length
        lines = textwrap.wrap(cue["text"], width=33, break_long_words=False, break_on_hyphens=False)
        assert len(lines) <= 2, cue["text"]
        text = "\n".join(lines)
        cues.append({"from": current, "to": end, "text": text, "samples": len(samples)})
        subtitles.append(f"{len(subtitles) + 1}\n{timestamp(current)} --> {timestamp(end)}\n{text}\n")
        if index:
            shots.append((current - 3, cue["shot"]))
        for fraction, name in BEATS.get(cue.get("action"), []):
            shots.append((current + round(length * fraction), name))
        current = end + chapter["gap"]
    assert current - chapter["gap"] <= until

    for frame in range(from_frame, until):
        shot_from, shot = next((start, name) for start, name in reversed(shots) if start <= frame)
        assert shot == "cta" or shot in geometry, f"Falta captura: {shot}"
        caption = next((cue["text"] for cue in cues if cue["from"] <= frame < cue["to"]), "")
        reveal = min(7, frame - shot_from) if shot_from != from_frame else 7
        board = [chapter["id"], chapter["title"], shot, caption, reveal]
        if boards and boards[-1] == board:
            runs[-1] += 1
        else:
            boards.append(board)
            runs.append(1)
    chapters.append({"id": chapter["id"], "title": chapter["title"], "from": from_frame, "to": until,
                     "review": cues[-1]["to"] - 3, "shots": shots, "cues": cues})
    from_frame = until

assert from_frame == duration == sum(runs)
assert np.isfinite(audio).all()
peak = np.max(np.abs(audio))
assert peak > 0.002
gain = min(0.67 / peak, 1.6)
with wave.open(str(ROOT / "narration.wav"), "wb") as output:
    output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
    output.writeframes(np.round(audio * gain * 32767).astype("<i2").tobytes())
(ROOT / "subtitles.srt").write_text("\n".join(subtitles), encoding="utf-8")
(ROOT / "timeline.json").write_text(json.dumps({
    "fps": FPS, "duration": duration, "width": 1080, "height": 1920,
    "chapters": chapters, "boards": boards, "runs": runs, "geometry": geometry,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{duration / FPS:.3f} s, {duration} cuadros, {len(boards)} cuadros visuales distintos y {len(subtitles)} subtítulos.")
print(f"Locución efectiva: {sum(map(sum, measured)) / RATE:.3f} s; pico PCM {20 * math.log10(peak * gain):.2f} dBFS.")
