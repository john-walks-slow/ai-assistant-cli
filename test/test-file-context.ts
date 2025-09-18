import { getFileContext } from '../src/core/file-context';

async function main() {
  // 测试1: 同一个文件多次指定范围，计算交集
  console.log('=== 测试1: 范围 1-3 和 2-4 的交集 (预期: lines 2-3) ===');
  const result1 = await getFileContext(['test-file.txt:1-3', 'test-file.txt:2-4']);
  console.log(result1);

  // 测试2: 全文 + 具体范围，交集为具体范围
  console.log('\n=== 测试2: 全文 + 范围 3-5 的交集 (预期: lines 3-5) ===');
  const result2 = await getFileContext(['test-file.txt', 'test-file.txt:3-5']);
  console.log(result2);

  // 测试3: 多个相同范围，交集不变
  console.log('\n=== 测试3: 范围 2-4 两次 (预期: lines 2-4) ===');
  const result3 = await getFileContext(['test-file.txt:2-4', 'test-file.txt:2-4']);
  console.log(result3);

  // 测试4: 无交集范围，跳过
  console.log('\n=== 测试4: 范围 1-2 和 4-5 的交集 (预期: 无输出，警告) ===');
  const result4 = await getFileContext(['test-file.txt:1-2', 'test-file.txt:4-5']);
  console.log(result4 || '无内容输出');
}

main().catch(console.error);