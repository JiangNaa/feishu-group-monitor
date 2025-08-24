const logger = require('../utils/logger');

class SignalParser {
    constructor() {
        // 交易信号关键词模式
        this.patterns = {
            // 买入信号
            buySignals: [
                /买入|买进|做多|long|开多|建仓/i,
                /入场|进场|买|多单/i,
                /看涨|上涨|涨|bullish/i
            ],
            
            // 卖出信号
            sellSignals: [
                /卖出|卖掉|做空|short|开空|平仓/i,
                /出场|离场|卖|空单/i,
                /看跌|下跌|跌|bearish/i
            ],
            
            // 价格模式
            pricePatterns: [
                /(\d+\.?\d*)\s*(?:元|USD|USDT|美元|刀)/i,
                /价格[：:]\s*(\d+\.?\d*)/i,
                /目标[：:]\s*(\d+\.?\d*)/i,
                /(\d+\.?\d*)\s*附近/i
            ],
            
            // 币种/股票代码模式
            symbolPatterns: [
                /([A-Z]{2,10})\s*(?:\/USDT|\/USD|USDT|USD)/i,
                /\$([A-Z]{2,10})/i,
                /([A-Z]{2,6}\d{4})/i, // 股票代码格式
                /(BTC|ETH|BNB|ADA|SOL|DOGE|XRP|DOT|LINK|UNI|AVAX|MATIC|ATOM|FTM|NEAR|ALGO|VET|THETA|FIL|EOS|TRX|XLM|IOTA|NEO|DASH|ZEC|XMR|LTC)/i
            ]
        };
    }

    parseMessage(message) {
        try {
            const content = message.content;
            if (!content || content.length < 5) {
                return null;
            }

            if (!this.isTradeRelated(content)) {
                return null;
            }

            const signal = {
                originalMessage: message,
                timestamp: message.timestamp || Date.now(),
                author: message.author || 'unknown',
                action: this.parseAction(content),
                symbol: this.parseSymbol(content),
                price: this.parsePrice(content),
                confidence: 0,
                rawText: content
            };

            signal.confidence = this.calculateConfidence(signal, content);

            if (signal.confidence >= 0.3) {
                logger.success(`解析到交易信号: ${signal.action} ${signal.symbol} @ ${signal.price}`);
                return signal;
            } else {
                return null;
            }

        } catch (error) {
            logger.error(`解析消息失败: ${error.message}`);
            return null;
        }
    }

    isTradeRelated(content) {
        const tradeKeywords = [
            '买', '卖', '做多', '做空', 'long', 'short', '开仓', '平仓',
            '止损', '止盈', '入场', '出场', '价格', '目标', 'BTC', 'ETH',
            'USDT', '涨', '跌', '看多', '看空', '建议', '推荐'
        ];

        return tradeKeywords.some(keyword => 
            content.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    parseAction(content) {
        for (const pattern of this.patterns.buySignals) {
            if (pattern.test(content)) {
                return 'BUY';
            }
        }

        for (const pattern of this.patterns.sellSignals) {
            if (pattern.test(content)) {
                return 'SELL';
            }
        }

        return 'UNKNOWN';
    }

    parseSymbol(content) {
        for (const pattern of this.patterns.symbolPatterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].toUpperCase();
            }
        }
        return null;
    }

    parsePrice(content) {
        for (const pattern of this.patterns.pricePatterns) {
            const match = content.match(pattern);
            if (match) {
                return parseFloat(match[1]);
            }
        }
        return null;
    }

    calculateConfidence(signal, content) {
        let confidence = 0;

        if (signal.action !== 'UNKNOWN') confidence += 0.3;
        if (signal.symbol) confidence += 0.2;
        if (signal.price) confidence += 0.2;

        const tradeKeywordCount = this.countTradeKeywords(content);
        confidence += Math.min(tradeKeywordCount * 0.05, 0.2);

        const length = content.length;
        if (length < 20 || length > 500) {
            confidence *= 0.8;
        }

        return Math.min(confidence, 1.0);
    }

    countTradeKeywords(content) {
        const keywords = [
            '买入', '卖出', '做多', '做空', '开仓', '平仓', '止损', '止盈',
            '目标', '价格', '建议', '推荐', 'long', 'short', 'buy', 'sell'
        ];

        let count = 0;
        keywords.forEach(keyword => {
            const regex = new RegExp(keyword, 'gi');
            const matches = content.match(regex);
            if (matches) count += matches.length;
        });

        return count;
    }

    formatSignal(signal) {
        let formatted = `🚨 交易信号 🚨\n`;
        formatted += `动作: ${signal.action}\n`;
        formatted += `品种: ${signal.symbol || '未知'}\n`;
        formatted += `价格: ${signal.price || '未指定'}\n`;
        formatted += `置信度: ${(signal.confidence * 100).toFixed(1)}%\n`;
        formatted += `来源: ${signal.author}\n`;
        formatted += `时间: ${new Date(signal.timestamp).toLocaleString()}\n`;
        formatted += `原文: ${signal.rawText.substring(0, 100)}...`;
        
        return formatted;
    }
}

module.exports = SignalParser;
