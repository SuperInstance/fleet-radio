#!/usr/bin/env python3
"""Fleet Radio Nightly Composer.

Every night Fleet Radio premieres a NEW original instrumental, composed and
rendered entirely offline (pure numpy synthesis; no network, no cloud, no
shell). The result is a simple-but-evocative lo-fi synth instrumental in the
spirit of "The Overtones Dream" or "Slow Tide": pad + bass + melody + light
percussion, rendered to a 16-bit stereo WAV at 44.1 kHz, plus a catalog patch
and a one-line JSON summary on stdout.

Determinism: for the same (mood, date, seed) the WAV is bit-identical. All
stochastic choices flow through a single random.Random instance seeded from
sha256("{date}:{mood}") unless --seed is given explicitly.

Key cycling continues the Tap jam-session history (F, F#, Db, E/Eb, B, A, Bb, C)
via composer-state.json: each new date advances one step around the 12-key
cycle; re-running the same date reuses its recorded key.

CLI:
    python3 nightly-composer.py --mood <mood> --date YYYY-MM-DD \
        [--seed <int>] [--out-dir DIR] [--catalog PATH] [--state PATH]
"""

import argparse
import datetime
import hashlib
import json
import math
import os
import random
import re
import sys

import numpy as np

try:
    from scipy import signal as _dsp_signal
except Exception:
    _dsp_signal = None

try:
    from scipy.io import wavfile as _scipy_wavfile
except Exception:
    _scipy_wavfile = None

SAMPLE_RATE = 44100

KEY_CYCLE = ["F", "F#", "G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb", "E"]
KEY_ROOT = {
    "F": 65, "F#": 66, "G": 67, "Ab": 68, "A": 69, "Bb": 70,
    "B": 71, "C": 72, "Db": 73, "D": 74, "Eb": 75, "E": 76,
}
DEFAULT_HISTORY = ["F", "F#", "Db", "E", "B", "A", "Bb", "C"]

MOODS = ["contemplative", "melancholic", "warm", "energetic", "playful", "mysterious"]
MAJOR_MOODS = {"contemplative", "warm", "playful", "energetic"}
SECONDARY_MOOD = {
    "contemplative": "melancholic",
    "melancholic": "contemplative",
    "warm": "contemplative",
    "mysterious": "contemplative",
    "playful": "energetic",
    "energetic": "playful",
}
BPM_RANGES = {
    "contemplative": (60, 72),
    "melancholic": (60, 70),
    "warm": (66, 78),
    "mysterious": (55, 68),
    "playful": (88, 100),
    "energetic": (92, 100),
}
PROGRESSIONS = {
    "contemplative": [
        [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]],
        [[0, 4, 7, 14], [5, 9, 12, 16], [9, 12, 16, 21], [7, 11, 14, 19]],
    ],
    "melancholic": [
        [[0, 3, 7, 10], [8, 12, 15, 19], [3, 7, 10, 14], [10, 14, 17, 20]],
        [[0, 3, 7, 14], [5, 8, 12, 17], [3, 7, 10, 15], [-2, 2, 5, 10]],
    ],
    "warm": [
        [[0, 4, 7, 11], [9, 12, 16, 20], [5, 9, 12, 16], [7, 11, 14, 17]],
        [[0, 4, 7, 12], [7, 11, 14, 18], [9, 12, 16, 19], [5, 9, 12, 16]],
    ],
    "mysterious": [
        [[0, 3, 7, 14], [5, 8, 12, 15], [8, 12, 15, 22], [7, 10, 14, 17]],
        [[0, 3, 10, 14], [10, 14, 17, 20], [3, 7, 10, 17], [0, 3, 7, 11]],
    ],
    "playful": [
        [[0, 4, 7, 7], [5, 9, 12, 12], [7, 11, 14, 14], [0, 4, 7, 12]],
        [[0, 4, 7, 12], [2, 5, 9, 14], [5, 9, 12, 16], [7, 11, 14, 18]],
    ],
    "energetic": [
        [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 16]],
        [[0, 3, 7, 10], [5, 8, 12, 15], [10, 14, 17, 22], [7, 10, 14, 17]],
    ],
}

MIX_GAINS = {
    "contemplative": (0.30, 0.30, 0.40, 0.10),
    "melancholic": (0.29, 0.30, 0.40, 0.10),
    "warm": (0.28, 0.30, 0.42, 0.14),
    "mysterious": (0.31, 0.26, 0.40, 0.10),
    "playful": (0.24, 0.30, 0.42, 0.22),
    "energetic": (0.24, 0.32, 0.42, 0.22),
}
LP_CUTOFFS = {
    "contemplative": 2300.0,
    "melancholic": 2000.0,
    "warm": 2700.0,
    "mysterious": 1900.0,
    "playful": 3800.0,
    "energetic": 4200.0,
}

TITLE_NOUNS = {
    "contemplative": ["Interval", "Tide", "Chart", "Fathom", "Question", "Depth", "Compass", "Water"],
    "melancholic": ["Fog", "Dock", "Ferry", "Goodbye", "Glass", "Rain", "Wake", "Ember"],
    "warm": ["Lantern", "Table", "Amber", "Kettle", "Harbor", "Window", "Cocoa", "Galley"],
    "mysterious": ["Static", "Signal", "Phase", "Buoy", "Mist", "Overtones", "Whisper", "Deep"],
    "playful": ["Snap", "Groove", "Parade", "Lark", "Bounce", "Tin Whistle", "Skip", "Polka"],
    "energetic": ["Current", "Engine", "Run", "Wake", "North", "Squall", "Diesel", "Sprint"],
}
TITLE_ADJS = {
    "contemplative": ["Slow", "Quiet", "Patient", "Long", "Still"],
    "melancholic": ["Last", "Empty", "Late", "Grey", "Low"],
    "warm": ["Warm", "Golden", "Slow", "Familiar", "Small"],
    "mysterious": ["Dim", "Hollow", "Faint", "Borrowed", "Dark"],
    "playful": ["Crooked", "Brass", "Bright", "Loose", "Quick"],
    "energetic": ["Fast", "Open", "Full", "Iron", "Running"],
}
DESC_LINES = {
    "contemplative": [
        "The space between two days, held until it resolves.",
        "A slow pad and a melody that thinks before it speaks.",
        "Resting heart rate for harmonic overthinkers.",
    ],
    "melancholic": [
        "The last ferry takes the melody with it.",
        "Rain on the hull; the goodbye plays out in the reverb.",
        "An ember keeping time when nothing else will.",
    ],
    "warm": [
        "A kettle-warm pad and a melody that keeps coming back to the table.",
        "Lamplight chords and a bass like a settle-in sigh.",
        "Somebody left the radio on, and it sounds like this.",
    ],
    "mysterious": [
        "Something broadcasting from under the water, politely.",
        "A buoy tolling in the dark and nobody claims it.",
        "What the harmonics dream about when the fundamental stops.",
    ],
    "playful": [
        "A crooked little groove that refuses to sit down.",
        "Brass in the galley, heels on the deck.",
        "A tune that keeps missing the chair and landing on its feet.",
    ],
    "energetic": [
        "Full throttle through calm water.",
        "Diesels warm, harbor lights astern.",
        "A run north with the meter in the white.",
    ],
}

PAD_HARMONICS = [(1, 1.0), (2, 0.25), (3, 1.0 / 9.0), (4, 1.0 / 16.0), (5, 1.0 / 25.0)]
BASS_HARMONICS = [(1, 1.0), (2, 0.15)]
LEAD_HARMONICS = [(1, 1.0), (3, 0.22)]
LEAD_BRIGHT_HARMONICS = [(1, 1.0), (3, 0.22), (5, 0.10)]


def _log(msg):
    print("[nightly-composer] " + msg, file=sys.stderr, flush=True)


def _midi_to_freq(midi):
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def _tone(freq, n, harmonics, detune_cents=0.0, vib_rate=0.0, vib_cents=0.0, vib_delay=0.15):
    if n <= 0:
        return np.zeros(0)
    t = np.arange(n) / SAMPLE_RATE
    base = freq * (2.0 ** (detune_cents / 1200.0))
    f = np.full(n, base)
    if vib_cents > 0.0 and vib_rate > 0.0:
        ramp = np.clip((t - vib_delay) / 0.25, 0.0, 1.0)
        f = f * (2.0 ** ((vib_cents * ramp * np.sin(2.0 * np.pi * vib_rate * t)) / 1200.0))
    phase = 2.0 * np.pi * np.cumsum(f) / SAMPLE_RATE
    out = np.zeros(n)
    for mult, amp in harmonics:
        out += amp * np.sin(mult * phase)
    return out


def _envelope(n, attack=0.01, release=0.05, decay_tau=None):
    if n <= 0:
        return np.zeros(0)
    env = np.ones(n)
    a = min(n, max(1, int(attack * SAMPLE_RATE)))
    env[:a] = np.linspace(0.0, 1.0, a)
    r = min(n - a, int(release * SAMPLE_RATE))
    if r > 0:
        env[n - r:] *= np.linspace(1.0, 0.0, r)
    if decay_tau is not None and decay_tau > 0.0:
        env *= np.exp(-np.arange(n) / (decay_tau * SAMPLE_RATE))
    return env


def _add(buf, mono, at, gain=1.0):
    if len(mono) == 0 or at >= len(buf) or at + len(mono) <= 0:
        return
    start = max(0, at)
    end = min(len(buf), at + len(mono))
    buf[start:end] += mono[start - at:end - at] * gain


def _add_stereo(buf, mono, at, gain=1.0, gl=1.0, gr=1.0):
    _add(buf[:, 0], mono, at, gain * gl)
    _add(buf[:, 1], mono, at, gain * gr)


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Fleet Radio nightly offline composer")
    p.add_argument("--mood", required=True, help="one of: " + ", ".join(MOODS))
    p.add_argument("--date", required=True, help="episode date YYYY-MM-DD")
    p.add_argument("--seed", type=int, default=None, help="explicit seed (default: hash of date+mood)")
    p.add_argument("--out-dir", default="/home/eileen/projects/ai-writings/music")
    p.add_argument("--catalog", default="/home/eileen/projects/ai-writings/music-catalog.json")
    p.add_argument("--state", default="/home/eileen/projects/fleet-radio/composer-state.json")
    return p.parse_args(argv)


def load_or_init_state(state_path):
    if os.path.exists(state_path):
        try:
            with open(state_path, "r", encoding="utf-8") as f:
                state = json.load(f)
            if (isinstance(state, dict) and isinstance(state.get("history"), list)
                    and isinstance(state.get("log"), dict)):
                _log("state loaded from " + state_path)
                return state
            _log("state file malformed; re-initializing with jam-session history")
        except (OSError, ValueError) as exc:
            _log("state file unreadable (%s); re-initializing with jam-session history" % exc)
    return {"history": list(DEFAULT_HISTORY), "log": {}}


def pick_key(state, date, state_path):
    log = state.setdefault("log", {})
    if date in log and log[date] in KEY_ROOT:
        _log("key reused from log for %s: %s" % (date, log[date]))
        return log[date]
    history = state.setdefault("history", list(DEFAULT_HISTORY))
    last = history[-1] if history else "C"
    idx = KEY_CYCLE.index(last) if last in KEY_CYCLE else KEY_CYCLE.index("C")
    chosen = KEY_CYCLE[(idx + 1) % len(KEY_CYCLE)]
    history.append(chosen)
    log[date] = chosen
    try:
        with open(state_path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=1)
        _log("key cycle advanced: %s -> %s (recorded %s=%s)" % (last, chosen, date, chosen))
    except OSError as exc:
        _log("WARNING: could not write state file %s (%s); continuing" % (state_path, exc))
    return chosen


def _allocate_sections(total_bars):
    outro = min(4, max(2, int(round(total_bars * 0.13))))
    intro = min(4, max(2, int(round(total_bars * 0.17))))
    rem = total_bars - intro - outro
    if rem < 4:
        intro, outro = 2, 2
        rem = max(4, total_bars - 4)
    a_bars = rem - rem // 2
    b_bars = rem // 2
    return intro, a_bars, b_bars, outro


def derive_musical_params(rng, mood, key, root):
    lo, hi = BPM_RANGES[mood]
    bpm = rng.randint(lo, hi)
    beat = 60.0 / bpm
    sec_per_bar = 4.0 * beat
    fade_out = 1.5 if mood in ("contemplative", "melancholic") else 1.0
    tail = fade_out + 0.9
    max_bars = int((58.0 - tail) / sec_per_bar)
    min_bars = max(4, int(math.ceil(42.0 / sec_per_bar)))
    total_bars = max(min_bars, min(23, max_bars))
    intro, a_bars, b_bars, outro = _allocate_sections(total_bars)
    n_samples = int((total_bars * sec_per_bar + tail) * SAMPLE_RATE)

    prog = rng.choice(PROGRESSIONS[mood])
    pad_detune = rng.uniform(3.5, 7.0)
    vib_rate = rng.uniform(5.0, 6.0)
    vib_cents = rng.uniform(10.0, 15.0)
    bass_roll = rng.random()
    perc_roll = rng.random()
    bass_double = mood == "energetic" or (mood == "playful" and bass_roll < 0.7)
    if mood in ("energetic", "playful"):
        perc_style = "full"
    elif mood == "warm":
        perc_style = "warm"
    elif mood == "mysterious":
        perc_style = "none" if perc_roll < 0.5 else "heartbeat"
    else:
        perc_style = "heartbeat"

    scale = [0, 2, 4, 7, 9] if mood in MAJOR_MOODS else [0, 3, 5, 7, 10]
    pool = sorted({root + 12 + s for s in scale} | {root + 24, root + 26})

    if mood in ("contemplative", "melancholic", "mysterious"):
        durs, weights = [4.0, 2.0, 2.0, 1.0], [2, 4, 4, 2]
        rest_p, gap_p, gaps = 0.18, 0.20, (0.5, 1.0)
        mel_attack = 0.020
    elif mood == "warm":
        durs, weights = [2.0, 1.0, 1.0, 4.0], [3, 3, 2, 1]
        rest_p, gap_p, gaps = 0.15, 0.20, (0.5, 1.0)
        mel_attack = 0.016
    else:
        durs, weights = [1.0, 0.5, 0.5, 2.0], [3, 3, 2, 1]
        rest_p, gap_p, gaps = 0.12, 0.30, (0.5, 0.5, 1.0)
        mel_attack = 0.012

    pad_gain, bass_gain, mel_gain, perc_gain = MIX_GAINS[mood]
    return {
        "mood": mood, "key": key, "root": root, "bpm": bpm, "beat": beat,
        "sec_per_bar": sec_per_bar, "total_bars": total_bars,
        "intro_bars": intro, "a_bars": a_bars, "b_bars": b_bars, "outro_bars": outro,
        "n_samples": n_samples, "fade_out": fade_out,
        "prog": prog, "pad_detune": pad_detune,
        "vib_rate": vib_rate, "vib_cents": vib_cents,
        "bass_double": bass_double, "perc_style": perc_style,
        "melody_pool": pool,
        "melody_durs": durs, "melody_weights": weights,
        "melody_rest_p": rest_p, "melody_gap_p": gap_p, "melody_gaps": gaps,
        "mel_attack": mel_attack,
        "mel_bright": mood in ("playful", "energetic"),
        "pad_gain": pad_gain, "bass_gain": bass_gain,
        "mel_gain": mel_gain, "perc_gain": perc_gain,
        "lp_cutoff": LP_CUTOFFS[mood],
        "delay_mix": 0.15, "delay_fb": 0.30,
    }


def synth_pad(params):
    n = params["n_samples"]
    buf = np.zeros((n, 2))
    bar_dur = params["sec_per_bar"]
    det = params["pad_detune"]
    attack = min(0.35, bar_dur * 0.3)
    for bar in range(params["total_bars"]):
        chord = params["prog"][bar % len(params["prog"])]
        note_len = int((bar_dur + 0.35) * SAMPLE_RATE)
        at = int(bar * bar_dur * SAMPLE_RATE)
        for off in chord:
            freq = _midi_to_freq(params["root"] + off)
            for ch, dc in ((0, -det), (1, det)):
                tone = _tone(freq, note_len, PAD_HARMONICS, detune_cents=dc)
                tone *= _envelope(note_len, attack=attack, release=0.6)
                _add(buf[:, ch], tone, at, 0.55 / len(chord))
    return buf


def synth_bass(params):
    buf = np.zeros(params["n_samples"])
    beat = params["beat"]
    bar_dur = params["sec_per_bar"]
    hits = [(0.0, 1.8), (2.0, 1.8)] if params["bass_double"] else [(0.0, 3.7)]
    for bar in range(params["total_bars"]):
        chord = params["prog"][bar % len(params["prog"])]
        freq = _midi_to_freq(params["root"] - 24 + chord[0])
        at_bar = int(bar * bar_dur * SAMPLE_RATE)
        for beat_pos, dur_beats in hits:
            dur = dur_beats * beat
            note_len = max(1, int(dur * SAMPLE_RATE))
            tone = _tone(freq, note_len, BASS_HARMONICS)
            tone *= _envelope(note_len, attack=0.008, release=0.10, decay_tau=dur * 0.9)
            _add(buf, tone, at_bar + int(beat_pos * beat * SAMPLE_RATE), 0.62)
    return buf


def _generate_phrase(rng, params):
    pool_len = len(params["melody_pool"])
    events = []
    t = 0.0
    idx = pool_len // 2
    total = 16.0
    while t < total - 0.5:
        dur = rng.choices(params["melody_durs"], weights=params["melody_weights"], k=1)[0]
        if t + dur > total:
            dur = total - t
            if dur < 0.5:
                break
        if rng.random() < params["melody_rest_p"]:
            t += dur
            continue
        r = rng.random()
        step = 1 if r < 0.50 else (2 if r < 0.80 else rng.randint(3, 5))
        direction = 1 if rng.random() < 0.5 else -1
        idx = max(0, min(pool_len - 1, idx + step * direction))
        events.append((t, dur, idx))
        t += dur
        if rng.random() < params["melody_gap_p"]:
            t += rng.choice(params["melody_gaps"])
    if not events:
        events.append((0.0, 4.0, pool_len // 2))
    return events


def _tile_phrase(events, start_beat, span_beats, shift=0.0, transpose=0, pool_len=7):
    out = []
    cursor = 0.0
    while cursor < span_beats - 0.01:
        for s, d, i in events:
            bs = s + cursor
            if bs >= span_beats:
                continue
            dur = min(d, span_beats - bs)
            if dur < 0.25:
                continue
            out.append((bs + start_beat + shift, dur, max(0, min(pool_len - 1, i + transpose))))
        cursor += 16.0
    return out


def synth_melody(rng, params):
    buf = np.zeros(params["n_samples"])
    beat = params["beat"]
    pool = params["melody_pool"]
    phrase = _generate_phrase(rng, params)

    var_kind = rng.choice(["transpose", "shift"])
    transpose = rng.choice([-2, -1, 1, 2]) if var_kind == "transpose" else 0
    shift = 0.5 if var_kind == "shift" else 0.0
    variation = _tile_phrase(phrase, 0.0, 16.0, shift=shift, transpose=transpose, pool_len=len(pool))
    second = variation if rng.random() < 0.5 else phrase

    a_start = params["intro_bars"] * 4.0
    b_start = a_start + params["a_bars"] * 4.0
    b_half = params["b_bars"] * 2.0
    events = []
    events += _tile_phrase(phrase, a_start, params["a_bars"] * 4.0, pool_len=len(pool))
    events += _tile_phrase(variation, b_start, b_half, pool_len=len(pool))
    events += _tile_phrase(second, b_start + b_half, b_half, pool_len=len(pool))

    harmonics = LEAD_BRIGHT_HARMONICS if params["mel_bright"] else LEAD_HARMONICS
    for start_beat, dur_beats, idx in events:
        dur = dur_beats * beat * 0.95
        note_len = max(1, int(dur * SAMPLE_RATE))
        freq = _midi_to_freq(pool[idx])
        vel = 0.82 + 0.18 * rng.random()
        tone = _tone(freq, note_len, harmonics,
                     vib_rate=params["vib_rate"], vib_cents=params["vib_cents"], vib_delay=0.15)
        tone *= _envelope(note_len, attack=params["mel_attack"],
                          release=min(0.10, dur * 0.3), decay_tau=dur * 1.6)
        _add(buf, tone, int(start_beat * beat * SAMPLE_RATE), vel)
    return buf


def _bandpass(x, lo, hi):
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1.0 / SAMPLE_RATE)
    spec[(freqs < lo) | (freqs > hi)] = 0.0
    return np.fft.irfft(spec, n=len(x))


def _kick_source():
    n = int(0.28 * SAMPLE_RATE)
    t = np.arange(n) / SAMPLE_RATE
    f = 45.0 + 65.0 * np.exp(-t / 0.018)
    phase = 2.0 * np.pi * np.cumsum(f) / SAMPLE_RATE
    env = np.exp(-t / 0.15)
    a = max(1, int(0.001 * SAMPLE_RATE))
    env[:a] *= np.linspace(0.0, 1.0, a)
    return np.sin(phase) * env


def _hat_source(noise):
    hat_band = _bandpass(noise, 6000.0, 9000.0)
    n = int(0.07 * SAMPLE_RATE)
    env = np.exp(-np.arange(n) / (0.04 * SAMPLE_RATE))
    return hat_band, env


def _snare_source(noise):
    n = int(0.18 * SAMPLE_RATE)
    t = np.arange(n) / SAMPLE_RATE
    hiss = noise[:n] * np.exp(-t / 0.07) * 0.8
    body = np.sin(2.0 * np.pi * 180.0 * t) * np.exp(-t / 0.06) * 0.5
    return hiss + body


def synth_percussion(rng, params):
    buf = np.zeros((params["n_samples"], 2))
    style = params["perc_style"]
    if style == "none":
        return buf
    beat = params["beat"]
    noise = np.array([rng.gauss(0.0, 1.0) for _ in range(2 * SAMPLE_RATE)])
    kick = _kick_source()
    hat_band, hat_env = _hat_source(noise)
    snare = _snare_source(noise)
    hat_span = len(hat_band) - len(hat_env)
    snare_span = len(noise) - len(snare)

    start_bar = params["intro_bars"]
    b_start_bar = start_bar + params["a_bars"]
    end_bar = b_start_bar + params["b_bars"]
    hat_i = 0
    for bar in range(start_bar, end_bar):
        base = bar * 4.0
        in_b = bar >= b_start_bar
        if style == "full":
            for kb in (0.0, 2.0):
                _add_stereo(buf, kick, int((base + kb) * beat * SAMPLE_RATE), 1.0)
            if in_b:
                for sb in (1.0, 3.0):
                    _add_stereo(buf, snare, int((base + sb) * beat * SAMPLE_RATE), 0.9, 1.0, 0.9)
            grid = [b / 2.0 for b in range(8)] if in_b else [0.0, 1.0, 2.0, 3.0]
            for hb in grid:
                chunk = hat_band[(hat_i * 911) % hat_span:(hat_i * 911) % hat_span + len(hat_env)]
                hat_i += 1
                _add_stereo(buf, chunk * hat_env, int((base + hb) * beat * SAMPLE_RATE),
                            0.35 + 0.1 * ((hat_i * 37) % 10) / 10.0, 0.75, 1.0)
        elif style == "warm":
            _add_stereo(buf, kick, int(base * beat * SAMPLE_RATE), 0.55)
            _add_stereo(buf, hat_band[hat_i % hat_span:hat_i % hat_span + len(hat_env)] * hat_env,
                        int((base + 2.0) * beat * SAMPLE_RATE), 0.20, 0.75, 1.0)
            hat_i += 1
        else:
            _add_stereo(buf, kick, int(base * beat * SAMPLE_RATE), 0.40)
            _add_stereo(buf, kick, int((base + 1.5) * beat * SAMPLE_RATE), 0.28)
    return buf


def _onepole_lowpass(x, cutoff):
    if _dsp_signal is None or cutoff <= 0.0:
        return x
    a = 1.0 - math.exp(-2.0 * math.pi * cutoff / SAMPLE_RATE)
    return _dsp_signal.lfilter([a], [1.0, -(1.0 - a)], x, axis=0)


def _feedback_delay(mel, params):
    d = max(1, int(0.75 * params["beat"] * SAMPLE_RATE))
    out = mel.copy()
    gain = params["delay_mix"]
    fb = params["delay_fb"]
    k = 1
    while gain * (fb ** (k - 1)) > 0.004 and k <= 6:
        tap = np.zeros_like(mel)
        seg = k * d
        if seg >= len(mel):
            break
        tap[seg:] = mel[:-seg]
        out += gain * (fb ** (k - 1)) * tap
        k += 1
    return out


def render_mix(pad, bass, melody, perc, params, wav_path):
    n = params["n_samples"]
    pad = _onepole_lowpass(pad, params["lp_cutoff"])
    melody = _onepole_lowpass(melody, params["lp_cutoff"])
    melody = _feedback_delay(melody, params)

    master = pad * params["pad_gain"]
    master += (bass * params["bass_gain"])[:, None]
    master += (melody * params["mel_gain"])[:, None]
    master += perc * params["perc_gain"]

    master -= master.mean(axis=0)
    fade_in = max(1, int(0.03 * SAMPLE_RATE))
    master[:fade_in] *= np.linspace(0.0, 1.0, fade_in)[:, None]
    fade_out = min(n, max(1, int(params["fade_out"] * SAMPLE_RATE)))
    master[n - fade_out:] *= (0.5 * (1.0 + np.cos(np.linspace(0.0, math.pi, fade_out))))[:, None]

    peak = float(np.max(np.abs(master))) if n else 0.0
    if peak > 0.0:
        master *= 0.89 / peak
    data = (np.clip(master, -1.0, 1.0) * 32767.0).astype(np.int16)

    if _scipy_wavfile is not None:
        _scipy_wavfile.write(wav_path, SAMPLE_RATE, data)
    else:
        import wave
        with wave.open(wav_path, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(data.tobytes())
    return n


def _build_title(rng, mood):
    nouns = TITLE_NOUNS[mood]
    adjs = TITLE_ADJS[mood]
    adj = rng.choice(adjs)
    noun = rng.choice(nouns)
    pattern = rng.randrange(4)
    if pattern == 3 and adj == "Slow":
        pattern = 0
    if pattern == 0:
        return "The %s %s" % (adj, noun)
    if pattern == 1:
        return "%s %s" % (adj, noun)
    if pattern == 2:
        others = [x for x in nouns if x != noun]
        return "The %s of %s" % (noun, rng.choice(others) if others else noun)
    return "Slow %s" % noun


def make_title(rng, mood, params, existing_titles):
    title = _build_title(rng, mood)
    if title in existing_titles:
        title = _build_title(rng, mood)
    if title in existing_titles:
        title += " Tonight"
    desc = ("Composed at %d BPM in %s. " % (params["bpm"], params["key"])
            + rng.choice(DESC_LINES[mood]))
    if len(desc) > 140:
        desc = desc[:139] + "."
    return title, desc


def _slugify(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def _load_catalog(catalog_path):
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            catalog = json.load(f)
        if isinstance(catalog, dict) and isinstance(catalog.get("tracks"), dict):
            return catalog
        _log("WARNING: catalog at %s has unexpected shape; skipping catalog patch" % catalog_path)
        return None
    except (OSError, ValueError) as exc:
        _log("WARNING: catalog unreadable (%s); skipping catalog patch" % exc)
        return None


def _patch_catalog(catalog, catalog_path, entry):
    catalog["tracks"][entry["filename"]] = entry
    try:
        with open(catalog_path, "w", encoding="utf-8") as f:
            json.dump(catalog, f, indent=1)
        _log("catalog patched: %s (%d tracks)" % (entry["filename"], len(catalog["tracks"])))
    except OSError as exc:
        _log("WARNING: could not write catalog %s (%s)" % (catalog_path, exc))


def main(argv=None):
    args = parse_args(argv)
    mood = args.mood.strip().lower()
    if mood not in MOODS:
        _log("error: --mood must be one of: %s (got %r)" % (", ".join(MOODS), args.mood))
        sys.exit(2)
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", args.date):
        _log("error: --date must be YYYY-MM-DD (got %r)" % args.date)
        sys.exit(2)
    try:
        datetime.date.fromisoformat(args.date)
    except ValueError:
        _log("error: --date is not a valid date (got %r)" % args.date)
        sys.exit(2)

    seed = args.seed
    if seed is None:
        digest = hashlib.sha256(("%s:%s" % (args.date, mood)).encode("utf-8")).digest()
        seed = int.from_bytes(digest[:8], "big")
    rng = random.Random(seed)
    _log("mood=%s date=%s seed=%d" % (mood, args.date, seed))

    state = load_or_init_state(args.state)
    key = pick_key(state, args.date, args.state)
    root = KEY_ROOT[key]

    params = derive_musical_params(rng, mood, key, root)
    _log("plan: bpm=%d key=%s bars=%d (intro %d / A %d / B %d / outro %d) ~%.1fs"
         % (params["bpm"], key, params["total_bars"], params["intro_bars"],
            params["a_bars"], params["b_bars"], params["outro_bars"],
            params["n_samples"] / SAMPLE_RATE))

    pad = synth_pad(params)
    bass = synth_bass(params)
    melody = synth_melody(rng, params)
    perc = synth_percussion(rng, params)

    catalog = _load_catalog(args.catalog)
    existing_titles = set()
    own_family = "nightly-%s" % args.date
    if catalog is not None:
        for tr in catalog["tracks"].values():
            if isinstance(tr, dict) and "title" in tr:
                # Exclude tonight's own entry so re-runs regenerate the identical
                # track instead of colliding with themselves (idempotency).
                if tr.get("family") == own_family:
                    continue
                existing_titles.add(tr["title"])
    title, description = make_title(rng, mood, params, existing_titles)
    _log("title: %s" % title)

    slug = _slugify(title)
    filename = "%s-%s.wav" % (args.date, slug)
    wav_path = os.path.join(args.out_dir, filename)

    try:
        os.makedirs(args.out_dir, exist_ok=True)
    except OSError as exc:
        _log("error: cannot create out-dir %s (%s)" % (args.out_dir, exc))
        sys.exit(1)

    try:
        n = render_mix(pad, bass, melody, perc, params, wav_path)
    except OSError as exc:
        _log("error: cannot write WAV to %s (%s)" % (wav_path, exc))
        sys.exit(1)
    _log("wrote %s (%d samples, %.1fs)" % (wav_path, n, n / SAMPLE_RATE))

    if catalog is not None:
        entry = {
            "filename": filename,
            "title": title,
            "description": description,
            "bpm": params["bpm"],
            "mood": [mood, SECONDARY_MOOD[mood]],
            "family": "nightly-%s" % args.date,
            "path": "/music/%s" % filename,
            "added": args.date,
            "curated": False,
            "composed": True,
            "key": key,
            "seed": seed,
        }
        _patch_catalog(catalog, args.catalog, entry)

    result = {
        "filename": filename,
        "title": title,
        "description": description,
        "bpm": params["bpm"],
        "mood": [mood, SECONDARY_MOOD[mood]],
        "family": "nightly-%s" % args.date,
        "path": "/music/%s" % filename,
        "key": key,
        "duration_seconds": round(n / SAMPLE_RATE, 1),
        "wav_path": os.path.abspath(wav_path),
    }
    sys.stdout.write(json.dumps(result) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
