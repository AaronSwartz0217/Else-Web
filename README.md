# Else Portfolio Website

一个基于 Three.js 的交互式3D个人作品集网站，展示游戏开发、技术美术和全栈开发的项目成果。

## 功能特点

### 🎨 3D交互展示
- 沉浸式3D场景导航，支持鼠标滚轮和触摸操作
- 模型展示区，可自由旋转视角查看作品
- 灯光调节系统，支持三档强度调节

### 📱 多端适配
- 桌面端：鼠标滚轮导航、OrbitControls视角控制
- 移动端：点击交互、触摸手势支持

### 🌐 页面结构
- **主页（introduction.html）**：个人介绍、专业技能、项目经历、竞赛获奖、活动经历
- **3D展示页（game.html）**：沉浸式3D模型展示，支持灯光调节
- **学习笔记（note.html）**：OneNote风格的技术笔记整理
- **作品详情（item.html）**：项目详细信息展示页

### 🎮 交互功能
- 平滑滚动导航
- 自动邮箱复制功能
- 响应式设计
- 灯光强度调节（L键或按钮）

## 技术栈

- **前端框架**: HTML5 + CSS3 + JavaScript
- **3D渲染**: Three.js
- **交互控制**: OrbitControls
- **UI设计**: 自定义CSS样式

## 项目结构

```
Else-Web/
├── index.html          # 首页重定向
├── introduction.html   # 个人介绍主页
├── game.html           # 3D展示页面
├── game.js             # 3D场景逻辑
├── script.js           # 主页面交互逻辑
├── note.html           # 学习笔记页面
├── item.html           # 作品详情页面
├── README.md           # 项目说明文档
└── assets/             # 资源文件目录
    └── models/         # 3D模型文件
```

## 快速开始

### 本地运行

```bash
# 克隆仓库
git clone git@github.com:AaronSwartz0217/Else-Web.git

# 进入项目目录
cd Else-Web

# 使用任意HTTP服务器启动
python -m http.server 8000
# 或
npx serve .
```

### 访问方式

- 主页：`http://localhost:8000/`
- 3D展示：`http://localhost:8000/game.html`
- 学习笔记：`http://localhost:8000/note.html`

## 操作指南

### 桌面端
- **滚轮**：前后移动导航
- **鼠标拖拽**：旋转视角
- **L键**：切换灯光强度
- **点击按钮**：灯光强度调节

### 移动端
- **点击屏幕中间区域**：前进
- **点击屏幕边缘区域**：后退
- **触摸拖拽**：旋转视角

## 项目亮点

1. **沉浸式体验**：基于Three.js的3D场景，提供沉浸式浏览体验
2. **响应式设计**：完美适配桌面端和移动端设备
3. **交互丰富**：多种交互方式，提升用户体验
4. **模块化结构**：清晰的页面结构，便于维护和扩展
5. **自动复制**：进入主页自动复制邮箱到剪贴板

## 作者信息

- **姓名**: Else
- **专业**: 计算机科学与技术
- **邮箱**: 2971762643@qq.com
- **GitHub**: https://github.com/AaronSwartz0217
- **作品集**: https://aaronswartz0217.github.io/Else-Web/

## 求职意向

- 游戏开发工程师
- 技术美术
- 全栈游戏开发者
- 数字孪生开发
- 前端开发

---

⭐ 如果这个项目对您有帮助，请给个Star！