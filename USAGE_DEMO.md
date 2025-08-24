# 飞书交易信号监控系统 - 演示指南

## 🎯 快速演示

### 1. 启动演示模式
```bash
npm run demo
```

演示模式会：
- ✅ 启动HTTP服务器 (http://localhost:3000)
- 🤖 自动生成模拟交易信号
- 📊 实时解析和处理信号
- 📝 记录所有活动到日志文件

### 2. 测试API接口

在另一个终端窗口中运行：

```bash
# 健康检查
curl http://localhost:3000/health

# 查看信号历史
curl http://localhost:3000/signals/history

# 发送自定义信号
curl -X POST http://localhost:3000/signal \
  -H "Content-Type: application/json" \
  -d '{
    "action": "BUY",
    "symbol": "BTC",
    "price": 45000,
    "confidence": 0.8,
    "rawText": "BTC买入信号测试"
  }'
```

### 3. 查看日志
```bash
# 查看所有日志
tail -f logs/all.log

# 查看成功日志
tail -f logs/success.log

# 查看错误日志
tail -f logs/error.log
```

## 🔧 真实部署

### 1. 配置环境变量
编辑 `.env` 文件：
```bash
# 飞书群组URL (必填)
FEISHU_GROUP_URL=https://your-feishu-group-url

# 飞书登录信息 (可选，留空则手动登录)
FEISHU_USERNAME=your-username
FEISHU_PASSWORD=your-password

# 其他配置
HEADLESS_MODE=true
MONITOR_INTERVAL=5000
```

### 2. 启动真实监控
```bash
npm start
```

系统会：
1. 启动Puppeteer浏览器
2. 打开飞书网页版
3. 等待你手动登录（如果没有提供用户名密码）
4. 导航到指定群组
5. 开始监控新消息
6. 解析交易信号并通过API发送

## 📊 信号格式

系统能识别的交易信号格式：

### 买入信号
- "BTC 买入信号，价格：45000"
- "ETH做多，目标价格2800"
- "建议DOGE多单，入场价0.08附近"

### 卖出信号
- "BTC卖出，止损44000"
- "ETH做空，目标价格2800"
- "建议平仓SOL空单"

### 支持的币种
BTC, ETH, BNB, ADA, SOL, DOGE, XRP, DOT, LINK, UNI, AVAX, MATIC, ATOM, FTM, NEAR, ALGO, VET, THETA, FIL, EOS, TRX, XLM, IOTA, NEO, DASH, ZEC, XMR, LTC

## 🎛️ 自定义处理器

你可以添加自定义的信号处理逻辑：

```javascript
// 在 start-demo.js 或 index.js 中添加
server.addSignalHandler(async (signal) => {
    console.log('收到信号:', signal);
    
    // 你的处理逻辑
    if (signal.action === 'BUY' && signal.symbol === 'BTC') {
        // 执行买入操作
        console.log('执行BTC买入操作');
    }
    
    return { processed: true, action: 'custom_action' };
});
```

## 📈 监控指标

系统提供以下监控数据：
- 信号接收数量
- 信号解析成功率
- 处理器执行状态
- 系统运行时间
- 错误统计

## �� 注意事项

1. **演示模式**: 仅用于测试，不会连接真实的飞书
2. **真实模式**: 需要有效的飞书账号和群组访问权限
3. **网络要求**: 确保服务器能访问飞书网站
4. **资源占用**: Puppeteer会占用一定的系统资源
5. **合规使用**: 请确保使用符合相关法律法规

## 🔍 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 查看端口占用
   lsof -i :3000
   
   # 修改端口
   echo "LOCAL_SERVER_PORT=3001" >> .env
   ```

2. **Puppeteer启动失败**
   ```bash
   # 安装依赖
   sudo apt-get update
   sudo apt-get install -y gconf-service libasound2-dev libatk1.0-dev libc6-dev libcairo2-dev libcups2-dev libdbus-1-dev libexpat1-dev libfontconfig1-dev libgcc1 libgconf-2-4 libgdk-pixbuf2.0-dev libglib2.0-dev libgtk-3-dev libnspr4-dev libpango-1.0-dev libpangocairo-1.0-dev libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
   ```

3. **日志文件过大**
   ```bash
   # 清理日志
   rm -f logs/*.log
   ```

## 📞 获取帮助

如果遇到问题：
1. 查看 `logs/error.log` 错误日志
2. 运行 `node test-simple.js` 测试基础功能
3. 检查环境变量配置
4. 确认网络连接正常
