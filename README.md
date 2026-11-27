# Else Portfolio Website

一个基于 Three.js 的交互式3D个人作品集网站，展示游戏开发、技术美术和全栈开发的项目成果。

## 功能特点

### 🎨 3D交互展示
- 沉浸式3D环形街机厅，支持拖拽环绕与滚轮缩放
- 五台可交互机柜，投币进入像素小游戏
- 通关后解锁对应项目档案

### 📱 多端适配
- 桌面端：鼠标滚轮导航、OrbitControls视角控制
- 移动端：点击交互、触摸手势支持

### 🌐 页面结构
- **主页（introduction.html）**：个人介绍、专业技能、项目经历、竞赛获奖、活动经历
- **街机厅（scene.html）**：Three.js 环形街机厅与可玩像素小游戏
- **学习笔记（note.html）**：OneNote风格的技术笔记整理
- **作品详情（item.html）**：项目详细信息展示页

### 🎮 交互功能
- 平滑滚动导航
- 自动复制网站链接功能
- 响应式设计

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
├── scene.html          # 3D 街机厅
├── arcade3d.js         # 街机厅 Three.js 场景
├── script.js           # 主页面交互逻辑
├── note.html           # 学习笔记页面
├── item.html           # 作品详情页面
├── README.md           # 项目说明文档
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
- 街机厅：`http://localhost:8000/scene.html`
- 学习笔记：`http://localhost:8000/note.html`

## 操作指南

### 桌面端
- **鼠标拖拽**：围绕机柜旋转视角
- **滚轮**：拉近 / 拉远
- **点击机柜**：投币进入对应游戏

### 移动端
- **单指拖拽**：围绕机柜旋转视角
- **点击机柜**：投币进入对应游戏

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
