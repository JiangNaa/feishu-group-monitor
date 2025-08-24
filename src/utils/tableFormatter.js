// 表格格式化工具
class TableFormatter {
    constructor() {
        this.signals = [];
    }

    // 添加信号到表格
    addSignal(signal) {
        this.signals.push({
            timestamp: new Date().toLocaleString('zh-CN'),
            group: signal.groupName || 'Unknown',
            author: this.extractAuthor(signal.originalMessage || ''),
            symbol: signal.symbol || 'N/A',
            action: signal.action || 'N/A',
            price: signal.price || 'N/A',
            stopLoss: signal.stopLoss || 'N/A',
            target: signal.target || 'N/A',
            confidence: signal.confidence ? `${signal.confidence}%` : 'N/A',
            content: this.truncateContent(signal.originalMessage || '', 60)
        });
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

    // 截断内容
    truncateContent(content, maxLength) {
        if (content.length <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength) + '...';
    }

    // 生成表格
    generateTable() {
        if (this.signals.length === 0) {
            return '暂无交易信号数据';
        }

        const headers = [
            '时间',
            '群组',
            '作者',
            '币种',
            '操作',
            '价格',
            '止损',
            '目标',
            '置信度'
        ];

        // 计算每列的最大宽度
        const columnWidths = headers.map((header, index) => {
            const headerWidth = this.getDisplayWidth(header);
            const dataWidth = Math.max(...this.signals.map(signal => {
                const value = this.getColumnValue(signal, index);
                return this.getDisplayWidth(value);
            }));
            return Math.max(headerWidth, dataWidth, 8); // 最小宽度8
        });

        // 生成分隔线
        const separator = '┼' + columnWidths.map(width => '─'.repeat(width + 2)).join('┼') + '┼';
        const topBorder = '┌' + columnWidths.map(width => '─'.repeat(width + 2)).join('┬') + '┐';
        const bottomBorder = '└' + columnWidths.map(width => '─'.repeat(width + 2)).join('┴') + '┘';

        // 生成表格
        let table = topBorder + '\n';
        
        // 表头
        table += '│';
        headers.forEach((header, index) => {
            table += ` ${this.padString(header, columnWidths[index])} │`;
        });
        table += '\n' + separator.replace(/┼/g, index => index === 0 ? '├' : index === separator.length - 1 ? '┤' : '┼') + '\n';

        // 数据行
        this.signals.forEach((signal, rowIndex) => {
            table += '│';
            headers.forEach((_, colIndex) => {
                const value = this.getColumnValue(signal, colIndex);
                table += ` ${this.padString(value, columnWidths[colIndex])} │`;
            });
            table += '\n';
        });

        table += bottomBorder;
        return table;
    }

    // 获取列值
    getColumnValue(signal, columnIndex) {
        const values = [
            signal.timestamp,
            signal.group,
            signal.author,
            signal.symbol,
            signal.action,
            signal.price,
            signal.stopLoss,
            signal.target,
            signal.confidence
        ];
        return String(values[columnIndex] || 'N/A');
    }

    // 计算显示宽度（考虑中文字符）
    getDisplayWidth(str) {
        let width = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charAt(i);
            // 中文字符宽度为2，英文字符宽度为1
            if (char.match(/[\u4e00-\u9fa5]/)) {
                width += 2;
            } else {
                width += 1;
            }
        }
        return width;
    }

    // 填充字符串到指定宽度
    padString(str, targetWidth) {
        const currentWidth = this.getDisplayWidth(str);
        const padding = targetWidth - currentWidth;
        if (padding <= 0) {
            return str;
        }
        return str + ' '.repeat(padding);
    }

    // 清空信号列表
    clear() {
        this.signals = [];
    }

    // 获取最近N个信号的表格
    getRecentTable(count = 10) {
        const recentSignals = this.signals.slice(-count);
        const originalSignals = this.signals;
        this.signals = recentSignals;
        const table = this.generateTable();
        this.signals = originalSignals;
        return table;
    }

    // 生成统计信息
    generateStats() {
        if (this.signals.length === 0) {
            return '暂无统计数据';
        }

        const stats = {
            total: this.signals.length,
            byAction: {},
            bySymbol: {},
            byAuthor: {},
            byGroup: {}
        };

        this.signals.forEach(signal => {
            // 按操作统计
            stats.byAction[signal.action] = (stats.byAction[signal.action] || 0) + 1;
            
            // 按币种统计
            stats.bySymbol[signal.symbol] = (stats.bySymbol[signal.symbol] || 0) + 1;
            
            // 按作者统计
            stats.byAuthor[signal.author] = (stats.byAuthor[signal.author] || 0) + 1;
            
            // 按群组统计
            stats.byGroup[signal.group] = (stats.byGroup[signal.group] || 0) + 1;
        });

        let statsText = `\n📊 交易信号统计 (总计: ${stats.total})\n`;
        statsText += '─'.repeat(50) + '\n';
        
        statsText += `📈 操作类型: `;
        Object.entries(stats.byAction).forEach(([action, count]) => {
            statsText += `${action}(${count}) `;
        });
        
        statsText += `\n💰 热门币种: `;
        const topSymbols = Object.entries(stats.bySymbol)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
        topSymbols.forEach(([symbol, count]) => {
            statsText += `${symbol}(${count}) `;
        });
        
        statsText += `\n👥 分析师: `;
        Object.entries(stats.byAuthor).forEach(([author, count]) => {
            statsText += `${author}(${count}) `;
        });
        
        statsText += `\n🏢 群组: `;
        Object.entries(stats.byGroup).forEach(([group, count]) => {
            const shortGroup = group.includes('现货') ? '现货' : group.includes('合约') ? '合约' : group;
            statsText += `${shortGroup}(${count}) `;
        });
        
        return statsText + '\n';
    }
}

module.exports = TableFormatter;
