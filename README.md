# 飞书群组交易信号监控系统

这是一个基于 Puppeteer + Node.js 的飞书群组消息监控和交易信号解析系统。

## 功能特性

- 🔍 自动监控飞书群组消息
- 📊 智能解析交易信号
- 🚀 HTTP API 接口发送解析结果
- 📝 完整的日志记录

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
编辑 `.env` 文件：
```bash
# 飞书相关配置
FEISHU_GROUP_URL=https://your-feishu-group-url
FEISHU_USERNAME=your-username
FEISHU_PASSWORD=your-password

# 本地服务配置
LOCAL_SERVER_PORT=3000
LOCAL_SERVER_HOST=localhost

# 监控配置
MONITOR_INTERVAL=5000
HEADLESS_MODE=true

# 日志配置
LOG_LEVEL=info
```

### 3. 启动系统
```bash
npm start
```

### 4. 测试系统
```bash
node test-simple.js
```

## 项目结构

```
feishuBot/
├── src/
│   ├── monitor/          # Puppeteer监控模块
│   ├── parser/           # 交易信号解析模块
│   ├── server/           # 本地HTTP服务
│   ├── utils/            # 工具模块
│   └── config/           # 配置文件
├── logs/                 # 日志文件
├── .env                  # 环境变量
├── index.js              # 主入口文件
└── package.json
```

## API 接口

- `GET /health` - 健康检查
- `POST /signal` - 接收交易信号
- `GET /signals/history` - 获取信号历史

## 注意事项

- 确保有稳定的网络连接
- 飞书账号需要有群组访问权限
- 建议在服务器环境下运行以保证稳定性

## 环境要求

- Node.js >= 16
- Ubuntu/Linux 环境
- Chrome/Chromium 浏览器（Puppeteer自动安装）
