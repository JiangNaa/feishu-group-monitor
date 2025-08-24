require('dotenv').config();

const config = {
    // 飞书配置
    feishu: {
        groupUrl: process.env.FEISHU_GROUP_URL || '',
        username: process.env.FEISHU_USERNAME || '',
        password: process.env.FEISHU_PASSWORD || '',
        headless: process.env.HEADLESS_MODE === 'true',
        interval: parseInt(process.env.MONITOR_INTERVAL) || 5000
    },

    // HTTP服务器配置
    server: {
        port: parseInt(process.env.LOCAL_SERVER_PORT) || 3000,
        host: process.env.LOCAL_SERVER_HOST || 'localhost'
    },

    // 日志配置
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    },

    // 信号解析配置
    parser: {
        minConfidence: parseFloat(process.env.MIN_CONFIDENCE) || 0.3,
        maxHistorySize: parseInt(process.env.MAX_HISTORY_SIZE) || 1000
    }
};

module.exports = config;
