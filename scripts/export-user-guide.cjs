const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/content/user-guide.json'), 'utf8'));
const intro = [
  '软件内入口：设置 → 关于 OmiComic → 操作说明。可以按分类查找，也可以搜索关键词；本文与软件内的说明使用同一份内容。',
  'In the app: Settings → About OmiComic → User guide. Browse a category or search by keyword, even offline. This document uses the same content as the in-app guide.',
  'アプリ内：設定 → OmiComic について → 操作ガイド。分類やキーワードからオフラインでも調べられます。この文書とアプリ内のガイドは同じ内容です。',
];
for (let language = 0; language < 3; language++) {
  const text = value => value[language];
  const separator = language === 1 ? ': ' : '：';
  const output = [`# OmiComic · ${text(data.ui.title)}`, '', intro[language], '', data.sections.map(section => `[${text(section.title)}](#guide-${section.id})`).join(' · '), ''];
  for (const section of data.sections) {
    output.push(`<a id="guide-${section.id}"></a>`, '', `## ${text(section.title)}`, '');
    for (const topic of section.topics) {
      const platform = topic.platform ? ` · ${topic.platform === 'pc' ? 'Windows' : 'Android'}` : '';
      output.push(`<details>`, `<summary>${text(topic.title)}${platform}</summary>`, '');
      if (topic.body) output.push(text(topic.body), '');
      if (topic.pc) output.push(`**Windows**${separator}${text(topic.pc)}`, '');
      if (topic.android) output.push(`**Android**${separator}${text(topic.android)}`, '');
      if (topic.rows) {
        for (const row of topic.rows) output.push(`- **${text(row.label)}**${separator}${text(row.text)}`);
        output.push('');
      }
      output.push('</details>', '');
    }
  }
  const file = ['README_使用方法.md', 'docs/USER_GUIDE.en.md', 'docs/USER_GUIDE.ja.md'][language];
  fs.writeFileSync(path.join(root, file), output.join('\n'));
  console.log(file);
}
