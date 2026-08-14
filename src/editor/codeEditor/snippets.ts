/**
 * 代码片段（源码编辑器自动补全）：prefix → body，$1/$2 为光标占位。
 */
export const SNIPPETS: Record<string, { prefix: string; body: string }[]> = {
  javascript: [
    { prefix: "log", body: "console.log($1);\n$0" },
    { prefix: "fn", body: "function $1($2) {\n    $0\n}" },
    { prefix: "af", body: "const $1 = ($2) => {\n    $0\n};" },
    { prefix: "imp", body: "import { $1 } from '$2';\n$0" },
    { prefix: "try", body: "try {\n    $1\n} catch (error) {\n    $0\n}" },
    { prefix: "for", body: "for (let i = 0; i < $1; i++) {\n    $0\n}" },
    { prefix: "if", body: "if ($1) {\n    $0\n}" },
  ],
  typescript: [
    { prefix: "log", body: "console.log($1);\n$0" },
    { prefix: "fn", body: "function $1($2): $3 {\n    $0\n}" },
    { prefix: "iface", body: "interface $1 {\n    $0\n}" },
    { prefix: "type", body: "type $1 = {\n    $0\n};" },
    { prefix: "imp", body: "import { $1 } from '$2';\n$0" },
  ],
  python: [
    { prefix: "def", body: "def $1($2):\n    $0" },
    { prefix: "class", body: "class $1:\n    def __init__(self):\n        $0" },
    { prefix: "ifmain", body: "if __name__ == \"__main__\":\n    $0" },
    { prefix: "for", body: "for $1 in $2:\n    $0" },
    { prefix: "try", body: "try:\n    $1\nexcept $2:\n    $0" },
  ],
  default: [],
};
