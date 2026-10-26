const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/content/user-guide.json'), 'utf8'));
const intro = [
  '软件内入口：设置 → 关于 OmiComic → 操作说明。支持离线搜索、分类跳转与折叠；以下内容与软件内置说明共用同一份来源。',
  'In the app: Settings → About OmiComic → User guide. Search, category jumps and expandable answers work offline. This document shares the in-app content source.',
  'アプリ内：設定 → OmiComic について → 操作ガイド。オフライン検索・分類移動・折りたたみに対応し、この文書と同じ内容を使用します。',
];
for (let language = 0; language < 3; language++) {
  const text = value => value[language];
  const output = [`# OmiComic · ${text(data.ui.title)}`, '', intro[language], '', data.sections.map(section => `[${text(section.title)}](#guide-${section.id})`).join(' · '), ''];
  for (const section of data.sections) {
    output.push(`<a id="guide-${section.id}"></a>`, '', `## ${text(section.title)}`, '');
    for (const topic of section.topics) {
      const platform = topic.platform ? ` · ${topic.platform === 'pc' ? 'Windows' : 'Android'}` : '';
      output.push(`<details>`, `<summary>${text(topic.title)}${platform}</summary>`, '');
      if (topic.body) output.push(text(topic.body), '');
      if (topic.pc) output.push(`**Windows：** ${text(topic.pc)}`, '');
      if (topic.android) output.push(`**Android：** ${text(topic.android)}`, '');
      if (topic.rows) {
        for (const row of topic.rows) output.push(`- **${text(row.label)}** — ${text(row.text)}`);
        output.push('');
      }
      output.push('</details>', '');
    }
  }
  const file = ['README_使用方法.md', 'docs/USER_GUIDE.en.md', 'docs/USER_GUIDE.ja.md'][language];
  fs.writeFileSync(path.join(root, file), output.join('\n'));
  console.log(file);
}
