// 演示启动脚本 - 不需要真实的飞书登录
const SignalParser = require('./src/parser/signalParser');
const HttpServer = require('./src/server/httpServer');
const config = require('./src/config/config');
const logger = require('./src/utils/logger');

class FeishuBotDemo {
    constructor() {
        this.parser = new SignalParser();
        this.server = new HttpServer(config.server);
        this.isRunning = false;
    }

    async init() {
        try {
            logger.info('🚀 正在初始化飞书交易信号监控系统 (演示模式)...');

            // 注册默认信号处理器
            this.server.addSignalHandler(this.defaultSignalHandler.bind(this));
            
            await this.server.start();
            logger.success('✅ HTTP服务器启动完成');

            logger.success('🎉 系统初始化完成！');
            return true;
        } catch (error) {
            logger.error(`❌ 系统初始化失败: ${error.message}`);
            return false;
        }
    }

    async start() {
        if (this.isRunning) {
            logger.warn('⚠️  系统已在运行中');
            return;
        }

        try {
            logger.info('🔄 正在启动监控系统 (演示模式)...');
            
            this.isRunning = true;
            
            // 开始模拟监控
            this.startDemoMonitoring();
            
            logger.success('🎯 监控系统已启动！');
            this.showStatus();

        } catch (error) {
            logger.error(`❌ 启动监控系统失败: ${error.message}`);
            this.isRunning = false;
        }
    }

    startDemoMonitoring() {
        const testMessages = [
            'BTC 买入信号，价格：45000，止损：44000',
            'ETH做空，目标价格2800，SL：2900',
            '建议DOGE多单，入场价0.08附近',
            'SOL看涨，建议45美元附近建仓',
            'MATIC突破，建议1.2做多',
            '今天天气不错', // 非交易信号
            'ADA有望上涨到0.5',
            'BNB止盈300'
        ];

        const sendTestMessage = () => {
            if (!this.isRunning) return;

            const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
            
            const message = {
                content: randomMessage,
                author: 'demo_trader',
                timestamp: Date.now()
            };
            
            logger.info(`📨 模拟收到消息: ${message.content}`);
            
            // 解析消息
            const signal = this.parser.parseMessage(message);
            
            if (signal) {
                logger.success(`🎯 检测到交易信号!`);
                logger.info(this.parser.formatSignal(signal));

                // 发送到HTTP服务器
                this.sendSignalToServer(signal);
            }

            // 随机间隔发送下一条消息 (5-15秒)
            const nextInterval = 5000 + Math.random() * 10000;
            setTimeout(sendTestMessage, nextInterval);
        };

        // 开始发送测试消息
        setTimeout(sendTestMessage, 2000);
    }

    async sendSignalToServer(signal) {
        try {
            // 直接调用服务器的处理方法
            await this.server.processSignal(signal);
            logger.success(`✅ 信号已处理: ${signal.action} ${signal.symbol}`);
        } catch (error) {
            logger.error(`❌ 处理信号失败: ${error.message}`);
        }
    }

    // 默认信号处理器
    async defaultSignalHandler(signal) {
        logger.info(`🔄 默认处理器处理信号: ${signal.action} ${signal.symbol || 'UNKNOWN'}`);
        
        // 这里可以添加你的处理逻辑
        // 例如：发送到交易所、记录数据库、发送通知等
        
        return {
            processed: true,
            timestamp: new Date().toISOString(),
            action: 'logged_and_processed'
        };
    }

    showStatus() {
        logger.info('📊 系统状态:');
        logger.info(`   监控状态: ${this.isRunning ? '✅ 运行中 (演示模式)' : '❌ 已停止'}`);
        logger.info(`   服务器地址: http://${config.server.host}:${config.server.port}`);
        logger.info('📡 可用接口:');
        logger.info(`   健康检查: GET http://${config.server.host}:${config.server.port}/health`);
        logger.info(`   接收信号: POST http://${config.server.host}:${config.server.port}/signal`);
        logger.info(`   信号历史: GET http://${config.server.host}:${config.server.port}/signals/history`);
        logger.info('💡 提示: 系统正在演示模式下运行，会自动生成测试交易信号');
    }

    async stop() {
        if (!this.isRunning) {
            logger.warn('⚠️  系统未在运行');
            return;
        }

        try {
            logger.info('🔄 正在停止监控系统...');

            this.isRunning = false;

            // 停止服务器
            if (this.server) {
                await this.server.stop();
            }

            logger.success('✅ 监控系统已停止');

        } catch (error) {
            logger.error(`❌ 停止系统失败: ${error.message}`);
        }
    }

    // 优雅关闭
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.info(`📥 收到 ${signal} 信号，正在优雅关闭...`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }
}

// 主函数
async function main() {
    const bot = new FeishuBotDemo();
    
    // 设置优雅关闭
    bot.setupGracefulShutdown();

    // 初始化系统
    const initSuccess = await bot.init();
    if (!initSuccess) {
        logger.error('❌ 系统初始化失败，退出程序');
        process.exit(1);
    }

    // 启动监控
    await bot.start();

    // 保持程序运行
    logger.info('🔄 程序持续运行中... (按 Ctrl+C 退出)');
    logger.info('🌐 你可以在另一个终端中运行以下命令测试API:');
    logger.info('   curl http://localhost:3000/health');
    logger.info('   curl http://localhost:3000/signals/history');
}

// 启动程序
main().catch((error) => {
    logger.error(`❌ 程序启动失败: ${error.message}`);
    process.exit(1);
});
