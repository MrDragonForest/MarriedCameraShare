# 📷 MarriedCameraShare - 家庭影像分享系统

一个简单好用的家庭照片分享Web应用。

## 功能特点

- 🔐 **用户系统**：注册登录，验证码保护
- 📸 **照片上传**：支持多选、标签功能
- 🖼️ **瀑布流浏览**：按天分组显示
- 🔍 **智能筛选**：按用户、日期、标签筛选
- 📱 **响应式设计**：支持手机/电脑

## 使用说明

### 1. 部署到 GitHub Pages

1. 创建 GitHub 仓库
2. 上传所有文件
3. 进入 Settings → Pages
4. Source 选择 `main` 分支
5. 访问 `https://你的用户名.github.io/仓库名`

### 2. 默认账号

首次使用请注册账号（验证码：点击图片刷新）

## 技术栈

- HTML5 + CSS3 + JavaScript
- 无后端（使用 localStorage 存储）
- GitHub Pages 部署

## 文件结构

```
MarriedCameraShare/
├── index.html      # 主页面
├── app.js         # 核心逻辑
├── styles.css     # 样式文件
├── data/          # 数据目录
│   ├── users.json
│   └── posts.json
└── images/        # 图片存储目录
```

## ⚠️ 注意

- 本项目使用 localStorage 存储数据，**数据保存在浏览器本地**
- 不同浏览器/设备数据不互通
- 如需多设备同步，需要后端服务支持

## License

MIT
