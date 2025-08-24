const HttpServer = require('./src/server/httpServer');
const config = require('./src/config/config');

console.log('🧪 测试HTTP服务器...');

const server = new HttpServer(config.server);

// 注册测试处理器
server.addSignalHandler(async (signal) => {
    console.log('📨 处理器收到信号:', signal.action, signal.symbol);
    return { processed: true, timestamp: new Date().toISOString() };
});

// 启动服务器
server.start().then(() => {
    console.log('✅ 服务器启动成功！');
    console.log('💡 可以访问 http://localhost:3000/health 测试');
    
    // 5秒后自动停止
    setTimeout(async () => {
        await server.stop();
        console.log('✅ 测试完成，服务器已停止');
        process.exit(0);
    }, 5000);
}).catch(console.error);
