import { constructSystemPrompt, createUserPrompt } from '../src/constants/prompts';
import { HistoryEntry } from '../src/commands/history';

// 模拟历史条目
const mockHistoryEntry: HistoryEntry = {
  id: 'test-id',
  timestamp: new Date().toISOString(),
  prompt: 'test prompt',
  description: 'test description',
  operations: [],
  aiResponse: 'test ai response'
};

// 模拟多个历史条目（最近的先）
const mockEntries: HistoryEntry[] = [
  { ...mockHistoryEntry, id: 'old-id', prompt: 'old prompt', aiResponse: 'old ai response' },
  mockHistoryEntry // 最近的
];

// 模拟文件上下文
const mockFileContext = `--- FILE start ---\npath: test/file.ts\n1 | console.log('hello world');\n--- FILE end ---`;

// 模拟系统提示
const systemPrompt = constructSystemPrompt();

// 构建历史消息：从最早到最近
const historyMessages: { role: string; content: string; }[] = [];
const reversedEntries = mockEntries.slice().reverse(); // 从旧到新
for (const entry of reversedEntries) {
  historyMessages.push({ role: 'user', content: entry.prompt });
  historyMessages.push({ role: 'assistant', content: entry.aiResponse || '' });
}

// 当前用户提示（无历史上下文字符串）
const actualUserPromptContent = createUserPrompt('test user request', mockFileContext, '');

// 模拟完整 messages 数组
const messages = [
  { role: 'system', content: systemPrompt },
  ...historyMessages,
  { role: 'user', content: actualUserPromptContent }
];

// 测试输出
console.log('\nFull Messages Array:');
console.log(JSON.stringify(messages, null, 2));