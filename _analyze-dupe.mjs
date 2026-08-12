import fs from "node:fs";
const path = "src/test/useAppStore.test.ts";
const s = fs.readFileSync(path, "utf8");
const lines = s.split(/\r?\n/);
const markers = [];
lines.forEach((l, i) => {
  if (l.includes('describe("session restore')) markers.push(i + 1);
});
console.log("total lines:", lines.length);
console.log("session restore describe starts at lines:", markers);
// 打印每个 describe 块的结束位置（匹配大括号）
for (const start of markers) {
  let depth = 0;
  let end = start;
  for (let i = start - 1; i < lines.length; i++) {
    const line = lines[i];
    const open = (line.match(/{/g) || []).length;
    const close = (line.match(/}/g) || []).length;
    depth += open - close;
    if (depth <= 0 && i > start - 1) {
      end = i + 1;
      break;
    }
  }
  console.log(`block starting at line ${start} ends at line ${end}`);
}
// 检查重复：第二个块的起始行内容
if (markers.length > 1) {
  console.log("--- lines before 2nd block ---");
  console.log(lines.slice(markers[1] - 4, markers[1] + 2).join("\n"));
}
