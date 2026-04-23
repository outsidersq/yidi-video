# 同频 · 浏览器插件

> 和朋友一起同步看视频，支持语音通话、聊天、降噪和字幕同步。

---

## 目录结构

```
extension/
├── manifest.json        # Chrome 插件配置 (Manifest V3)
├── background.js        # Service Worker — 角标更新
├── content.js           # 注入视频页面 — 视频同步 + 侧边栏注入
├── popup.html/js/css    # 插件弹出窗口 UI
├── sidebar.html/js/css  # 侧边栏面板 UI (含 WebRTC 语音)
├── icons/               # 插件图标 (需自行添加 16/48/128px PNG)
└── server/
    ├── server.js        # WebSocket 信令 + 同步服务器 (Node.js)
    └── package.json
```

---

## 快速开始

### 1. 启动同步服务器

```bash
cd extension/server
npm install
npm start
# 服务器运行在 ws://localhost:8080
```

**部署到公网**（推荐 Railway / Fly.io / Render）：
```bash
# 设置环境变量
PORT=8080 node server.js
```
部署后，修改 `content.js` 第 7 行：
```js
const SERVER_URL = 'wss://your-server.example.com';
```

### 2. 安装 Chrome 插件

1. 打开 `chrome://extensions/`
2. 开启右上角 **「开发者模式」**
3. 点击 **「加载已解压的扩展程序」**
4. 选择 `extension/` 文件夹
5. 插件图标出现在工具栏 ✅

> **注意**：需要先在 `icons/` 目录放置 3 个 PNG 图标：
> `icon16.png`、`icon48.png`、`icon128.png`

---

## 功能说明

### 视频同步
- 支持 **B站、爱奇艺、优酷、腾讯视频、YouTube** 及所有 HTML5 视频
- 主持人的播放/暂停/跳转会实时同步给所有成员
- 成员加入时自动跳到当前进度

### 语音通话 (WebRTC)
- 浏览器原生 P2P 语音，无需额外软件
- **背景降噪**：可调节轻柔 / 标准 / 强力三档
- **回声消除**：防止对方声音回传
- **自动增益**：自动调节麦克风音量
- 通话质量：64 / 96 / 128 kbps 可选

### 房间管理
- 6 位字母房间码，一键分享链接
- 主持人模式 / 自由模式
- 主持人离开时自动转移控制权
- 最多 5 人同时观看

### 聊天 & 字幕
- 实时文字聊天 + Emoji 快速反应
- 字幕同步（显示当前播放位置对应台词）

---

## 架构说明

```
┌─────────────────────────────────────────┐
│           浏览器 (Chrome)                │
│                                         │
│  ┌──────────┐    ┌──────────────────┐   │
│  │ popup.js │───▶│  content.js      │   │
│  └──────────┘    │  (视频页面注入)   │   │
│                  │                  │   │
│                  │  ┌────────────┐  │   │
│                  │  │ sidebar    │  │   │
│                  │  │ (iframe)   │  │   │
│                  │  └────────────┘  │   │
│                  └────────┬─────────┘   │
└───────────────────────────┼─────────────┘
                            │ WebSocket
                            ▼
                 ┌──────────────────┐
                 │   server.js      │
                 │  (Node.js WS)    │
                 │                  │
                 │  • 房间管理       │
                 │  • 视频同步广播   │
                 │  • 聊天消息转发   │
                 │  • WebRTC 信令   │
                 └──────────────────┘
```

**通信协议**：

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `create` / `join` | Client → Server | 创建/加入房间 |
| `sync` | Host → Server → All | 视频同步 (play/pause/seek) |
| `chat` | Client → Server → All | 聊天消息 |
| `rtc_offer/answer/ice` | Client → Server → Peer | WebRTC 点对点信令 |
| `member_join/leave` | Server → All | 成员变动通知 |
| `host_transfer` | Server → All | 主持人转移 |

---

## 开发 & 扩展

### 修改服务器地址
```js
// content.js 第 7 行
const SERVER_URL = 'wss://your-server.com';
```

### 添加新平台支持
```js
// content.js getVideo() 函数中添加选择器
const selectors = [
  '.your-platform video',
  // ...
];
```

### 权限说明
插件仅请求以下权限：
- `storage` — 保存用户设置
- `tabs` / `activeTab` — 获取当前标签页信息
- `<all_urls>` — 在视频网站注入内容脚本
- **麦克风权限** — 语音通话（用户主动开启时才弹出授权）

---

## 许可

MIT License
