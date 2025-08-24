// 真实飞书监控启动脚本
const FeishuMonitor = require('./src/monitor/feishuMonitor');
const SignalParser = require('./src/parser/signalParser');
const HttpServer = require('./src/server/httpServer');
const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const axios = require('axios');

class RealFeishuBot {
    constructor() {
        this.monitor = null;
        this.parser = null;
        this.server = null;
        this.isRunning = false;
    }

    async init() {
        try {
            logger.info('🚀 正在初始化飞书交易信号监控系统 (真实模式)...');

            // 初始化信号解析器
            this.parser = new SignalParser();
            logger.success('✅ 信号解析器初始化完成');

            // 初始化HTTP服务器
            this.server = new HttpServer(config.server);
            
            // 注册默认信号处理器
            this.server.addSignalHandler(this.defaultSignalHandler.bind(this));
            
            await this.server.start();
            logger.success('✅ HTTP服务器启动完成');

            // 初始化飞书监控器 - 设置为非无头模式以便手动操作
            const monitorConfig = {
                ...config.feishu,
                headless: false // 强制显示浏览器界面
            };
            
            this.monitor = new FeishuMonitor(monitorConfig);
            const initSuccess = await this.monitor.init();
            
            if (!initSuccess) {
                throw new Error('飞书监控器初始化失败');
            }
            
            logger.success('✅ 飞书监控器初始化完成');
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
            logger.info('🔄 正在启动监控系统 (真实模式)...');
            logger.info('📱 浏览器窗口将会打开，请按照提示操作');

            // 登录飞书
            logger.info('🔐 开始登录流程...');
            const loginSuccess = await this.monitor.login();
            if (!loginSuccess) {
                throw new Error('飞书登录失败');
            }

            // 导航到群组 (手动方式)
            logger.info('🔍 开始群组导航流程...');
            const navSuccess = await this.monitor.navigateToGroup();
            if (!navSuccess) {
                logger.warn('⚠️  群组导航失败，请检查');
                return;
            }

            // 开始监控
            this.monitor.startMonitoring(this.handleNewMessage.bind(this));
            
            this.isRunning = true;
            logger.success('🎯 监控系统已启动！');
            
            // 显示系统状态
            this.showStatus();

        } catch (error) {
            logger.error(`❌ 启动监控系统失败: ${error.message}`);
            this.isRunning = false;
        }
    }

    async handleNewMessage(message) {
        try {
            logger.info(`📨 收到新消息: ${message.content.substring(0, 50)}...`);
            logger.debug(`消息详情: 作者=${message.author}, 时间=${message.time}`);

            // 解析消息中的交易信号
            const signal = this.parser.parseMessage(message);
            
            if (signal) {
                logger.success(`🎯 检测到交易信号!`);
                logger.info(this.parser.formatSignal(signal));

                // 发送信号到本地服务器
                await this.sendSignalToServer(signal);
            } else {
                logger.debug('该消息不包含有效的交易信号');
            }

        } catch (error) {
            logger.error(`❌ 处理消息失败: ${error.message}`);
        }
    }

    async sendSignalToServer(signal) {
        try {
            const url = `http://${config.server.host}:${config.server.port}/signal`;
            
            const response = await axios.post(url, signal, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                logger.success(`✅ 信号已发送到服务器: ${signal.action} ${signal.symbol}`);
            } else {
                logger.warn(`⚠️  服务器响应异常: ${response.status}`);
            }

        } catch (error) {
            logger.error(`❌ 发送信号到服务器失败: ${error.message}`);
        }
    }

    // 默认信号处理器
    async defaultSignalHandler(signal) {
        logger.info(`🔄 默认处理器处理信号: ${signal.action} ${signal.symbol || 'UNKNOWN'}`);
        
        return {
            processed: true,
            timestamp: new Date().toISOString(),
            action: 'logged_and_processed',
            signal_summary: `${signal.action} ${signal.symbol} @ ${signal.price || 'N/A'}`
        };
    }

    showStatus() {
        logger.info('📊 系统状态:');
        logger.info(`   监控状态: ${this.isRunning ? '✅ 运行中 (真实模式)' : '❌ 已停止'}`);
        logger.info(`   服务器地址: http://${config.server.host}:${config.server.port}`);
        logger.info(`   监控间隔: ${config.feishu.interval}ms`);
        logger.info(`   浏览器模式: 可视化 (用于手动操作)`);
        logger.info('📡 可用接口:');
        logger.info(`   健康检查: GET http://${config.server.host}:${config.server.port}/health`);
        logger.info(`   接收信号: POST http://${config.server.host}:${config.server.port}/signal`);
        logger.info(`   信号历史: GET http://${config.server.host}:${config.server.port}/signals/history`);
        logger.info('💡 提示: 系统正在监控真实的飞书群组消息');
    }

    async stop() {
        if (!this.isRunning) {
            logger.warn('⚠️  系统未在运行');
            return;
        }

        try {
            logger.info('🔄 正在停止监控系统...');

            // 停止监控
            if (this.monitor) {
                this.monitor.stopMonitoring();
                await this.monitor.close();
            }

            // 停止服务器
            if (this.server) {
                await this.server.stop();
            }

            this.isRunning = false;
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
        
        process.on('uncaughtException', (error) => {
            logger.error(`❌ 未捕获的异常: ${error.message}`);
            logger.error(error.stack);
            this.stop().then(() => process.exit(1));
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error(`❌ 未处理的Promise拒绝: ${reason}`);
            logger.error(`Promise: ${promise}`);
        });
    }
}

// 主函数
async function main() {
    const bot = new RealFeishuBot();
    
    // 设置优雅关闭
    bot.setupGracefulShutdown();

    // 显示启动说明
    logger.info('🎯 飞书真实监控模式');
    logger.info('�� 操作流程:');
    logger.info('   1. 系统将打开浏览器窗口');
    logger.info('   2. 请在浏览器中登录飞书');
    logger.info('   3. 手动导航到要监控的群组');
    logger.info('   4. 系统会自动检测并开始监控');
    logger.info('   5. 监控到的交易信号会自动解析和处理');
    logger.info('');

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
