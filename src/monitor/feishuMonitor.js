const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class FeishuMonitor {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.page = null;
        this.isMonitoring = false;
        this.lastMessageCount = 0;
        this.messageCallback = null;
    }

    async init() {
        try {
            logger.info('正在初始化Puppeteer浏览器...');
            
            this.browser = await puppeteer.launch({
                headless: this.config.headless || true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });

            this.page = await this.browser.newPage();
            
            // 设置用户代理
            await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // 设置视窗大小
            await this.page.setViewport({ width: 1366, height: 768 });
            
            logger.success('Puppeteer浏览器初始化成功');
            return true;
        } catch (error) {
            logger.error(`浏览器初始化失败: ${error.message}`);
            return false;
        }
    }

    async login() {
        try {
            logger.info('正在登录飞书...');
            
            // 导航到飞书登录页面
            await this.page.goto('https://www.feishu.cn/messenger/', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // 等待登录页面加载
            await this.page.waitForTimeout(3000);

            // 检查是否已经登录
            const isLoggedIn = await this.checkLoginStatus();
            if (isLoggedIn) {
                logger.success('已经登录飞书');
                return true;
            }

            // 如果没有提供用户名密码，等待手动登录
            if (!this.config.username || !this.config.password) {
                logger.warn('未提供登录凭据，请手动登录');
                logger.info('请在浏览器中手动完成登录，然后系统会自动继续...');
                
                // 等待用户手动登录
                await this.waitForManualLogin();
            }

            return true;
        } catch (error) {
            logger.error(`登录失败: ${error.message}`);
            return false;
        }
    }

    async checkLoginStatus() {
        try {
            // 检查是否存在登录后的元素
            const loginIndicators = [
                '[data-testid="messenger-sidebar"]',
                '.messenger-sidebar',
                '[class*="sidebar"]'
            ];

            for (const selector of loginIndicators) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    return true;
                } catch (e) {
                    continue;
                }
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    async waitForManualLogin() {
        return new Promise((resolve) => {
            const checkLogin = async () => {
                const isLoggedIn = await this.checkLoginStatus();
                if (isLoggedIn) {
                    logger.success('检测到登录成功');
                    resolve();
                } else {
                    setTimeout(checkLogin, 2000);
                }
            };
            checkLogin();
        });
    }

    async navigateToGroup() {
        try {
            logger.info('正在导航到指定群组...');
            
            if (this.config.groupUrl) {
                await this.page.goto(this.config.groupUrl, { 
                    waitUntil: 'networkidle2',
                    timeout: 30000 
                });
            }

            // 等待群组页面加载
            await this.page.waitForTimeout(3000);
            
            logger.success('成功导航到群组页面');
            return true;
        } catch (error) {
            logger.error(`导航到群组失败: ${error.message}`);
            return false;
        }
    }

    async startMonitoring(messageCallback) {
        if (this.isMonitoring) {
            logger.warn('监控已在运行中');
            return;
        }

        this.messageCallback = messageCallback;
        this.isMonitoring = true;
        
        logger.info('开始监控群组消息...');
        
        // 模拟监控 - 每隔一段时间生成测试消息
        this.monitorLoop();
    }

    async monitorLoop() {
        if (!this.isMonitoring) return;

        try {
            // 模拟接收到新消息
            if (Math.random() > 0.7) { // 30%的概率生成测试消息
                const testMessages = [
                    'BTC 买入信号，价格：45000，止损：44000',
                    'ETH做空，目标价格2800',
                    '建议DOGE多单，入场价0.08附近',
                    'SOL看涨，建议45美元附近建仓',
                    '今天天气不错' // 非交易信号
                ];
                
                const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
                
                const message = {
                    content: randomMessage,
                    author: 'test_trader',
                    timestamp: Date.now()
                };
                
                logger.info(`模拟收到消息: ${message.content}`);
                
                if (this.messageCallback) {
                    await this.messageCallback(message);
                }
            }
            
        } catch (error) {
            logger.error(`监控过程中出错: ${error.message}`);
        }

        // 继续下一轮监控
        setTimeout(() => this.monitorLoop(), this.config.interval || 10000);
    }

    stopMonitoring() {
        this.isMonitoring = false;
        logger.info('已停止监控');
    }

    async close() {
        try {
            this.stopMonitoring();
            if (this.browser) {
                await this.browser.close();
                logger.info('浏览器已关闭');
            }
        } catch (error) {
            logger.error(`关闭浏览器失败: ${error.message}`);
        }
    }
}

module.exports = FeishuMonitor;
