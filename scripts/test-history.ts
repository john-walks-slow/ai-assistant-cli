import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as historyModule from '../src/commands/history';
import { HistoryEntry } from '../src/commands/history';
import { CliStyle } from '../src/utils/cli-style';

const { appendHistory, loadHistory, listHistory } = historyModule;

// 使用临时文件路径，避免影响真实历史
const TEMP_HISTORY_FILE = path.join(process.cwd(), 'test-temp-history.json');

async function setupTempHistory() {
  // 设置模块级历史文件路径为临时
  (historyModule as any).GLOBAL_HISTORY_FILE = TEMP_HISTORY_FILE;
  await fs.writeFile(TEMP_HISTORY_FILE, '[]');
}

async function teardownTempHistory() {
  // 清理临时文件
  try {
    await fs.unlink(TEMP_HISTORY_FILE);
  } catch (e) {
    // 忽略错误
  }
  // 不重置 GLOBAL_HISTORY_FILE，测试后可忽略
}

async function runTests() {
  console.log('开始 history 命令测试...\n');

  await setupTempHistory();

  try {
    // 测试1: 加载空历史
    console.log('测试1: 加载空历史');
    const emptyHistory = await loadHistory();
    assert.strictEqual(emptyHistory.length, 0, '空历史应返回空数组');
    console.log('  ✓ 通过\n');

    // 测试2: 添加历史条目
    console.log('测试2: 添加历史条目');
    const testEntry: HistoryEntry = {
      id: 'test-id',
      name: 'test-name',
      description: '测试描述',
      timestamp: new Date().toISOString(),
      prompt: '测试提示',
      operations: []
    };
    await appendHistory(testEntry);
    const loadedHistory = await loadHistory();
    assert.strictEqual(loadedHistory.length, 1, '应有1个条目');
    assert.strictEqual(loadedHistory[0].id, 'test-id', 'ID应匹配');
    assert.strictEqual(loadedHistory[0].name, 'test-name', '名称应匹配');
    console.log('  ✓ 通过\n');

    // 测试3: 列出历史 (捕获输出简单检查)
    console.log('测试3: 列出历史');
    const oldLog = console.log;
    let output = '';
    console.log = (...args) => {
      output += args.join(' ') + '\n';
      oldLog.apply(console, args);
    };
    await listHistory();
    console.log = oldLog;
    assert.ok(output.includes('历史记录:'), '输出应包含历史记录标题');
    assert.ok(output.includes('test-name'), '输出应包含测试名称');
    console.log('  ✓ 通过\n');

    // 测试4: 包含历史时生成的 prompt 是否正常
    console.log('测试4: 包含历史时生成的 prompt');
    const { createUserPrompt } = await import('../src/constants/prompts');
    const { formatHistoryContext, getHistoryById } = historyModule;
    const historyContext = await formatHistoryContext(testEntry);
    const userPrompt = 'redo changes';
    const generatedPrompt = createUserPrompt(userPrompt, '', historyContext);
    console.log(generatedPrompt);
    assert.ok(
      generatedPrompt.includes('USER REQUEST: "redo changes"'),
      'prompt 应包含用户请求'
    );
    assert.ok(
      generatedPrompt.includes('--- HISTORY CONTEXT ---'),
      'prompt 应包含历史上下文块'
    );
    assert.ok(
      generatedPrompt.includes('mock 历史提示'),
      'prompt 应包含历史 prompt'
    );
    assert.ok(
      generatedPrompt.includes('Operations:'),
      'prompt 应包含 operations'
    );
    assert.ok(
      generatedPrompt.includes('"type": "create"'),
      'prompt 应包含 operations 细节'
    );
    console.log('  ✓ 通过\n');

    console.log('所有测试通过！');
  } catch (error) {
    console.error('测试失败:', (error as Error).message);
  } finally {
    await teardownTempHistory();
  }
}

runTests().catch(console.error);
