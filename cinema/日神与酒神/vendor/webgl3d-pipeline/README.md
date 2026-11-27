# WebGL3D 标准渲染管线 v1.0.0

这是需要真实三维遮挡时整目录复制的基线素材，不是 Canvas 2D 后处理模块。

## 文件

| 文件 | 职责 |
|---|---|
| `webgl3d_pipeline.js` | WebGL2、矩阵、网格验证、深度缓冲、背面剔除、材质、透明队列、法线光照、纹理和后处理 |
| `orbit_controls.js` | 拖拽、滚轮、WASD、Q/E 和 Shift 漫游 |
| `template_scene.html` | 最小可运行场景与调试视图 |
| `verify_pipeline.js` | Chromium + SwiftShader 冒烟测试并输出预览图 |
| `pipeline.json` | 版本与能力清单 |

## 使用

1. 把整个目录复制到新项目的 `vendor/webgl3d-pipeline/`，禁止只摘一个函数。
2. 从 `template_scene.html` 复制初始化结构。
3. 所有实体提交为 `{mesh, material, model}`，不要直接在业务代码里调用 `gl.draw*`。
4. 运行 `node verify_pipeline.js`，通过后再开发场景。

## 已提供的硬保证

- 不透明几何开启 `DEPTH_TEST`、深度写入和背面剔除。
- 透明材质单独按相机距离从远到近排序，默认不写深度。
- 面光照来自法线与灯光方向，不依赖“第几个面”。
- billboard 是带透明纹理的真实三维平面，参与深度测试。
- 场景先进入离屏帧缓冲，再进行统一后处理。
- 数字键 `1/2/3` 可切换正常、法线、深度视图。

详细规范见 `文档/01_制作管线/WebGL3D完整渲染管线.md`。
