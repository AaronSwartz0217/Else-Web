#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
达克效应 · 配乐合成（纯 numpy，无外部音频素材）
----------------------------------------------------------------
时间轴：源帧 / 22.5 = 输出秒（全片 0.75 倍速，788 源帧 ≈ 35.02s）
风格：合成器 chiptune —— 脉冲主旋律 + 琶音 + 锯齿贝斯 + 噪声明暗鼓 + 管风琴式 pad
结构：八段（宝座进行曲 / 行进 / 不安 / 两场战斗 / 徘徊 / 冲锋 / 收束）贯穿；
      **关键节点突然全静音**：勇士一 344、勇士二 432、勇士三 548、勇士四 648（拔刺）→
      静音 0.5–0.9s，之后只留环境声（火焰 / 岩浆 / 风）；662 龙崩解。
输出：audio.wav（立体声 44100Hz）+ 逐拍 RMS 自证（静音处必须塌到 ≈0）
"""
import numpy as np
import wave

SR = 44100
SRC_TOTAL = 788
DUR = SRC_TOTAL / 22.5                       # 35.02 s
N = int(DUR * SR)
F = lambda f: f / 22.5                       # 源帧 → 秒

rng = np.random.default_rng(20261014)

# ---------------------------------------------------------------- 基础工具
def nmask(n): return np.arange(n, dtype=np.float32) / SR

def midi(m): return 440.0 * 2 ** ((m - 69) / 12.0)

def sq(freq, dur, duty=0.5, phase=0.0):
    n = int(dur * SR); t = nmask(n) * freq + phase
    x = ((t % 1.0) < duty).astype(np.float32) * 2.0 - 1.0
    return x

def tri(freq, dur):
    n = int(dur * SR); t = nmask(n) * freq
    return (2.0 * np.abs(2.0 * (t % 1.0) - 1.0) - 1.0).astype(np.float32)

def saw(freq, dur):
    n = int(dur * SR); t = nmask(n) * freq
    return (2.0 * (t % 1.0) - 1.0).astype(np.float32)

def noise(dur): return rng.standard_normal(int(dur * SR)).astype(np.float32)

def decay(dur, tau): return np.exp(-nmask(int(dur * SR)) / tau).astype(np.float32)

def env(dur, a=0.006, d=0.06, s=0.7, r=0.08):
    n = int(dur * SR); e = np.full(n, s, dtype=np.float32)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n); nd = min(nd, max(0, n - na)); nr = min(nr, max(0, n - na - nd))
    e[:na] = np.linspace(0, 1, na, dtype=np.float32)
    if nd: e[na:na + nd] = np.linspace(1, s, nd, dtype=np.float32)
    if nr: e[n - nr:] = np.linspace(s, 0, nr, dtype=np.float32)
    return e

def _fft(x): return np.fft.rfft(x)

def lp(x, fc, order=2):
    n = len(x); f = np.fft.rfftfreq(n, 1 / SR)
    return np.fft.irfft(_fft(x) / (1.0 + (f / max(fc, 1e-6)) ** (2 * order)), n).astype(np.float32)

def hp(x, fc, order=2):
    n = len(x); f = np.fft.rfftfreq(n, 1 / SR)
    H = 1.0 - 1.0 / (1.0 + (f / max(fc, 1e-6)) ** (2 * order))
    return np.fft.irfft(_fft(x) * H, n).astype(np.float32)

def bp(x, lo, hi, order=2): return lp(hp(x, lo, order), hi, order)

def add(buf, sig, t0, gain=1.0):
    i0 = int(t0 * SR)
    if i0 < 0: sig = sig[-i0:]; i0 = 0
    if i0 >= len(buf) or len(sig) == 0: return
    n = min(len(sig), len(buf) - i0)
    buf[i0:i0 + n] += sig[:n] * gain

def make_ir(dur, tau, predelay=0.012, hf=5000):
    n = int(dur * SR); h = rng.standard_normal(n).astype(np.float32)
    h *= np.exp(-nmask(n) / tau); h = lp(h, hf, 1)
    pd = int(predelay * SR)
    h = np.concatenate([np.zeros(pd, dtype=np.float32), h[pd:]])
    return h * 0.22

IR_LONG = make_ir(1.1, 0.36, 0.016, 4200)     # 大殿（短混响：静音要「突然」，尾巴不能拖）
IR_SHORT = make_ir(0.5, 0.08, 0.005, 7000)    # 近场

# ---------------------------------------------------------------- 立体声总线
BGM = np.zeros(N, dtype=np.float32)          # 会被整段门限切掉
AMB = np.zeros(N, dtype=np.float32)          # 环境声（静音时只留它）
SFX = np.zeros(N, dtype=np.float32)
SENDB = np.zeros(N, dtype=np.float32)
SENDA = np.zeros(N, dtype=np.float32)

def put(buf, send, sig, t0, gain=1.0, pan=0.0, rev=0.0):
    """单声道信号 → 立体声写进两路 bus（用 mid/side 近似声像）"""
    i0 = int(t0 * SR)
    if i0 >= N: return
    l = sig * (gain * np.sqrt(0.5 * (1 - pan)))
    r = sig * (gain * np.sqrt(0.5 * (1 + pan)))
    if buf is BGM:
        add(BGM_L, l, t0); add(BGM_R, r, t0)
    else:
        add(AMB_L, l, t0); add(AMB_R, r, t0)
    if rev > 0 and send is not None:
        add(send, sig, t0, gain * rev)

BGM_L = np.zeros(N, dtype=np.float32); BGM_R = np.zeros(N, dtype=np.float32)
AMB_L = np.zeros(N, dtype=np.float32); AMB_R = np.zeros(N, dtype=np.float32)
SFX_L = np.zeros(N, dtype=np.float32); SFX_R = np.zeros(N, dtype=np.float32)

def p_bgm(sig, t0, gain=1.0, pan=0.0, rev=0.0):
    add(BGM_L, sig, t0, gain * np.sqrt(0.5 * (1 - pan)))
    add(BGM_R, sig, t0, gain * np.sqrt(0.5 * (1 + pan)))
    if rev: add(SENDB, sig, t0, gain * rev)

def p_amb(sig, t0, gain=1.0, pan=0.0, rev=0.0):
    add(AMB_L, sig, t0, gain * np.sqrt(0.5 * (1 - pan)))
    add(AMB_R, sig, t0, gain * np.sqrt(0.5 * (1 + pan)))
    if rev: add(SENDA, sig, t0, gain * rev)

def p_sfx(sig, t0, gain=1.0, pan=0.0, rev=0.0, use_send=True):
    add(SFX_L, sig, t0, gain * np.sqrt(0.5 * (1 - pan)))
    add(SFX_R, sig, t0, gain * np.sqrt(0.5 * (1 + pan)))
    if rev: add(SENDA if use_send else SENDB, sig, t0, gain * rev)

# ---------------------------------------------------------------- 鼓组
def kick(dur=0.22):
    n = int(dur * SR); t = nmask(n)
    f = 150 * np.exp(-t * 26) + 48
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(dur, 0.075)).astype(np.float32)

def snare(dur=0.16):
    body = bp(noise(dur), 320, 5200, 2) * decay(dur, 0.045)
    tone = np.sin(2 * np.pi * 190 * nmask(int(dur * SR))) * decay(dur, 0.03) * 0.4
    return (body + tone).astype(np.float32)

def hat(dur=0.05):
    return (hp(noise(dur), 7000, 1) * decay(dur, 0.012)).astype(np.float32)

# ================================================================ 段落边界
T0 = 0.0
T_A   = F(113)          # 5.02  宝座进行曲结束
T_B   = F(248)          # 11.02 行进结束
T_C   = F(293)          # 13.02 城堡远景结束
T_W1  = F(383)          # 17.02 勇士一结束
T_W2  = F(473)          # 21.02
T_W3  = F(563)          # 25.02
T_W4  = F(675)          # 30.00
T_END = DUR

# ---- 1. 管风琴式 pad（贯穿，按和弦换）--------------------------------------
def pad(t0, dur, notes, gain=0.075):
    for m in notes:
        for det in (-0.6, 0.9):
            s = saw(midi(m) + det, dur) * env(dur, 0.25, 0.4, 0.85, 0.6)
            s = lp(s, 1500, 1)
            p_bgm(s, t0, gain, 0.0, 0.55)

CHORDS_A = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]]   # Am F C G
t = 0.0; ci = 0
while t < T_A:
    pad(t, 1.26, CHORDS_A[ci % 4]); ci += 1; t += 1.26

CHORDS_B = [[45, 57, 64], [48, 60, 67], [41, 53, 60], [43, 55, 62]]
t = T_A; ci = 0
while t < T_B:
    pad(t, 0.88, CHORDS_B[ci % 4], 0.062); ci += 1; t += 0.88

t = T_C; ci = 0
while t < T_W1:
    pad(t, 0.62, CHORDS_B[ci % 4], 0.058); ci += 1; t += 0.62
t = T_W1; ci = 0
while t < T_W2:
    pad(t, 0.62, CHORDS_A[ci % 4], 0.058); ci += 1; t += 0.62
t = T_W2; ci = 0
while t < T_W3:
    pad(t, 0.9, [45, 52, 57] if ci % 2 == 0 else [44, 51, 56], 0.05); ci += 1; t += 0.9
t = T_W3; ci = 0
while t < T_W4:
    pad(t, 0.5, CHORDS_A[ci % 4], 0.062); ci += 1; t += 0.5
pad(T_W4, 2.2, [45, 57, 60, 64], 0.075)
pad(T_W4 + 2.2, 2.8, [45, 52, 57, 64], 0.06)

# ---- 2. 主旋律（脉冲波，duty 0.25）-----------------------------------------
def melody(t0, seq, step, gain=0.10, pan=0.0):
    for i, m in enumerate(seq):
        if m is None: continue
        dur = step * 0.86
        s = sq(midi(m), dur, 0.25) * env(dur, 0.01, 0.08, 0.6, 0.1)
        s = lp(s, 3600, 1)
        p_bgm(s, t0 + i * step, gain, pan, 0.45)

# ① 宝座：英雄动机（A 小调）
MOTIF = [69, 72, 71, 69, 76, 74, 72, 69, None, 67, 69, 72, 71, 69, None, 64]
t = 0.6
while t < T_A - 0.5:
    melody(t, MOTIF, 0.315, 0.095)
    t += len(MOTIF) * 0.315

# ②③④ 行进：短促音型
MARCH = [69, None, 72, None, 71, None, 69, None, 76, None, 74, None, 72, None, 69, None]
t = T_A
while t < T_B - 0.3:
    melody(t, MARCH, 0.22, 0.075)
    t += len(MARCH) * 0.22

# ⑤ 城堡：低沉不安的动机
DREAD = [57, None, 58, None, 57, None, 56, None]
t = T_C
while t < T_W1 - 0.2:
    melody(t, DREAD, 0.45, 0.07)
    t += len(DREAD) * 0.45

# ⑥⑦⑨ 战斗：急促的高音冲刺
RUSH = [81, 79, 76, 79, 81, 83, 81, 79, 76, 74, 76, 79]
t = T_W1
while t < T_W2 - 0.2:
    melody(t, RUSH, 0.155, 0.075)
    t += len(RUSH) * 0.155
t = T_W2
while t < T_W3 - 0.2:
    melody(t, RUSH, 0.155, 0.075)
    t += len(RUSH) * 0.155
t = T_W3
while t < T_W4 - 0.2:
    melody(t, RUSH, 0.135, 0.08)
    t += len(RUSH) * 0.135

# ⑧ 徘徊：稀疏的钟摆式单音
t = T_W3 - 0.9
while t < T_W3 + 1.9:
    melody(t, [57, 57, None, 57], 0.55, 0.075, -0.35)
    t += 2.2

# ---- 3. 锯齿贝斯 ----------------------------------------------------------
def bassline(t0, seq, step, gain=0.10):
    for i, m in enumerate(seq):
        if m is None: continue
        dur = step * 0.9
        s = saw(midi(m), dur) * env(dur, 0.006, 0.05, 0.75, 0.06)
        s = lp(s, 900, 1)
        p_bgm(s, t0 + i * step, gain, 0.0, 0.2)

BASS_A = [45, 45, 41, 41, 48, 48, 43, 43]
m = T0
while m < T_A - 0.4:
    bassline(m, BASS_A, 0.63, 0.10); m += 5.04
m = T_A
while m < T_B - 0.4:
    bassline(m, [45, 41, 48, 43], 0.44, 0.09); m += 1.76
m = T_C
while m < T_W4 - 0.3:
    bassline(m, [45, 45, 41, 41, 48, 48, 43, 43], 0.31, 0.085); m += 2.48

# ---- 4. 鼓：明暗（kick / snare / hat）------------------------------------
def drums(t0, t1, beat, gain=1.0, hats=False):
    t = t0; i = 0
    while t < t1 - 0.05:
        b = i % 4
        if b == 0 or b == 2: p_bgm(kick(), t, 0.30 * gain, 0.0, 0.25)
        if b == 1 or b == 3: p_bgm(snare(), t, 0.16 * gain, 0.0, 0.3)
        if hats and b % 2 == 1: p_bgm(hat(), t + beat * 0.5, 0.06 * gain, 0.3, 0.2)
        t += beat; i += 1

drums(0.9, T_A, 0.63, 0.85)                    # ① 庄严进行曲
drums(T_A, T_B - 0.2, 0.44, 0.9, True)         # ②③④ 行进
drums(T_C, T_W1 - 0.2, 0.31, 0.95, True)       # ⑤ 城堡：不安
drums(T_W2 - 0.6, T_W2 + 1.6, 0.31, 0.5)       # ⑦ 开场一记
drums(T_W3 - 0.4, T_W3 + 0.6, 0.55, 0.35)      # ⑧ 踱步
drums(T_W4 - 3.0, T_W4 - 0.2, 0.22, 0.9, True) # ⑨ 冲锋加速
p_bgm(kick(), T_W4 + 0.2, 0.34, 0.0, 0.4)      # 收束落地

# ---- 5. 琶音（行进段 + 冲锋段）--------------------------------------------
ARP = [57, 60, 64, 69, 64, 60]
t = T_A
while t < T_B - 0.2:
    for i, m in enumerate(ARP):
        s = sq(midi(m), 0.10, 0.5) * decay(0.10, 0.030)
        p_bgm(s, t + i * 0.11, 0.045, -0.35 + 0.1 * i, 0.3)
    t += 0.66
t = T_W4 - 3.2
while t < T_W4 - 0.25:
    for i, m in enumerate(ARP):
        s = sq(midi(m + 12), 0.075, 0.5) * decay(0.075, 0.022)
        p_bgm(s, t + i * 0.08, 0.05, -0.3 + 0.1 * i, 0.3)
    t += 0.5

# ---- 6. 环境声：火焰 / 岩浆 / 风 / 大殿回响（静音时只留它）----------------
def amb_hum(t0, dur, base=42, gain=0.10, air=0.03):
    h = (0.16 * np.sin(2 * np.pi * base * nmask(int(dur * SR))) +
         0.09 * np.sin(2 * np.pi * base * 2 * nmask(int(dur * SR))) +
         0.05 * np.sin(2 * np.pi * base * 3 * nmask(int(dur * SR)))).astype(np.float32)
    h *= env(dur, 0.2, 0.3, 1.0, 0.4)
    a = lp(noise(dur), 700, 1) * air
    p_amb((h + a).astype(np.float32), t0, gain, 0.0, 0.5)

AMB_SECTIONS = [
    (0.0, T_A, 42, 0.10, 0.02),        # 殿堂火盆
    (T_A, T_B, 36, 0.085, 0.05),       # 风雪 / 林声 / 风沙
    (T_B, T_C, 30, 0.09, 0.06),        # 荒原
    (T_C, T_END, 44, 0.10, 0.04),      # 城堡：火焰与岩浆
]
for (a, b, base, g, air) in AMB_SECTIONS:
    amb_hum(a, b - a, base, g, air)

# 火焰噼啪（确定性）
t = T_C
while t < T_END - 0.1:
    p_amb(bp(noise(0.05), 900, 6000, 2) * decay(0.05, 0.012), t, 0.055, 0.5 * (1 if (int(t * 7) % 2) else -1), 0.5)
    t += 0.21

# ---- 7. 关键音效 ----------------------------------------------------------
# 城门开 / 抵达（248）
p_sfx(bp(noise(0.5), 60, 400, 2) * decay(0.5, 0.18), F(250), 0.26, 0.0, 0.6)
p_sfx(saw(48, 0.9) * decay(0.9, 0.30), F(250), 0.20, 0.0, 0.6)
# 雷（256 / 269 / 283）
for tf in (256, 269, 283):
    r = bp(noise(1.4), 40, 900, 1) * decay(1.4, 0.35)
    p_sfx(r, F(tf), 0.30, 0.15 * (1 if int(tf) % 2 else -1), 0.75)
# 举剑金属声 / 剑身高光（300 / 318）
p_sfx(bp(noise(0.30), 2400, 9000, 2) * decay(0.30, 0.09), F(300), 0.16, 0.4, 0.5)
p_sfx(sq(midi(96), 0.25, 0.5) * decay(0.25, 0.07), F(318), 0.10, -0.4, 0.5)
# 龙炎（344）—— 全切之后只留火焰低频轰（压低：静音要靠「音乐整段消失」读出来）
p_sfx(lp(noise(1.4), 260, 1) * env(1.4, 0.05, 0.2, 0.9, 0.6), F(344), 0.15, 0.0, 0.5)
# 白光吞没（362）
p_sfx(hp(noise(0.8), 3000, 1) * decay(0.8, 0.20), F(362), 0.14, 0.0, 0.6)
# 剑落地（372）
p_sfx(bp(noise(0.18), 1200, 9000, 2) * decay(0.18, 0.05), F(372), 0.30, -0.3, 0.6)
p_sfx(sq(midi(48), 0.6, 0.5) * decay(0.6, 0.16), F(372), 0.22, 0.0, 0.5)
# 火墙横扫（386） / 利爪下坠风压（432）
p_sfx(lp(noise(0.7), 500, 1) * env(0.7, 0.15, 0.2, 0.8, 0.4), F(386), 0.18, 0.5, 0.5)
p_sfx(saw(140, 0.9) * np.logspace(0, -1.2, int(0.9 * SR)).astype(np.float32), F(430), 0.13, 0.0, 0.5)
p_sfx(lp(noise(0.5), 200, 1) * decay(0.5, 0.14), F(446), 0.15, 0.0, 0.6)
# 踱步（473–505，每 0.5s 一步）
t = F(474)
while t < F(504):
    p_sfx(lp(noise(0.10), 420, 1) * decay(0.10, 0.035), t, 0.09, 0.35 * (1 if int(t * 4) % 2 else -1), 0.4)
    t += 0.5
# 放下武器（508）
p_sfx(bp(noise(0.22), 900, 7000, 2) * decay(0.22, 0.06), F(508), 0.20, 0.3, 0.6)
# 红光一闪（548）
p_sfx(saw(90, 0.4) * decay(0.4, 0.09), F(548), 0.15, 0.0, 0.5)
p_sfx(hp(noise(0.4), 2500, 1) * decay(0.4, 0.10), F(548), 0.10, 0.0, 0.6)
# 疾冲脚步（563–590）
t = F(564)
while t < F(590):
    p_sfx(lp(noise(0.07), 380, 1) * decay(0.07, 0.022), t, 0.08, 0.4 * (1 if int(t * 9) % 2 else -1), 0.35)
    t += 0.19
# 拔刺「咔」（648）
p_sfx(bp(noise(0.10), 2600, 9500, 2) * decay(0.10, 0.020), F(648), 0.34, 0.0, 0.6)
p_sfx(sq(midi(103), 0.22, 0.25) * decay(0.22, 0.05), F(648), 0.14, 0.0, 0.5)
# 龙崩解（662）：黑烟噪声 + 光点上扬
p_sfx(bp(noise(1.6), 120, 3200, 1) * env(1.6, 0.03, 0.25, 0.6, 1.0), F(662), 0.26, 0.0, 0.7)
t = F(662)
while t < F(676):
    p_sfx(np.sin(2 * np.pi * np.linspace(700, 2400, int(0.06 * SR))) * decay(0.06, 0.02), t, 0.06, -0.4 + 0.8 * ((t - F(662)) / 0.6), 0.5)
    t += 0.07
# 末帧收束
p_sfx(saw(45, 3.5) * env(3.5, 0.6, 0.8, 0.5, 1.6), F(676), 0.16, 0.0, 0.8)

# ---- 8. 关键节点「突然全静音」门限 ----------------------------------------
MUTES = [(F(344), 0.82), (F(432), 0.88), (F(548), 0.68), (F(648), 0.56)]
gate = np.ones(N, dtype=np.float32)
for (tm, ln) in MUTES:
    i0, i1 = int(tm * SR), int((tm + ln) * SR)
    i1 = min(i1, N)
    fade = int(0.004 * SR)
    gate[i0:i1] = 0.0
    if i0 > fade: gate[i0 - fade:i0] = np.linspace(1.0, 0.0, fade, dtype=np.float32)
    if i1 + fade < N: gate[i1:i1 + fade] = np.linspace(0.0, 1.0, fade, dtype=np.float32)

# 混响送出也要一起切 —— 否则静音窗口里全是音乐残留的混响尾巴，「突然静音」就不突然了
SENDB *= gate

# 环境声在静音窗口里也压到 35%：音乐整段没了，只留一层很轻的底噪
duck = np.ones(N, dtype=np.float32)
for (tm, ln) in MUTES:
    i0, i1 = int(tm * SR), min(int((tm + ln) * SR), N)
    fade = int(0.05 * SR)
    duck[i0:i1] = 0.35
    if i0 > fade: duck[i0 - fade:i0] = np.linspace(1.0, 0.35, fade, dtype=np.float32)
    if i1 + fade < N: duck[i1:i1 + fade] = np.linspace(0.35, 1.0, fade, dtype=np.float32)

# ---- 9. 混音 --------------------------------------------------------------
def conv(x, h):
    """FFT 卷积（直接 np.convolve 在 1.5M × 13 万点上是 O(n·m)，会跑到天亮）"""
    n = len(x) + len(h) - 1
    nfft = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(h, nfft), nfft)
    return y[:len(x)].astype(np.float32)

revL = conv(SENDB, IR_LONG) * 0.9 + conv(SENDA, IR_SHORT) * 0.8
revR = conv(np.roll(SENDB, 37), IR_LONG) * 0.9 + conv(np.roll(SENDA, 53), IR_SHORT) * 0.8

L = BGM_L * gate + AMB_L * duck + SFX_L + revL
R = BGM_R * gate + AMB_R * duck + SFX_R + revR

# 首尾淡入淡出
fi = int(0.15 * SR); fo = int(1.6 * SR)
L[:fi] *= np.linspace(0, 1, fi, dtype=np.float32); R[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
L[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32); R[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)

# 软限幅 + 归一化
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.25) * 0.92
mix /= max(1e-9, np.max(np.abs(mix)))
stereo = (mix * 32767).astype(np.int16)

with wave.open('audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(stereo.tobytes())

# ---- 10. 逐拍 RMS 自证（静音处必须塌到 ≈0）--------------------------------
def rms_of(t0, t1):
    a, b = int(t0 * SR), min(int(t1 * SR), N)
    if b <= a: return 0.0
    seg = mix[a:b]
    return float(np.sqrt(np.mean(seg ** 2)))

print(f'audio.wav  {DUR:.2f}s  {N} samples  peak={np.max(np.abs(mix)):.3f}')
print('每 0.5s RMS（B = BGM 被门限切掉处）：')
sel = MUTES
step = 0.5
t = 0.0
while t < DUR:
    r = rms_of(t, t + step)
    mark = ''
    for (tm, ln) in sel:
        if tm - 0.06 <= t <= tm + ln + 0.06: mark = ' ← 静音（只留环境声）'
    print(f'  {t:6.2f}s  rms {r:0.4f}{mark}')
    t += step
for (tm, ln) in sel:
    print(f'  静音段 {tm:.2f}s–{tm+ln:.2f}s  rms={rms_of(tm+0.02, tm+ln-0.02):0.4f}  帧{tm*22.5:.0f}')
