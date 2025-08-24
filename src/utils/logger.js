const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.ensureLogDir();
    }

    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    writeToFile(level, message) {
        const logFile = path.join(this.logDir, `${level}.log`);
        const formattedMessage = this.formatMessage(level, message);
        
        fs.appendFileSync(logFile, formattedMessage + '\n');
        
        // 同时写入总日志文件
        const allLogFile = path.join(this.logDir, 'all.log');
        fs.appendFileSync(allLogFile, formattedMessage + '\n');
    }

    info(message) {
        console.log(`ℹ️  ${message}`);
        this.writeToFile('info', message);
    }

    error(message) {
        console.error(`❌ ${message}`);
        this.writeToFile('error', message);
    }

    warn(message) {
        console.warn(`⚠️  ${message}`);
        this.writeToFile('warn', message);
    }

    success(message) {
        console.log(`✅ ${message}`);
        this.writeToFile('success', message);
    }

    debug(message) {
        // 临时启用debug日志以便调试
        console.log(`🐛 ${message}`);
        this.writeToFile('debug', message);
    }

    verbose(message) {
        console.log(`📝 ${message}`);
        this.writeToFile('verbose', message);
    }
}

module.exports = new Logger();
