import json
import math
import sys
import textwrap
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT.parent / "brag-output-v3" / ".cache" / "voice-deps"))
import numpy as np

FPS = 30
RATE = 24000
SAMPLES_PER_FRAME = RATE // FPS

# A beat references a cue's real start and an offset in frames.
# Full shots preserve navigation and modal transitions. Detail shots settle after the interaction.
EDIT = {
    "hook": [("hook", None, 0, "full")],
    "pos": [("hook", None, 0, "full"), ("pos-search", 0, -8, "full"),
            ("pos-add", 0, 34, "full"), ("pos-ticket", 0, 65, "detail"),
            ("pos-quantity", 1, 20, "filter"), ("pos-total", 1, 60, "detail")],
    "catalog": [("categories", None, 0, "detail"), ("products", 1, -15, "full"),
                ("product-search", 1, 17, "detail")],
    "branches": [("branch-before", None, 0, "full"), ("branch-after", 0, 14, "full"),
                 ("branch-stock", 1, -7, "detail")],
    "orders": [("orders-active", None, 0, "detail"), ("orders-debt", 0, 23, "filter"),
               ("orders-closed", 0, 49, "filter"), ("orders-search", 1, -10, "full"),
               ("orders-result", 1, 20, "detail")],
    "history": [("history", None, 0, "detail"), ("history-items", 1, -12, "detail")],
    "reports": [("report-today", None, 0, "detail"), ("report-week", 0, 18, "filter"),
                ("report-month", 0, 39, "filter"), ("report-year", 0, 61, "filter"),
                ("report-metric", 1, -12, "detail"), ("report-chart", 2, -11, "detail")],
    "export": [("export-pdf", None, 0, "detail"), ("export-excel", 2, -8, "detail")],
    "cash": [("cash-entry", None, 0, "full"), ("cash-input", 0, 1, "full"),
             ("cash", 0, 41, "detail"), ("cash-warning", 1, 0, "detail")],
    "staff": [("staff", None, 0, "detail"), ("staff-edit", 1, -10, "detail"),
              ("staff-shift", 1, 32, "detail")],
    "settings": [("settings", None, 0, "detail"), ("settings-branches", 1, -8, "detail")],
    "cta": [],
}


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def timestamp(frame):
    seconds, milliseconds = divmod(round(frame * 1000 / FPS), 1000)
    minutes, seconds = divmod(seconds, 60)
    return f"00:{minutes:02}:{seconds:02},{milliseconds:03}"


script = read(ROOT / "script.json")
measured = read(CACHE / "voice-lengths.json")
geometry = read(CACHE / "shots.json")
clips = read(CACHE / "clips.json")
assert len(script) == len(measured) == 12
chapters = []
subtitles = []
audio_chunks = []
cursor = 0
for chapter, lengths in zip(script, measured):
    identity = chapter["id"]
    lead = 7 if identity == "hook" else 19
    gap = 12 if identity == "hook" else 16
    counts = [math.ceil(length / SAMPLES_PER_FRAME) for length in lengths]
    minimum = lead + sum(counts) + gap * (len(counts) - 1) + (8 if identity == "hook" else 24)
    duration = max(chapter["target"] * FPS, minimum)
    audio = np.zeros(duration * SAMPLES_PER_FRAME, dtype=np.float32)
    cues = []
    voice_frame = lead
    for index, (cue, frames, length) in enumerate(zip(chapter["cues"], counts, lengths)):
        samples = np.load(CACHE / "lines" / f"{identity}-{index}.npy", allow_pickle=False)
        assert len(samples) == length
        audio[voice_frame * SAMPLES_PER_FRAME:voice_frame * SAMPLES_PER_FRAME + length] = samples
        lines = textwrap.wrap(cue["text"], width=33, break_long_words=False, break_on_hyphens=False)
        assert len(lines) <= 2
        text = "\n".join(lines)
        end = voice_frame + frames
        cues.append({"from": voice_frame, "to": end, "text": text, "samples": length})
        subtitles.append(f"{len(subtitles) + 1}\n{timestamp(cursor + voice_frame)} --> {timestamp(cursor + end)}\n{text}\n")
        voice_frame = end + gap

    beats = []
    for name, cue, offset, mode in EDIT[identity]:
        start = 0 if cue is None else cues[cue]["from"] + offset
        assert name in geometry and 0 <= start < duration, (identity, name, start)
        incoming = clips.get(name)
        if not beats or incoming is None or incoming["from"] != beats[-1]["shot"]:
            incoming = None
        beats.append({"shot": name, "from": start, "mode": mode, "clip": incoming})
    assert all(a["from"] < b["from"] for a, b in zip(beats, beats[1:])), (identity, beats)
    for beat, following in zip(beats, [*beats[1:], {"from": duration}]):
        beat["to"] = following["from"]
        source = beat["clip"]
        available = beat["to"] - beat["from"]
        beat["play"] = min(source["frames"], max(1, available - 8)) if source else 0

    final_beat = beats[-1] if beats else None
    proof = min(duration - 3, final_beat["from"] + final_beat["play"] + 22) if final_beat else duration // 2
    middle = max(1, duration // 2)
    chapters.append({"id": identity, "title": chapter["title"], "from": cursor, "duration": duration,
                     "cues": cues, "beats": beats, "review": [cursor + 5, cursor + middle, cursor + proof]})
    cursor += duration
    audio_chunks.append(audio)

assert 105 * FPS <= cursor <= 120 * FPS
audio = np.concatenate(audio_chunks)
peak = np.max(np.abs(audio))
assert np.isfinite(audio).all() and peak > 0.002
gain = min(0.67 / peak, 1.6)
with wave.open(str(ROOT / "narration-v4.wav"), "wb") as target:
    target.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
    target.writeframes(np.round(audio * gain * 32767).astype("<i2").tobytes())
(ROOT / "subtitles-v4.srt").write_text("\n".join(subtitles), encoding="utf-8")
(ROOT / "timeline.json").write_text(json.dumps({
    "width": 1080, "height": 1920, "fps": FPS, "duration": cursor,
    "chapters": chapters, "geometry": geometry,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
active_clips = sum(bool(beat["clip"]) for chapter in chapters for beat in chapter["beats"])
print(f"{cursor/FPS:.3f} s · {cursor} fotogramas · {len(subtitles)} subtítulos · {active_clips} clips de acción")
