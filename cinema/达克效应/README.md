# 达克效应

一个以 Canvas 2D 伪 3D、billboard 角色和 WebGL 后处理制作的复古 RPG 短片项目。

## 直接使用

- 双击 `漫游.html`：进入四场景漫游入口。
- 双击 `scenes/*.html`：查看静态指定帧；在地址后加 `?roam=1` 可单独漫游。
- 播放 `dunning_kruger.mp4`：查看最终成片。

漫游操作：`WASD` 移动，`Q/E` 升降，拖拽旋转视角，`Shift` 加速，空格暂停，`[`/`]` 逐帧，`R` 复位。

## 目录

```text
达克效应/
├─ 漫游.html                    # 推荐入口
├─ scenes/                     # 四个场景与共享绘制代码
├─ vendor/                     # 项目内置的漫游和 WebGL 后处理依赖
├─ docs/                       # 分镜、时间线、制作与检测管线
├─ frames/                     # 完整输出帧
├─ testsnap/                   # 检测快照
├─ _backup_before_polish_.../  # 修改前备份
├─ render.js / build.js        # 渲染与合成
├─ test_render.js              # 关键帧测试
├─ test_roam.js                # 四场景漫游交互回归
├─ inspect.js                  # 抽帧质量闸门
├─ probe_dragon.js             # 龙专项检测
├─ gen_audio.py                # 音频生成
├─ audio.wav                   # 音轨
└─ dunning_kruger.mp4          # 最终成片
```

## 文档

- [分镜与时间线](docs/分镜与时间线.md)
- [3D 网页场景制作与检测管线](docs/3D网页场景制作与检测管线.md)
- [文档索引](docs/README.md)

## 两条运行路径

1. 出片模式：场景默认执行 `window.renderFrame(frame)`，保证逐帧结果确定。
2. 漫游模式：`?roam=1` 启动自由相机和实时循环，不改变出片路径。

修改场景后，应先执行关键帧测试和检测，再决定是否重新生成全部帧与视频。具体流程见 `docs/3D网页场景制作与检测管线.md`。

```powershell
node test_roam.js
```

该命令会验证四个场景的加载、HUD、相机位移和统一入口切换，并更新 `testsnap/漫游入口预览.png`。
