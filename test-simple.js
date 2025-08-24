// 简单测试脚本
const SignalParser = require('./src/parser/signalParser');

console.log('🧪 测试信号解析器...');

const parser = new SignalParser();

const testMessage = {
    content: 'BTC 买入信号，价格：45000',
    author: 'trader1',
    timestamp: Date.now()
};

console.log('测试消息:', testMessage.content);

const signal = parser.parseMessage(testMessage);

if (signal) {
    console.log('✅ 解析成功:');
    console.log('动作:', signal.action);
    console.log('品种:', signal.symbol);
    console.log('价格:', signal.price);
    console.log('置信度:', (signal.confidence * 100).toFixed(1) + '%');
} else {
    console.log('❌ 未检测到有效信号');
}

console.log('\n✅ 测试完成！');
