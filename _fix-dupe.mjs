import fs from "node:fs";
const path = "src/test/useAppStore.test.ts";
const s = fs.readFileSync(path, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const lines = s.split(/\r?\n/);

// 第二个 describe 块从行 262 开始（1-based），到 320 结束；321-323 为多余空行。
// 删除 262..323（1-based）→ 数组索引 261..322
const startIdx = 261; // 1-based 262
const endIdx = 322; // 1-based 323 (inclusive)
const removed = lines.slice(startIdx, endIdx + 1);
console.log("removing lines 262-323, first line:", JSON.stringify(removed[0]));
console.log("last line:", JSON.stringify(removed[removed.length - 1]));

// 校验待删除块确实是重复的 session restore 块
if (!removed[0].includes('describe("session restore')) {
  throw new Error("unexpected start, aborting");
}

const kept = lines.slice(0, startIdx).concat(lines.slice(endIdx + 1));
// 去掉文件末尾多余空行，保留一个结尾换行
let out = kept.join(nl).replace(/\s+$/, "") + nl;
fs.writeFileSync(path, out);
console.log("new total lines:", out.split(/\r?\n/).length - 1);
