const express = require('express');
const logger = require('../utils/logger');

class HttpServer {
    constructor(config) {
        this.config = config;
        this.app = express();
        this.server = null;
        this.signalHandlers = [];
        this.signalHistory = [];
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });
    }

    setupRoutes() {
        // 健康检查接口
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: '1.0.0'
            });
        });

        // 获取服务状态
        this.app.get('/status', (req, res) => {
            res.json({
                status: 'running',
                handlers: this.signalHandlers.length,
                config: {
                    port: this.config.port,
                    host: this.config.host
                },
                timestamp: new Date().toISOString()
            });
        });

        // 接收交易信号的主要接口
        this.app.post('/signal', async (req, res) => {
            try {
                const signal = req.body;
                
                logger.info(`收到交易信号: ${signal.action} ${signal.symbol}`);

                // 验证信号格式
                const validation = this.validateSignal(signal);
                if (!validation.valid) {
                    return res.status(400).json({
                        error: 'Invalid signal format',
                        details: validation.errors
                    });
                }

                // 处理信号
                const results = await this.processSignal(signal);
                
                res.json({
                    success: true,
                    message: 'Signal processed successfully',
                    signal: signal,
                    results: results,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error(`处理信号时出错: ${error.message}`);
                res.status(500).json({
                    error: 'Internal server error',
                    message: error.message
                });
            }
        });

        // 获取最近的信号历史
        this.app.get('/signals/history', (req, res) => {
            const limit = parseInt(req.query.limit) || 50;
            const history = this.getSignalHistory(limit);
            
            res.json({
                signals: history,
                count: history.length,
                timestamp: new Date().toISOString()
            });
        });

        // 测试接口
        this.app.post('/test', (req, res) => {
            logger.info('收到测试请求');
            res.json({
                message: 'Test endpoint working',
                received: req.body,
                timestamp: new Date().toISOString()
            });
        });
    }

    validateSignal(signal) {
        const errors = [];

        if (!signal) {
            errors.push('Signal is required');
            return { valid: false, errors };
        }

        if (!signal.action || !['BUY', 'SELL', 'UNKNOWN'].includes(signal.action)) {
            errors.push('Valid action is required (BUY, SELL, UNKNOWN)');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    async processSignal(signal) {
        const results = [];

        // 记录信号到历史
        this.addToHistory(signal);

        // 调用所有注册的处理器
        for (const handler of this.signalHandlers) {
            try {
                const result = await handler(signal);
                results.push({
                    handler: handler.name || 'anonymous',
                    result: result,
                    success: true
                });
            } catch (error) {
                logger.error(`信号处理器错误: ${error.message}`);
                results.push({
                    handler: handler.name || 'anonymous',
                    error: error.message,
                    success: false
                });
            }
        }

        return results;
    }

    addSignalHandler(handler) {
        if (typeof handler !== 'function') {
            throw new Error('Handler must be a function');
        }
        
        this.signalHandlers.push(handler);
        logger.info(`注册信号处理器: ${handler.name || 'anonymous'}`);
    }

    addToHistory(signal) {
        this.signalHistory.unshift({
            ...signal,
            receivedAt: new Date().toISOString()
        });

        // 保持历史记录在合理范围内
        if (this.signalHistory.length > 1000) {
            this.signalHistory = this.signalHistory.slice(0, 1000);
        }
    }

    getSignalHistory(limit = 50) {
        return this.signalHistory.slice(0, limit);
    }

    async start() {
        return new Promise((resolve, reject) => {
            try {
                const port = this.config.port || 3000;
                const host = this.config.host || 'localhost';

                this.server = this.app.listen(port, host, () => {
                    logger.success(`HTTP服务器已启动: http://${host}:${port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    logger.error(`服务器启动失败: ${error.message}`);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('HTTP服务器已停止');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = HttpServer;
