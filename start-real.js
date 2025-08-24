// 真实飞书监控启动脚本
const FeishuMonitor = require('./src/monitor/feishuMonitor');
const SignalParser = require('./src/parser/signalParser');
const HttpServer = require('./src/server/httpServer');
const TableFormatter = require('./src/utils/tableFormatter');
const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const axios = require('axios');

class RealFeishuBot {
    constructor() {
        this.monitor = null;
        this.parser = null;
        this.server = null;
        this.tableFormatter = new TableFormatter();
        this.isRunning = false;
        this.signalCount = 0;
        this.historyMessages = [];
        this.targetGroups = [
            'wwg-活跃现货-姆少聚合',
            'WWG-活跃合约-姆少聚合'
        ];
        this.targetAuthors = ['woods', 'eli'];
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

            // 开始多标签页监控（包含历史消息读取）
            logger.info('🚀 启动多标签页自动监控...');
            await this.monitor.startMultiTabMonitoringWithHistory(this.handleNewMessage.bind(this), this.getHistorySummaryCallback.bind(this));
            
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
            const groupInfo = message.groupName ? `[${message.groupName}] ` : '';
            const shortGroup = message.groupName?.includes('现货') ? '现货' : message.groupName?.includes('合约') ? '合约' : 'Unknown';
            
            logger.info(`📨 ${groupInfo}收到过滤后的消息: ${message.content.substring(0, 80)}...`);
            
            // 详细分析消息内容
            logger.debug(`📋 ${groupInfo}完整消息内容: ${message.content}`);
            logger.debug(`👤 ${groupInfo}消息作者: ${message.author}`);
            logger.debug(`⏰ ${groupInfo}消息时间: ${message.timestamp}`);

            // 解析消息中的交易信号
            const signal = this.parser.parseMessage(message);
            
            if (signal) {
                // 添加群组信息和原始消息到信号中
                signal.groupName = message.groupName;
                signal.source = message.source;
                signal.originalMessage = message.content;
                
                this.signalCount++;
                
                // 添加到表格格式化器
                this.tableFormatter.addSignal(signal);
                
                logger.success(`🎯 ${groupInfo}检测到交易信号! (总计: ${this.signalCount})`);
                
                // 显示美化的信号信息
                this.displaySignalTable();
                
                // 发送信号到本地服务器
                await this.sendSignalToServer(signal);
                
            } else {
                logger.debug(`${groupInfo}该消息不包含有效的交易信号`);
            }

        } catch (error) {
            logger.error(`❌ 处理消息失败: ${error.message}`);
        }
    }

    // 历史消息汇总回调（在多标签页设置完成后调用）
    async getHistorySummaryCallback() {
        try {
            logger.info('📚 开始获取历史消息汇总...');
            
            const allHistoryMessages = [];
            const filteredHistoryMessages = [];
            const historySignals = [];
            
            // 使用已经设置好的多标签页来读取历史消息
            for (const groupName of this.targetGroups) {
                logger.info(`\n🎯 正在处理群组: ${groupName}`);
                
                const page = this.monitor.pages[groupName];
                if (!page) {
                    logger.warn(`⚠️  群组 ${groupName} 的页面未找到`);
                    continue;
                }
                
                // 提示用户确保在正确的群组页面
                logger.info(`📖 请确保标签页已导航到群组 "${groupName}"`);
                logger.info('⏳ 等待5秒后开始读取历史消息...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // 滚动加载历史消息
                await this.scrollToLoadHistoryOnPage(page);
                
                // 获取历史消息
                const messages = await this.getPageMessages(page, groupName, 50);
                allHistoryMessages.push(...messages);
                
                // 过滤消息
                const filtered = this.filterHistoryMessages(messages);
                filteredHistoryMessages.push(...filtered);
                
                logger.info(`   原始消息: ${messages.length} 条`);
                logger.info(`   过滤后: ${filtered.length} 条`);
                
                // 解析交易信号
                let signalCount = 0;
                filtered.forEach(message => {
                    const signal = this.parser.parseMessage(message);
                    if (signal) {
                        signal.groupName = message.groupName;
                        signal.originalMessage = message.content;
                        this.tableFormatter.addSignal(signal);
                        historySignals.push(signal);
                        signalCount++;
                    }
                });
                
                logger.info(`   检测到信号: ${signalCount} 个`);
            }
            
            // 显示历史消息汇总
            this.displayHistorySummary(allHistoryMessages, filteredHistoryMessages, historySignals);
            
            // 保存历史消息供后续使用
            this.historyMessages = filteredHistoryMessages;
            
        } catch (error) {
            logger.error(`❌ 获取历史消息失败: ${error.message}`);
        }
    }

    // 在指定页面上滚动加载历史消息
    async scrollToLoadHistoryOnPage(page) {
        try {
            logger.info('📜 滚动加载历史消息...');
            
            // 多次向上滚动以加载更多历史消息
            for (let i = 0; i < 10; i++) {
                await page.evaluate(() => {
                    // 滚动到页面顶部
                    window.scrollTo(0, 0);
                    
                    // 查找消息容器并滚动
                    const messageContainer = document.querySelector('[class*="message-list"]') ||
                                           document.querySelector('[class*="chat-content"]') ||
                                           document.querySelector('[class*="conversation-content"]');
                    
                    if (messageContainer) {
                        messageContainer.scrollTop = 0;
                    }
                });
                
                // 等待消息加载
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            logger.success('✅ 历史消息加载完成');
            
        } catch (error) {
            logger.debug(`滚动加载历史消息出错: ${error.message}`);
        }
    }

    // 获取指定页面的消息
    async getPageMessages(page, groupName, count = 50) {
        try {
            // 检查页面是否可用
            if (!page || page.isClosed()) {
                logger.debug(`[${groupName}] 页面已关闭`);
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
            
            // 为每条消息添加群组信息
            const messagesWithGroup = (messages || []).map(message => ({
                ...message,
                groupName: groupName
            }));
            
            return messagesWithGroup;
            
        } catch (error) {
            logger.debug(`[${groupName}] 获取页面消息失败: ${error.message}`);
            return [];
        }
    }

    // 获取历史消息汇总
    async getHistorySummary() {
        try {
            logger.info('📖 开始读取两个群组的历史消息...');
            
            const allHistoryMessages = [];
            const filteredHistoryMessages = [];
            const historySignals = [];
            
            // 为每个群组获取历史消息
            for (const groupName of this.targetGroups) {
                logger.info(`\n🎯 正在处理群组: ${groupName}`);
                
                const messages = await this.readGroupHistory(groupName, 50);
                allHistoryMessages.push(...messages);
                
                // 过滤消息：只保留包含目标作者的消息
                const filtered = this.filterHistoryMessages(messages);
                filteredHistoryMessages.push(...filtered);
                
                logger.info(`   原始消息: ${messages.length} 条`);
                logger.info(`   过滤后: ${filtered.length} 条`);
                
                // 解析交易信号
                let signalCount = 0;
                filtered.forEach(message => {
                    const signal = this.parser.parseMessage(message);
                    if (signal) {
                        signal.groupName = message.groupName;
                        signal.originalMessage = message.content;
                        this.tableFormatter.addSignal(signal);
                        historySignals.push(signal);
                        signalCount++;
                    }
                });
                
                logger.info(`   检测到信号: ${signalCount} 个`);
                
                // 等待一下再处理下一个群组
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // 显示历史消息汇总
            this.displayHistorySummary(allHistoryMessages, filteredHistoryMessages, historySignals);
            
            // 保存历史消息供后续使用
            this.historyMessages = filteredHistoryMessages;
            
        } catch (error) {
            logger.error(`❌ 获取历史消息失败: ${error.message}`);
        }
    }

    // 读取单个群组的历史消息
    async readGroupHistory(groupName, messageCount = 50) {
        try {
            logger.info(`📖 开始读取群组 "${groupName}" 的历史消息...`);
            
            // 查找并导航到群组
            const navSuccess = await this.monitor.navigateToGroup(groupName);
            if (!navSuccess) {
                logger.warn(`⚠️  无法自动导航到群组: ${groupName}，请手动导航`);
                
                // 提示用户手动导航
                logger.info('🎯 请手动操作:');
                logger.info(`   1. 在浏览器中找到并点击群组 "${groupName}"`);
                logger.info('   2. 等待群组页面完全加载');
                logger.info('   3. 程序将在30秒后开始读取消息');
                
                // 等待用户手动导航
                for (let i = 30; i > 0; i--) {
                    process.stdout.write(`\r⏳ 倒计时: ${i} 秒...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log(''); // 换行
            }
            
            // 滚动到历史消息顶部以加载更多消息
            await this.scrollToLoadHistory();
            
            // 获取历史消息
            const messages = await this.monitor.getRecentMessages(messageCount);
            
            if (messages.length === 0) {
                logger.warn(`⚠️  未获取到 ${groupName} 的消息`);
                return [];
            }
            
            logger.success(`✅ 成功获取到 ${groupName} 的 ${messages.length} 条消息`);
            
            // 为每条消息添加群组信息
            messages.forEach(message => {
                message.groupName = groupName;
            });
            
            return messages;
            
        } catch (error) {
            logger.error(`❌ 读取 ${groupName} 历史消息失败: ${error.message}`);
            return [];
        }
    }

    // 滚动加载历史消息
    async scrollToLoadHistory() {
        try {
            logger.info('📜 滚动加载历史消息...');
            
            // 多次向上滚动以加载更多历史消息
            for (let i = 0; i < 10; i++) {
                await this.monitor.page.evaluate(() => {
                    // 滚动到页面顶部
                    window.scrollTo(0, 0);
                    
                    // 查找消息容器并滚动
                    const messageContainer = document.querySelector('[class*="message-list"]') ||
                                           document.querySelector('[class*="chat-content"]') ||
                                           document.querySelector('[class*="conversation-content"]');
                    
                    if (messageContainer) {
                        messageContainer.scrollTop = 0;
                    }
                });
                
                // 等待消息加载
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            logger.success('✅ 历史消息加载完成');
            
        } catch (error) {
            logger.debug(`滚动加载历史消息出错: ${error.message}`);
        }
    }

    // 过滤历史消息：只保留包含目标作者的消息
    filterHistoryMessages(messages) {
        const filtered = messages.filter(message => {
            const content = message.content || '';
            
            // 检查是否包含目标作者
            for (const author of this.targetAuthors) {
                if (content.toLowerCase().includes(author.toLowerCase())) {
                    return true;
                }
            }
            return false;
        });
        
        return filtered;
    }

    // 提取作者信息
    extractAuthor(content) {
        // 匹配 #️⃣🎯eli 或 #️⃣💨woods 格式
        const authorMatch = content.match(/#️⃣[^a-zA-Z]*([a-zA-Z]+)/);
        if (authorMatch) {
            return authorMatch[1];
        }
        return 'Unknown';
    }

    // 显示历史消息汇总
    displayHistorySummary(allMessages, filteredMessages, signals) {
        logger.info('\n' + '='.repeat(120));
        logger.info('📊 历史消息汇总分析');
        logger.info('='.repeat(120));
        
        // 统计信息
        const stats = {
            total: allMessages.length,
            filtered: filteredMessages.length,
            signals: signals.length,
            byGroup: {},
            byAuthor: {},
            bySymbol: {}
        };
        
        // 按群组统计
        filteredMessages.forEach(message => {
            const groupKey = message.groupName.includes('现货') ? '现货群组' : '合约群组';
            stats.byGroup[groupKey] = (stats.byGroup[groupKey] || 0) + 1;
        });
        
        // 按作者统计
        filteredMessages.forEach(message => {
            const author = this.extractAuthor(message.content);
            stats.byAuthor[author] = (stats.byAuthor[author] || 0) + 1;
        });
        
        // 按币种统计信号
        signals.forEach(signal => {
            const symbol = signal.symbol || 'Unknown';
            stats.bySymbol[symbol] = (stats.bySymbol[symbol] || 0) + 1;
        });
        
        // 显示统计信息
        console.log(`\n📈 历史消息统计:`);
        console.log(`   总消息数: ${stats.total}`);
        console.log(`   过滤后消息: ${stats.filtered}`);
        console.log(`   检测到信号: ${stats.signals}`);
        console.log(`   过滤率: ${((stats.filtered / stats.total) * 100).toFixed(1)}%`);
        console.log(`   信号率: ${stats.filtered > 0 ? ((stats.signals / stats.filtered) * 100).toFixed(1) : 0}%`);
        
        console.log(`\n🏢 群组分布:`);
        Object.entries(stats.byGroup).forEach(([group, count]) => {
            console.log(`   ${group}: ${count} 条消息`);
        });
        
        console.log(`\n👥 作者分布:`);
        Object.entries(stats.byAuthor).forEach(([author, count]) => {
            console.log(`   ${author}: ${count} 条消息`);
        });
        
        if (Object.keys(stats.bySymbol).length > 0) {
            console.log(`\n💰 历史信号币种分布:`);
            const sortedSymbols = Object.entries(stats.bySymbol)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10);
            sortedSymbols.forEach(([symbol, count]) => {
                console.log(`   ${symbol}: ${count} 个信号`);
            });
        }
        
        // 显示历史信号表格
        if (signals.length > 0) {
            console.log('\n' + '='.repeat(120));
            console.log('🎯 历史交易信号表格');
            console.log('='.repeat(120));
            console.log(this.tableFormatter.generateTable());
            console.log(this.tableFormatter.generateStats());
        }
        
        // 显示最近的过滤消息内容
        if (filteredMessages.length > 0) {
            console.log('\n' + '='.repeat(120));
            console.log('📨 最近的过滤消息内容 (包含 woods 或 eli)');
            console.log('='.repeat(120));
            
            const recentMessages = filteredMessages.slice(-10); // 显示最近10条
            recentMessages.forEach((message, index) => {
                const groupTag = message.groupName.includes('现货') ? '[现货]' : '[合约]';
                const author = this.extractAuthor(message.content);
                
                console.log(`\n${index + 1}. ${groupTag} 作者: ${author}`);
                console.log(`   时间: ${message.timestamp}`);
                console.log(`   内容: ${message.content.substring(0, 200)}${message.content.length > 200 ? '...' : ''}`);
                console.log('-'.repeat(80));
            });
        }
        
        console.log('\n' + '='.repeat(120));
        console.log('✅ 历史消息汇总完成！现在开始实时监控...');
        console.log('='.repeat(120) + '\n');
    }

    // 显示信号表格
    displaySignalTable() {
        try {
            // 每5个实时信号显示一次完整表格
            if (this.signalCount % 5 === 0) {
                console.log('\n' + '='.repeat(120));
                console.log('🎯 实时交易信号汇总表格');
                console.log('='.repeat(120));
                console.log(this.tableFormatter.getRecentTable(15)); // 显示最近15个信号
                console.log(this.tableFormatter.generateStats());
                console.log('='.repeat(120) + '\n');
            } else {
                // 显示最新的实时信号
                const recentSignals = this.tableFormatter.signals.slice(-1);
                if (recentSignals.length > 0) {
                    const signal = recentSignals[0];
                    const groupType = signal.group.includes('现货') ? '现货' : '合约';
                    console.log(`\n📊 [实时] ${signal.action} ${signal.symbol} | 作者: ${signal.author} | 群组: ${groupType} | 时间: ${signal.timestamp}\n`);
                }
            }
        } catch (error) {
            logger.error(`显示表格失败: ${error.message}`);
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
        logger.info('🎯 监控群组:');
        logger.info('   1. wwg-活跃现货-姆少聚合');
        logger.info('   2. WWG-活跃合约-姆少聚合');
        logger.info('📡 可用接口:');
        logger.info(`   健康检查: GET http://${config.server.host}:${config.server.port}/health`);
        logger.info(`   接收信号: POST http://${config.server.host}:${config.server.port}/signal`);
        logger.info(`   信号历史: GET http://${config.server.host}:${config.server.port}/signals/history`);
        logger.info('💡 使用提示:');
        logger.info('   - 系统自动为每个群组创建独立标签页');
        logger.info('   - 并行监控所有目标群组，无需手动切换');
        logger.info('   - 每3秒检查一次新消息，实时响应');
        logger.info('   - 只处理包含 "woods" 或 "eli" 的消息');
        logger.info('   - 检测到的交易信号会以表格形式美化显示');
        logger.info('   - 每5个信号显示一次完整汇总表格');
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
    logger.info('🎯 飞书双群组历史+实时智能监控模式');
    logger.info('📋 操作流程:');
    logger.info('   1. 系统将打开浏览器窗口并自动登录');
    logger.info('   2. 首先获取两个群组各50条历史消息');
    logger.info('   3. 智能过滤并汇总 "woods" 和 "eli" 的历史消息');
    logger.info('   4. 生成历史消息统计和信号表格');
    logger.info('   5. 然后创建两个标签页开始实时监控:');
    logger.info('      - 标签页1: wwg-活跃现货-姆少聚合');
    logger.info('      - 标签页2: WWG-活跃合约-姆少聚合');
    logger.info('   6. 实时信号以美化表格形式持续显示');
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
