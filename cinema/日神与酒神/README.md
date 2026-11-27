# 日神与酒神 · 三个 3D 场景

一支讲尼采《悲剧的诞生》的 60 秒片：**日神（梦·造型·边界）→ 酒神（醉·音乐·融化）→ 悲剧（两者按在同一座剧场里）**。
三个**真实 WebGL2 三维场景**各 20 秒，每个都能单独 `?roam=1` 漫游；整套复用上级 `共享资源/webgl3d-pipeline/`。

## 直接使用

- 双击 `漫游.html`：三段场景的漫游入口（也可按 1 / 2 / 3 切换）。
- 单独看某段：`scenes/A_apollo.html` / `B_dionysus.html` / `C_tragedy.html`，地址后加 `?roam=1` 进自由相机。
  漫游操作：`WASD` 平移 · `Q/E` 升降 · 拖拽转视角 · `Shift` 加速 · `[` `]` 逐帧 · 空格 播放/暂停 · `R` 复位。
- 播放 `apollo_dionysus.mp4`：成片；`apollo_dionysus_cover.png`：封面。

```powershell
node test_render.js              # 极值帧预览（26 帧，三段）
node test_roam.js                # 三段漫游回归 + 帧纯函数断言
node render.js                   # 1800 帧全量渲染（三段分段）
node inspect.js frames 30        # 像素级闸门（全片抽检）
python gen_audio.py              # 60s 音轨（打印逐段 RMS）
node build.js                    # 合成 apollo_dionysus.mp4
node cover.js 1780               # 出封面
```

## 目录

```text
日神与酒神/
├─ 剧本.md                      # 拍表 / 色彩脚本 / 字幕表 / 真实锚点（中文对照，唯一事实来源是各场景的表）
├─ 漫游.html                    # 三段场景漫游入口
├─ scenes/
│   ├─ common.js                # 共享工具箱：相机 / 后处理 / 文字层 / 几何合并 / 人物与雕像画笔 / 火焰·天空·水面·面具烘焙
│   ├─ A_apollo.html            # ① 日神 · 光明庭院（源帧 0–600）
│   ├─ B_dionysus.html          # ② 酒神 · 夜里的狂欢（600–1200）
│   └─ C_tragedy.html           # ③ 悲剧 · 半圆剧场（1200–1800）
├─ vendor/webgl3d-pipeline/     # 复制的 WebGL3D 标准管线 v1.0.0（整目录，未做任何删改）
├─ audio.wav                    # 60.0s 48kHz 立体声程序化音轨
├─ apollo_dionysus.mp4          # 成片
├─ apollo_dionysus_cover.png    # 封面（源帧 1780）
└─ render.js / build.js / cover.js / test_render.js / test_roam.js / inspect.js / gen_audio.py
```

## 复制的管线版本

| 项 | 值 |
|---|---|
| 管线 | `共享资源/webgl3d-pipeline/` |
| 版本 | **v1.0.0**（见 `vendor/webgl3d-pipeline/pipeline.json`） |
| 验收 | `node vendor/webgl3d-pipeline/verify_pipeline.js` → `pass: true`，`glErrors: []` |

## 三个场景各自的"物种"

| 段 | 空间 | 光 | 后处理 |
|---|---|---|---|
| ① 日神 | 白大理石庭院（八柱神庙 + 侧廊 + 六座雕像 + 水池 + 白衣行列） | 正午白光，太阳方位缓慢转 → 柱影扫过地面 | **最干净**（低颗粒、低色差）：梦要通透 |
| ② 酒神 | 夜里的山林空地（火堆 + 八支火把 + 酒桶 + 面具 + 藤蔓 + 萨提尔 + 十四名舞者） | 火是唯一光源，火光按帧跳动 | **最脏**（颗粒重、色差大、暗角深）：醉 |
| ③ 悲剧 | 半圆剧场（九级看台 + skene 三扇门 + 歌队席 + 台上一个人） | 破晓：太阳在歌队身后升起（舞台亮、歌队逆光） | 中间档，到点题卡收到最干净 |

**主题色纪律**：酒红族（`r>140 && g<0.52r && 0.40r<b<0.90r`）**只允许出现在点题卡的标题**——
闸门 `inspect.js` 对前 52 秒断言 `wine ≤ 300`（实测为 0），对 `src ≥ 1582` 断言 `wine ≥ 2000`（实测约 31000）。

## 两条纪律（沿用自《曼德拉效应》的踩坑）

1. **billboard 的模型矩阵一律在所有 `position` 更新之后**由 `common.js` 的 `boot()` 统一生成 —— 场景的 `update()` 只许改 `position` / 材质。`test_roam.js` 里对三段各断言一次"同一帧连渲两次像素一致"。
2. **机位表写三段式**（落定 → 驻留 → 离开），关键帧不压在拍边界上，保证每条字幕出现时镜头正对它所描述的东西。

规范出处：[`文档/01_制作管线/WebGL3D完整渲染管线.md`](../文档/01_制作管线/WebGL3D完整渲染管线.md) · [`共享资源/README.md`](../共享资源/README.md) · [`技术栈与风格.md §6.27`](../文档/02_技术规范/技术栈与风格.md#627-真实-webgl2-三维接进本仓库的管线)。
