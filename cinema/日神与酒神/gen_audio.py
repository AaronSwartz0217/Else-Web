"""日神与酒神 · 60s 程序化配乐（numpy 纯合成，无外部素材）

音乐本身就在讲这件事：
  A 日神（0–20s）：一条规整的里拉琴式三音动机，拍点均匀、和声干净 —— "秩序"
  B 酒神（20–40s）：鼓组进来，但拍点**故意不稳**（每小节提前 1–3 帧）＋噪声音墙 + 失谐持续音 —— "醉"
  C 悲剧（40–60s）：A 的旋律与 B 的鼓**同时在场**，最后四小节旋律上行、鼓退到心跳级 —— 两股力量真的叠在一起
结尾打印逐段 RMS（改拍时一眼看出哪一段塌了）。
"""
import wave, os
import numpy as np

SR = 48000
DUR = 60.0
n = int(SR * DUR)
rng = np.random.default_rng(11)
L = np.zeros(n); R = np.zeros(n)

SEGS = [('A 日神', 0.0, 20.0), ('B 酒神', 20.0, 40.0), ('C 悲剧', 40.0, 60.0)]


def add(a, b, freq, amp, kind='sin', pan=0.0, atk=0.10, rel=0.30, detune=0.0):
    i0, i1 = int(a * SR), min(n, int(b * SR))
    if i1 <= i0:
        return
    tt = np.arange(i1 - i0) / SR
    dur = b - a
    env = np.minimum(1, tt / max(atk, 1e-4)) * np.minimum(1, np.maximum(0, dur - tt) / max(rel, 1e-4))

    def w(f, k):
        if k == 'sin':
            return np.sin(2 * np.pi * f * tt)
        if k == 'tri':
            return 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * tt))
        if k == 'saw':
            return 2 * ((f * tt) % 1.0) - 1
        if k == 'pluck':      # 里拉琴：基音 + 两个衰减泛音
            return (np.sin(2 * np.pi * f * tt) + 0.42 * np.sin(2 * np.pi * f * 2.01 * tt)
                    + 0.22 * np.sin(2 * np.pi * f * 3.03 * tt))
        if k == 'drum':       # 鼓：低频下坠 + 噪声瞬态
            bt = np.minimum(tt, 0.6)
            body = np.sin(2 * np.pi * (f * np.exp(-bt * 9.0) + f * 0.4) * tt) * np.exp(-tt * 7.0)
            noise = rng.normal(0, 0.5, len(tt)) * np.exp(-tt * 34.0)
            return body * 0.85 + noise
        return np.sin(2 * np.pi * f * tt)

    sig = w(freq, kind) * amp * env
    if detune:
        sig = sig + w(freq * (1 + detune), kind) * amp * 0.5 * env
    L[i0:i1] += sig * (1 - pan * 0.35)
    R[i0:i1] += sig * (1 + pan * 0.35)


# ── A 日神：规整的里拉琴动机（D 羽调式），拍点均匀 ──────────────────────────
MOTIF = [293.66, 349.23, 440.00, 349.23]        # D F A F
for k in range(0, 40):
    t = k * 0.5
    if t >= 20.0:
        break
    f = MOTIF[k % 4]
    add(t, t + 1.5, f, 0.055, 'pluck', (-1) ** k * 0.35, atk=0.006, rel=1.2)
for k in range(0, 5):                            # 低音长音（每 4 秒）
    add(k * 4.0, k * 4.0 + 3.6, 146.83, 0.045, 'sin', 0.0, atk=0.6, rel=1.4)

# ── B 酒神：拍点故意不稳的鼓 + 噪声音墙 + 失谐持续音 ────────────────────────
for k in range(0, 40):
    t = 20.0 + k * 0.25 + (rng.uniform(-0.012, 0.012) if k % 4 else 0.0)   # 每拍微微提前/滞后
    if t >= 40.0:
        break
    add(t, t + 0.45, 96.0 if k % 4 == 0 else 148.0, 0.165 if k % 4 == 0 else 0.088, 'drum', 0.2 * (-1) ** k)
for k in range(0, 8):                            # 失谐持续音（"边界在抖"）
    add(20.0 + k * 2.5, 20.0 + k * 2.5 + 2.4, 110.0, 0.050, 'saw', 0.0, atk=0.5, rel=1.0, detune=0.008)
for k in range(0, 20):                           # 噪声音墙（"醉"的底噪）
    t = 20.0 + k * 1.0
    add(t, t + 0.75, 880.0, 0.042, 'sin', (-1) ** k * 0.5, atk=0.02, rel=0.6, detune=0.02)

# ── C 悲剧：旋律（日神）与鼓（酒神）同时在场，最后四小节旋律上行、鼓退到心跳 ──
for k in range(0, 40):
    t = 40.0 + k * 0.5
    if t >= 60.0:
        break
    up = min(1.0, max(0.0, (t - 52.0) / 6.0))     # 52s 起旋律上行
    f = MOTIF[k % 4] * (1 + 0.25 * up * (k % 3))
    add(t, t + 1.6, f, 0.052 + 0.012 * up, 'pluck', (-1) ** k * 0.3, atk=0.006, rel=1.3)
for k in range(0, 26):                            # 鼓：60→48 拍/分，最后降到心跳级
    t = 40.0 + k * 0.46
    if t >= 60.0:
        break
    amp = 0.075 * (1.0 - 0.75 * min(1.0, max(0.0, (t - 52.0) / 6.0)))
    add(t, t + 0.40, 92.0 if k % 2 == 0 else 138.0, amp, 'drum', 0.15 * (-1) ** k)
for k in range(0, 5):
    add(40.0 + k * 4.0, 40.0 + k * 4.0 + 3.7, 146.83, 0.042, 'sin', 0.0, atk=0.5, rel=1.2)
for f, aa in ((440.00, 0.030), (587.33, 0.026), (880.00, 0.020)):   # 结尾和声收束
    add(56.5, 60.0, f, aa, 'pluck', 0.0, atk=0.5, rel=3.4)

# ── 房间感：两条延迟副本 + 极轻底噪 ────────────────────────────────────────
for dly, g in ((0.033, 0.26), (0.071, 0.18), (0.129, 0.11)):
    k = int(dly * SR)
    L[k:] += L[:-k] * g
    R[k:] += R[:-k] * g
bed = rng.normal(0, 0.0032, n)
L += bed
R += np.roll(bed, 173)

st = np.stack([L, R], 1)
st /= max(1.0, np.max(np.abs(st)) / 0.86)
pcm = (st * 32767).astype('<i2')

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'audio.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

print('audio.wav %.1fs stereo 48kHz -> %s' % (DUR, out))
for name, a, b in SEGS:
    seg = st[int(a * SR):int(b * SR)]
    print('  %-8s %5.1fs-%5.1fs  RMS %.4f  peak %.3f' % (name, a, b,
          float(np.sqrt(np.mean(seg ** 2))), float(np.max(np.abs(seg)))))
