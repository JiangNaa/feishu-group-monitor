const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class FeishuMonitor {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.page = null;
        this.pages = {}; // 存储多个页面
        this.isMonitoring = false;
        this.lastMessageCount = 0;
        this.lastMessageCounts = {}; // 每个群组的消息计数
        this.messageCallback = null;
        this.targetGroups = [
            'wwg-活跃现货-姆少聚合',
            'WWG-活跃合约-姆少聚合'
        ];
        this.targetAuthors = ['woods', 'eli']; // 只处理这些作者的消息
        this.messageStats = {
            total: 0,
            filtered: 0,
            byAuthor: {}
        };
    }

    // 延迟方法，替代已废弃的 waitForTimeout
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        try {
            logger.info('正在初始化Puppeteer浏览器...');
            
            this.browser = await puppeteer.launch({
                headless: this.config.headless || false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-blink-features=AutomationControlled'
                ],
                defaultViewport: null,
                ignoreDefaultArgs: ['--enable-automation'],
                executablePath: undefined // 使用系统默认Chrome
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
            logger.info('正在打开飞书网页版...');
            await this.page.goto('https://www.feishu.cn/messenger/', { 
                waitUntil: 'networkidle2',
                timeout: 60000 
            });

            // 等待登录页面加载
            logger.info('等待页面加载完成...');
            await this.delay(5000);

            // 检查是否已经登录
            const isLoggedIn = await this.checkLoginStatus();
            if (isLoggedIn) {
                logger.success('检测到已登录状态');
                return true;
            }

            // 提示用户手动登录
            logger.info('🔐 请在打开的浏览器窗口中完成以下操作：');
            logger.info('   1. 选择登录方式（手机号/邮箱/扫码等）');
            logger.info('   2. 输入登录凭据');
            logger.info('   3. 完成验证（如短信验证码、二维码扫描等）');
            logger.info('   4. 等待系统自动检测登录成功');
            logger.info('');
            logger.info('⏳ 系统正在等待您完成登录...');
            
            // 等待用户手动登录
            await this.waitForManualLogin();

            return true;
        } catch (error) {
            logger.error(`登录过程出错: ${error.message}`);
            logger.error('请检查网络连接或稍后重试');
            return false;
        }
    }

    async checkLoginStatus() {
        try {
            // 检查是否存在登录后的元素
            const loginIndicators = [
                '[data-testid="messenger-sidebar"]',
                '.messenger-sidebar',
                '[class*="sidebar"]',
                '[class*="conversation"]',
                '[class*="chat-list"]',
                '.lark-spin-container',
                '[data-testid="chat-list"]'
            ];

            for (const selector of loginIndicators) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 3000 });
                    logger.debug(`检测到登录指示器: ${selector}`);
                    return true;
                } catch (e) {
                    continue;
                }
            }

            // 检查URL是否包含登录后的特征
            const currentUrl = this.page.url();
            if (currentUrl.includes('/messenger') && !currentUrl.includes('/login')) {
                logger.debug('URL显示已登录状态');
                return true;
            }

            return false;
        } catch (error) {
            logger.debug(`登录状态检测出错: ${error.message}`);
            return false;
        }
    }

    async waitForManualLogin() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 300; // 最多等待10分钟 (300 * 2秒)
            
            const checkLogin = async () => {
                attempts++;
                
                try {
                    const isLoggedIn = await this.checkLoginStatus();
                    if (isLoggedIn) {
                        logger.success('✅ 检测到登录成功！');
                        resolve();
                        return;
                    }

                    // 每30秒提示一次
                    if (attempts % 15 === 0) {
                        const minutes = Math.floor(attempts * 2 / 60);
                        logger.info(`⏳ 已等待 ${minutes} 分钟，请继续在浏览器中完成登录...`);
                    }

                    if (attempts >= maxAttempts) {
                        logger.error('❌ 登录等待超时，请重新启动程序');
                        resolve();
                        return;
                    }

                    setTimeout(checkLogin, 2000);
                } catch (error) {
                    logger.debug(`登录检测出错: ${error.message}`);
                    setTimeout(checkLogin, 2000);
                }
            };
            
            checkLogin();
        });
    }

    async navigateToGroup(groupName = null) {
        try {
            logger.info('正在导航到指定群组...');
            
            if (this.config.groupUrl) {
                await this.page.goto(this.config.groupUrl, { 
                    waitUntil: 'networkidle2',
                    timeout: 30000 
                });
            } else if (groupName) {
                // 查找并导航到指定群组
                const found = await this.findAndClickGroup(groupName);
                if (!found) {
                    throw new Error(`未找到群组: ${groupName}`);
                }
            }

            // 等待群组页面加载
            await this.delay(3000);
            
            logger.success('成功导航到群组页面');
            return true;
        } catch (error) {
            logger.error(`导航到群组失败: ${error.message}`);
            return false;
        }
    }

    async findAndClickGroup(groupName) {
        try {
            logger.info(`正在查找群组: ${groupName}`);
            
            // 等待侧边栏加载
            await this.delay(2000);
            
            // 尝试多种可能的群组列表选择器
            const groupListSelectors = [
                '[class*="chat-list"]',
                '[class*="conversation-list"]',
                '[class*="sidebar"] [class*="list"]',
                '[data-testid="chat-list"]',
                '.lark-list',
                '[class*="group-list"]'
            ];
            
            let groupListElement = null;
            for (const selector of groupListSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 3000 });
                    groupListElement = await this.page.$(selector);
                    if (groupListElement) {
                        logger.debug(`找到群组列表元素: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!groupListElement) {
                logger.warn('未找到群组列表，尝试搜索功能');
                return await this.searchGroup(groupName);
            }
            
            // 查找包含指定名称的群组
            const groupSelectors = [
                `[title*="${groupName}"]`,
                `[aria-label*="${groupName}"]`,
                `*:contains("${groupName}")`,
                `[class*="conversation-item"]:contains("${groupName}")`,
                `[class*="chat-item"]:contains("${groupName}")`
            ];
            
            for (const selector of groupSelectors) {
                try {
                    const groupElement = await this.page.$(selector);
                    if (groupElement) {
                        logger.success(`找到群组: ${groupName}`);
                        await groupElement.click();
                        await this.delay(2000);
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // 如果直接选择器没找到，尝试遍历所有群组项
            return await this.findGroupByText(groupName);
            
        } catch (error) {
            logger.error(`查找群组失败: ${error.message}`);
            return false;
        }
    }
    
    async searchGroup(groupName) {
        try {
            logger.info('尝试使用搜索功能查找群组...');
            
            // 查找搜索框
            const searchSelectors = [
                'input[placeholder*="搜索"]',
                'input[placeholder*="search"]',
                '[class*="search"] input',
                '[data-testid="search-input"]'
            ];
            
            for (const selector of searchSelectors) {
                try {
                    const searchBox = await this.page.$(selector);
                    if (searchBox) {
                        await searchBox.click();
                        await searchBox.type(groupName);
                        await this.page.keyboard.press('Enter');
                        await this.delay(2000);
                        
                        // 点击搜索结果中的群组
                        const resultSelectors = [
                            `[class*="search-result"]:contains("${groupName}")`,
                            `[class*="result-item"]:contains("${groupName}")`
                        ];
                        
                        for (const resultSelector of resultSelectors) {
                            try {
                                const result = await this.page.$(resultSelector);
                                if (result) {
                                    await result.click();
                                    await this.delay(2000);
                                    return true;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            return false;
        } catch (error) {
            logger.error(`搜索群组失败: ${error.message}`);
            return false;
        }
    }
    
    async findGroupByText(groupName) {
        try {
            logger.info('遍历群组列表查找目标群组...');
            
            // 使用页面评估来查找包含指定文本的元素
            const found = await this.page.evaluate((targetName) => {
                // 查找所有可能包含群组名称的元素
                const elements = document.querySelectorAll('*');
                
                for (let element of elements) {
                    if (element.textContent && element.textContent.includes(targetName)) {
                        // 检查是否是可点击的群组项
                        const isClickable = element.onclick || 
                                          element.getAttribute('role') === 'button' ||
                                          element.tagName === 'BUTTON' ||
                                          element.classList.contains('clickable') ||
                                          element.closest('[class*="conversation"]') ||
                                          element.closest('[class*="chat-item"]');
                        
                        if (isClickable || element.closest('[class*="list-item"]')) {
                            element.click();
                            return true;
                        }
                    }
                }
                return false;
            }, groupName);
            
            if (found) {
                logger.success(`通过文本匹配找到并点击了群组: ${groupName}`);
                await this.delay(2000);
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`遍历查找群组失败: ${error.message}`);
            return false;
        }
    }

    async getRecentMessages(count = 10) {
        try {
            logger.info(`正在获取最近 ${count} 条消息...`);
            
            // 等待消息区域加载
            await this.delay(3000);
            
            // 尝试多种可能的消息容器选择器
            const messageContainerSelectors = [
                '[class*="message-list"]',
                '[class*="chat-content"]',
                '[class*="conversation-content"]',
                '[class*="message-container"]',
                '[data-testid="message-list"]',
                '[class*="chat-messages"]',
                '.lark-message-list'
            ];
            
            let messageContainer = null;
            for (const selector of messageContainerSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    messageContainer = await this.page.$(selector);
                    if (messageContainer) {
                        logger.debug(`找到消息容器: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!messageContainer) {
                logger.warn('未找到消息容器，尝试直接获取消息元素');
            }
            
            // 获取消息元素
            const messages = await this.page.evaluate((maxCount) => {
                const messageSelectors = [
                    '[class*="message-item"]',
                    '[class*="chat-message"]',
                    '[class*="message-bubble"]',
                    '[data-testid="message"]',
                    '.lark-message',
                    '[class*="message-content"]'
                ];
                
                let messageElements = [];
                
                // 尝试每个选择器
                for (const selector of messageSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        messageElements = Array.from(elements);
                        break;
                    }
                }
                
                // 如果没找到特定的消息元素，尝试查找包含文本的通用元素
                if (messageElements.length === 0) {
                    const allElements = document.querySelectorAll('*');
                    for (let element of allElements) {
                        if (element.textContent && 
                            element.textContent.trim().length > 10 && 
                            element.children.length === 0 && // 叶子节点
                            !element.tagName.match(/^(SCRIPT|STYLE|META|LINK|TITLE)$/)) {
                            messageElements.push(element);
                        }
                    }
                }
                
                // 提取消息信息
                const messages = [];
                const recentElements = messageElements.slice(-maxCount); // 获取最近的消息
                
                for (let element of recentElements) {
                    try {
                        const content = element.textContent?.trim();
                        if (content && content.length > 0) {
                            // 尝试获取时间戳
                            let timestamp = null;
                            const timeElement = element.querySelector('[class*="time"]') || 
                                             element.querySelector('[class*="timestamp"]') ||
                                             element.closest('[class*="message"]')?.querySelector('[class*="time"]');
                            
                            if (timeElement) {
                                timestamp = timeElement.textContent?.trim();
                            }
                            
                            // 尝试获取发送者
                            let author = null;
                            const authorElement = element.querySelector('[class*="author"]') ||
                                                element.querySelector('[class*="sender"]') ||
                                                element.querySelector('[class*="username"]') ||
                                                element.closest('[class*="message"]')?.querySelector('[class*="author"]');
                            
                            if (authorElement) {
                                author = authorElement.textContent?.trim();
                            }
                            
                            messages.push({
                                content: content,
                                author: author || 'Unknown',
                                timestamp: timestamp || new Date().toLocaleString(),
                                element_info: {
                                    tagName: element.tagName,
                                    className: element.className,
                                    id: element.id
                                }
                            });
                        }
                    } catch (e) {
                        console.log('Error processing message element:', e);
                    }
                }
                
                return messages;
            }, count);
            
            if (messages && messages.length > 0) {
                logger.success(`成功获取到 ${messages.length} 条消息`);
                return messages;
            } else {
                logger.warn('未获取到任何消息，可能需要调整选择器');
                return [];
            }
            
        } catch (error) {
            logger.error(`获取消息失败: ${error.message}`);
            return [];
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

    async startRealTimeMonitoring(messageCallback) {
        if (this.isMonitoring) {
            logger.warn('监控已在运行中');
            return;
        }

        this.messageCallback = messageCallback;
        this.isMonitoring = true;
        this.lastMessageCount = 0;
        
        logger.info('开始实时监控群组消息...');
        logger.info('目标群组: wwg-活跃现货-姆少聚合, WWG-活跃合约-姆少聚合');
        
        // 真实监控循环
        this.realTimeMonitorLoop();
    }

    async startMultiTabMonitoring(messageCallback) {
        if (this.isMonitoring) {
            logger.warn('监控已在运行中');
            return;
        }

        this.messageCallback = messageCallback;
        this.isMonitoring = true;
        
        logger.info('🚀 开始多标签页实时监控...');
        logger.info('📋 将为每个群组创建独立的标签页');
        
        try {
            // 为每个群组创建标签页
            await this.setupMultiplePages();
            
            // 开始多页面监控循环
            this.multiTabMonitorLoop();
            
            logger.success('✅ 多标签页监控已启动');
            
        } catch (error) {
            logger.error(`❌ 多标签页监控启动失败: ${error.message}`);
            this.isMonitoring = false;
        }
    }

    async setupMultiplePages() {
        logger.info('🔧 设置多个标签页...');
        
        // 主页面用于登录
        const mainPage = this.page;
        
        // 为每个群组创建新的标签页
        for (let i = 0; i < this.targetGroups.length; i++) {
            const groupName = this.targetGroups[i];
            logger.info(`📄 为群组 "${groupName}" 创建标签页...`);
            
            let page;
            if (i === 0) {
                // 第一个群组使用主页面
                page = mainPage;
            } else {
                // 其他群组创建新标签页
                page = await this.browser.newPage();
                
                // 设置用户代理
                await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await page.setViewport({ width: 1366, height: 768 });
                
                // 导航到飞书
                await page.goto('https://www.feishu.cn/messenger/', { 
                    waitUntil: 'networkidle2',
                    timeout: 60000 
                });
                
                // 等待页面加载
                await this.delay(3000);
            }
            
            this.pages[groupName] = page;
            this.lastMessageCounts[groupName] = 0;
            
            logger.success(`✅ 群组 "${groupName}" 标签页已创建`);
        }
        
        logger.info('');
        logger.info('🎯 请在浏览器中完成以下操作：');
        logger.info('1. 确保所有标签页都已登录飞书');
        logger.info('2. 在第一个标签页中导航到 "wwg-活跃现货-姆少聚合"');
        logger.info('3. 在第二个标签页中导航到 "WWG-活跃合约-姆少聚合"');
        logger.info('4. 系统将在30秒后开始自动监控');
        logger.info('');
        
        // 等待用户手动导航
        for (let i = 30; i > 0; i--) {
            process.stdout.write(`\r⏳ 倒计时: ${i} 秒，请完成标签页导航...`);
            await this.delay(1000);
        }
        console.log(''); // 换行
        
        logger.success('🎉 开始监控所有标签页！');
    }

    async startMultiTabMonitoringWithHistory(messageCallback, historyCallback) {
        if (this.isMonitoring) {
            logger.warn('监控已在运行中');
            return;
        }

        this.messageCallback = messageCallback;
        this.isMonitoring = true;
        
        logger.info('🚀 开始多标签页实时监控...');
        logger.info('📋 将为每个群组创建独立的标签页');
        
        try {
            // 为每个群组创建标签页
            await this.setupMultiplePages();
            
            // 先获取历史消息
            if (historyCallback) {
                await historyCallback();
            }
            
            // 开始多页面监控循环
            this.multiTabMonitorLoop();
            
            logger.success('✅ 多标签页监控已启动');
            
        } catch (error) {
            logger.error(`❌ 多标签页监控启动失败: ${error.message}`);
            this.isMonitoring = false;
        }
    }

    // 检查是否应该处理该消息
    shouldProcessMessage(message) {
        const content = message.content || '';
        
        logger.debug(`🔍 检查消息内容: "${content.substring(0, 150)}..."`);
        logger.debug(`🎯 目标作者列表: [${this.targetAuthors.join(', ')}]`);
        
        // 检查消息内容是否包含目标作者
        for (const author of this.targetAuthors) {
            const authorLower = author.toLowerCase();
            const contentLower = content.toLowerCase();
            
            logger.debug(`🔍 检查是否包含 "${author}": ${contentLower.includes(authorLower) ? '✅ 是' : '❌ 否'}`);
            
            if (contentLower.includes(authorLower)) {
                logger.info(`✅ 消息包含目标作者: ${author}`);
                return true;
            }
        }
        
        logger.debug(`❌ 消息不包含任何目标作者`);
        return false;
    }

    // 检测消息中的作者
    detectAuthor(content) {
        const contentLower = content.toLowerCase();
        
        for (const author of this.targetAuthors) {
            if (contentLower.includes(author.toLowerCase())) {
                return author;
            }
        }
        
        return null;
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

    async realTimeMonitorLoop() {
        if (!this.isMonitoring) return;

        try {
            // 获取当前页面的消息
            const currentMessages = await this.getCurrentPageMessages();
            
            if (currentMessages.length > this.lastMessageCount) {
                // 有新消息
                const newMessages = currentMessages.slice(this.lastMessageCount);
                logger.info(`🔔 检测到 ${newMessages.length} 条新消息`);
                
                // 处理每条新消息
                for (const message of newMessages) {
                    if (this.messageCallback) {
                        await this.messageCallback(message);
                    }
                }
                
                this.lastMessageCount = currentMessages.length;
            }
            
        } catch (error) {
            logger.error(`实时监控过程中出错: ${error.message}`);
        }

        // 继续下一轮监控 (更频繁的检查)
        setTimeout(() => this.realTimeMonitorLoop(), this.config.interval || 5000);
    }

    async multiTabMonitorLoop() {
        if (!this.isMonitoring) return;

        try {
            // 并行监控所有标签页
            const monitorPromises = this.targetGroups.map(async (groupName) => {
                try {
                    const page = this.pages[groupName];
                    if (!page) return;

                    // 获取当前页面的消息
                    const currentMessages = await this.getPageMessages(page, groupName);
                    const lastCount = this.lastMessageCounts[groupName] || 0;
                    
                    if (currentMessages.length > lastCount) {
                        // 有新消息
                        const newMessages = currentMessages.slice(lastCount);
                        logger.info(`🔔 [${groupName}] 检测到 ${newMessages.length} 条新消息`);
                        
                        // 处理每条新消息
                        for (const message of newMessages) {
                            // 添加群组信息
                            message.groupName = groupName;
                            message.source = 'multi-tab';
                            
                            // 统计总消息数
                            this.messageStats.total++;
                            
                            // 详细日志：显示每条接收到的消息
                            logger.info(`📥 [${groupName}] 接收到消息 #${this.messageStats.total}: ${message.content.substring(0, 100)}...`);
                            
                            // 过滤消息：只处理包含目标作者的消息
                            const shouldProcess = this.shouldProcessMessage(message);
                            logger.info(`🔍 [${groupName}] 消息过滤结果: ${shouldProcess ? '✅ 通过' : '❌ 被过滤'}`);
                            
                            if (shouldProcess) {
                                this.messageStats.filtered++;
                                
                                // 统计作者消息数
                                const detectedAuthor = this.detectAuthor(message.content);
                                if (detectedAuthor) {
                                    this.messageStats.byAuthor[detectedAuthor] = (this.messageStats.byAuthor[detectedAuthor] || 0) + 1;
                                }
                                
                                logger.info(`📨 [${groupName}] 处理过滤后的消息 (作者: ${detectedAuthor}): ${message.content.substring(0, 80)}...`);
                                logger.info(`📊 统计: 总消息 ${this.messageStats.total}, 过滤后 ${this.messageStats.filtered}, 作者分布: ${JSON.stringify(this.messageStats.byAuthor)}`);
                                
                                if (this.messageCallback) {
                                    await this.messageCallback(message);
                                }
                            } else {
                                logger.info(`🚫 [${groupName}] 消息被过滤原因: 不包含目标作者 (${this.targetAuthors.join(', ')})`);
                                logger.debug(`🔍 [${groupName}] 消息内容: ${message.content}`);
                            }
                        }
                        
                        this.lastMessageCounts[groupName] = currentMessages.length;
                    }
                    
                } catch (error) {
                    logger.debug(`[${groupName}] 监控出错: ${error.message}`);
                }
            });

            // 等待所有监控任务完成
            await Promise.allSettled(monitorPromises);
            
        } catch (error) {
            logger.error(`多标签页监控过程中出错: ${error.message}`);
        }

        // 继续下一轮监控
        setTimeout(() => this.multiTabMonitorLoop(), this.config.interval || 3000);
    }

    async getPageMessages(page, groupName) {
        try {
            // 检查页面是否可用
            if (!page || page.isClosed()) {
                logger.debug(`[${groupName}] 页面已关闭`);
                return [];
            }

            // 检查是否在目标群组页面
            const isInTargetGroup = await page.evaluate((targetGroup) => {
                const pageText = document.body.textContent || '';
                return pageText.includes(targetGroup) || 
                       pageText.includes('wwg') ||
                       pageText.includes('姆少');
            }, groupName);
            
            if (!isInTargetGroup) {
                logger.debug(`[${groupName}] 当前不在目标群组页面`);
                return [];
            }
            
            // 获取页面上的所有消息
            const messages = await page.evaluate(() => {
                const messageSelectors = [
                    '[class*="message-item"]',
                    '[class*="chat-message"]',
                    '[class*="message-bubble"]',
                    '[data-testid="message"]',
                    '.lark-message',
                    '[class*="message-content"]',
                    '[class*="message-text"]'
                ];
                
                let messageElements = [];
                
                // 尝试每个选择器
                for (const selector of messageSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        messageElements = Array.from(elements);
                        break;
                    }
                }
                
                // 如果没找到特定的消息元素，尝试查找文本内容
                if (messageElements.length === 0) {
                    const allElements = document.querySelectorAll('*');
                    for (let element of allElements) {
                        const text = element.textContent?.trim();
                        if (text && 
                            text.length > 5 && 
                            text.length < 1000 && 
                            element.children.length === 0 && // 叶子节点
                            !element.tagName.match(/^(SCRIPT|STYLE|META|LINK|TITLE|BUTTON|INPUT)$/) &&
                            !text.match(/^(发送|回复|删除|编辑|更多|菜单)$/)) {
                            messageElements.push(element);
                        }
                    }
                }
                
                // 提取消息信息
                const messages = [];
                
                for (let element of messageElements) {
                    try {
                        const content = element.textContent?.trim();
                        if (content && content.length > 0) {
                            // 尝试获取时间戳
                            let timestamp = null;
                            const timeElement = element.querySelector('[class*="time"]') || 
                                             element.querySelector('[class*="timestamp"]') ||
                                             element.closest('[class*="message"]')?.querySelector('[class*="time"]');
                            
                            if (timeElement) {
                                timestamp = timeElement.textContent?.trim();
                            }
                            
                            // 尝试获取发送者
                            let author = null;
                            const authorElement = element.querySelector('[class*="author"]') ||
                                                element.querySelector('[class*="sender"]') ||
                                                element.querySelector('[class*="username"]') ||
                                                element.closest('[class*="message"]')?.querySelector('[class*="author"]');
                            
                            if (authorElement) {
                                author = authorElement.textContent?.trim();
                            }
                            
                            messages.push({
                                content: content,
                                author: author || 'Unknown',
                                timestamp: timestamp || new Date().toLocaleString(),
                                time: Date.now()
                            });
                        }
                    } catch (e) {
                        console.log('Error processing message element:', e);
                    }
                }
                
                return messages;
            });
            
            return messages || [];
            
        } catch (error) {
            logger.debug(`[${groupName}] 获取页面消息失败: ${error.message}`);
            return [];
        }
    }

    async getCurrentPageMessages() {
        try {
            // 检查当前是否在群组页面
            const currentUrl = this.page.url();
            const currentTitle = await this.page.title();
            
            // 检查是否在目标群组中
            const isInTargetGroup = await this.page.evaluate(() => {
                const pageText = document.body.textContent || '';
                return pageText.includes('wwg-活跃现货-姆少聚合') || 
                       pageText.includes('WWG-活跃合约-姆少聚合') ||
                       pageText.includes('wwg') ||
                       pageText.includes('姆少');
            });
            
            if (!isInTargetGroup) {
                logger.debug('当前不在目标群组页面');
                return [];
            }
            
            // 获取页面上的所有消息
            const messages = await this.page.evaluate(() => {
                const messageSelectors = [
                    '[class*="message-item"]',
                    '[class*="chat-message"]',
                    '[class*="message-bubble"]',
                    '[data-testid="message"]',
                    '.lark-message',
                    '[class*="message-content"]',
                    '[class*="message-text"]'
                ];
                
                let messageElements = [];
                
                // 尝试每个选择器
                for (const selector of messageSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        messageElements = Array.from(elements);
                        break;
                    }
                }
                
                // 如果没找到特定的消息元素，尝试查找文本内容
                if (messageElements.length === 0) {
                    const allElements = document.querySelectorAll('*');
                    for (let element of allElements) {
                        const text = element.textContent?.trim();
                        if (text && 
                            text.length > 5 && 
                            text.length < 1000 && 
                            element.children.length === 0 && // 叶子节点
                            !element.tagName.match(/^(SCRIPT|STYLE|META|LINK|TITLE|BUTTON|INPUT)$/) &&
                            !text.match(/^(发送|回复|删除|编辑|更多|菜单)$/)) {
                            messageElements.push(element);
                        }
                    }
                }
                
                // 提取消息信息
                const messages = [];
                
                for (let element of messageElements) {
                    try {
                        const content = element.textContent?.trim();
                        if (content && content.length > 0) {
                            // 尝试获取时间戳
                            let timestamp = null;
                            const timeElement = element.querySelector('[class*="time"]') || 
                                             element.querySelector('[class*="timestamp"]') ||
                                             element.closest('[class*="message"]')?.querySelector('[class*="time"]');
                            
                            if (timeElement) {
                                timestamp = timeElement.textContent?.trim();
                            }
                            
                            // 尝试获取发送者
                            let author = null;
                            const authorElement = element.querySelector('[class*="author"]') ||
                                                element.querySelector('[class*="sender"]') ||
                                                element.querySelector('[class*="username"]') ||
                                                element.closest('[class*="message"]')?.querySelector('[class*="author"]');
                            
                            if (authorElement) {
                                author = authorElement.textContent?.trim();
                            }
                            
                            messages.push({
                                content: content,
                                author: author || 'Unknown',
                                timestamp: timestamp || new Date().toLocaleString(),
                                time: Date.now()
                            });
                        }
                    } catch (e) {
                        console.log('Error processing message element:', e);
                    }
                }
                
                return messages;
            });
            
            return messages || [];
            
        } catch (error) {
            logger.debug(`获取当前页面消息失败: ${error.message}`);
            return [];
        }
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
