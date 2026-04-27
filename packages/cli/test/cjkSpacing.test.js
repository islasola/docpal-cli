const { insertCjkSpacing } = require('../lib/cjkSpacing');

async function run({ test, assertEqual }) {
    await test('inserts space between Chinese and English', () => {
        assertEqual(insertCjkSpacing('Milvus是向量数据库'), 'Milvus 是向量数据库');
    });

    await test('inserts space between English and Chinese', () => {
        assertEqual(insertCjkSpacing('使用Python连接'), '使用 Python 连接');
    });

    await test('inserts space around digits', () => {
        assertEqual(insertCjkSpacing('版本2025发布'), '版本 2025 发布');
    });

    await test('leaves pure Chinese alone', () => {
        assertEqual(insertCjkSpacing('这是一个测试'), '这是一个测试');
    });

    await test('leaves pure English alone', () => {
        assertEqual(insertCjkSpacing('Hello World'), 'Hello World');
    });

    await test('preserves inline code content', () => {
        assertEqual(insertCjkSpacing('使用`pip install`安装'), '使用 `pip install`安装');
    });

    await test('preserves fenced code block content', () => {
        const input = '说明:\n```python\nprint("中文")\n```\n结束';
        assertEqual(insertCjkSpacing(input), input);
    });

    await test('preserves HTML tag content', () => {
        assertEqual(insertCjkSpacing('查看<br/>下方'), '查看 <br/>下方');
    });

    await test('preserves URL inside markdown link', () => {
        assertEqual(insertCjkSpacing('参见[文档](https://example.com)说明'), '参见 [ 文档 ](https://example.com)说明');
    });

    await test('does not pad CJK punctuation', () => {
        assertEqual(insertCjkSpacing('完成。Next step'), '完成。Next step');
    });

    await test('handles empty string', () => {
        assertEqual(insertCjkSpacing(''), '');
    });

    await test('handles single char', () => {
        assertEqual(insertCjkSpacing('A'), 'A');
        assertEqual(insertCjkSpacing('中'), '中');
    });
}

module.exports = { run };
