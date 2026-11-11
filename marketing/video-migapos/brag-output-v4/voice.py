import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
PREVIOUS = ROOT.parent / "brag-output-v3" / ".cache"
sys.dont_write_bytecode = True
sys.path.insert(0, str(PREVIOUS / "voice-deps"))

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

RATE = 24000
VOICE = "ef_dora"


def voice_engine():
    model = PREVIOUS / "model"
    style = np.fromfile(model / f"{VOICE}.bin", dtype=np.float32).reshape(-1, 1, 256)
    archive = CACHE / "voices.npz"
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


scenes = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
measured_path = CACHE / "voice-lengths.json"
measured = json.loads(measured_path.read_text())
orders_index = next(index for index, chapter in enumerate(scenes) if chapter["id"] == "orders")
cue = scenes[orders_index]["cues"][1]
samples = speak(voice_engine(), cue.get("speech", cue["text"]))
np.save(CACHE / "lines" / "orders-1.npy", samples, allow_pickle=False)
measured[orders_index][1] = len(samples)
measured_path.write_text(json.dumps(measured), encoding="utf-8")
print(f"Locución nueva de pedidos: {len(samples) / RATE:.3f} s. Los otros 25 fragmentos se reutilizan.")
