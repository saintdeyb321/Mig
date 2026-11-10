import json
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
sys.path.insert(0, str(CACHE / "voice-deps"))

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

RATE = 24000
VOICE = "ef_dora"
SAMPLE = ("Con Miga Pos, prepara el ticket antes de cobrar. Revisa tus pedidos, compara la caja "
          "y consulta el inventario por sede. También puedes exportar el detalle a Éxcel.")


def voice_engine():
    model = CACHE / "model"
    style = np.fromfile(model / f"{VOICE}.bin", dtype=np.float32).reshape(-1, 1, 256)
    archive = model / "voices.npz"
    np.savez(archive, **{VOICE: style})
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model / "kokoro.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
    return Kokoro.from_session(session, str(archive))


def speak(engine, text):
    samples, rate = engine.create(text, voice=VOICE, lang="es-419", speed=1.0)
    assert rate == RATE and len(samples) > RATE / 4
    return samples.astype(np.float32)


def save(path, samples):
    peak = np.max(np.abs(samples))
    assert np.isfinite(peak) and peak > 0.002
    gain = min(0.67 / peak, 1.6)
    with wave.open(str(path), "wb") as target:
        target.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        target.writeframes(np.round(samples * gain * 32767).astype("<i2").tobytes())


engine = voice_engine()
if sys.argv[1:] == ["sample"]:
    samples = speak(engine, SAMPLE)
    save(ROOT / "voice-sample.wav", samples)
    print(f"Voz local {VOICE} · {len(samples) / RATE:.2f} s · PCM mono {RATE} Hz")
else:
    scenes = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
    lines = CACHE / "lines"
    lines.mkdir(parents=True, exist_ok=True)
    target = sys.argv[1:]
    measured_path = CACHE / "voice-lengths.json"
    measured = json.loads(measured_path.read_text()) if target else [[] for _ in scenes]
    for scene_index, chapter in enumerate(scenes):
        if target and chapter["id"] not in target:
            continue
        durations = []
        for index, cue in enumerate(chapter["cues"]):
            samples = speak(engine, cue.get("speech", cue["text"]))
            path = lines / f'{chapter["id"]}-{index}.npy'
            np.save(path, samples, allow_pickle=False)
            durations.append(len(samples))
        measured[scene_index] = durations
        print(f'{chapter["id"]} · {sum(durations) / RATE:.2f} s', flush=True)
    measured_path.write_text(json.dumps(measured), encoding="utf-8")
