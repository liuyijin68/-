# 小淘单词听写王 - 后端调用优化计划

## 概述

优化现有 HTML 网页版单词听写程序，将 TTS 发音、答案检查、词库管理从后端 API 调用改为纯前端实现（Web Speech API + localStorage），大幅减少后端调用次数和积分消耗。仅保留必须的后端能力：LLM 图片识别/手写识别、TOS 图片上传、Supabase 养成系统数据持久化。同时确认词库单词数量并补充至 700+ 词。

## 技术方案

| 维度 | 选择 | 理由 |
|------|------|------|
| TTS 发音 | Web Speech API (`SpeechSynthesis`) | 浏览器原生支持，零后端调用，零积分消耗 |
| 答案检查 | 前端纯字符串比较 | 简单逻辑（trim + 去标点 + 包含匹配），无需后端 |
| 词库管理 | `localStorage` 按用户 ID 隔离 | 用户级持久化，无需后端内存数组 |
| 等级计算 | 前端 `calcLevel()` 纯函数 | 已在前端实现，无需后端 |
| 图片识别 | 保留后端 LLM (`recognize-all-words`) | 需要多模态大模型，不可替代 |
| 手写识别 | 保留后端 LLM (`recognize-handwriting`) | 需要视觉识别，不可替代 |
| 图片上传 | 保留后端 TOS (`upload-image`) | 需要对象存储，不可替代 |
| 养成系统 | 保留后端 Supabase（register/users/user/earn/spend/history/stats） | 需要跨设备数据持久化 |
| 初始词库导入 | 保留后端 (`import-initial-words`) | 一次性种子数据导入 |

## 功能模块

### 1. 前端 TTS 模块（替代 `/api/dictation/speak-word-both`）

- 使用 `window.speechSynthesis` API
- 美式发音：`lang='en-US'`
- 英式发音：`lang='en-GB'`
- 自动检测浏览器支持，不支持时降级提示
- 去掉原有的 `playAudio(url)` 网络请求方式

### 2. 前端词库模块（替代所有词库 CRUD API）

- 数据结构：`localStorage` 中按 `userId` 隔离存储
  ```
  dictation_words_{userId}: { newWords: WordEntry[], reviewWords: WordEntry[] }
  ```
- `WordEntry`: `{ word: string, meanings: string[], date: string }`
- 替代的 API：`get-new-words`、`get-review-words`、`add-to-review`、`remove-from-review`、`add-word`、`remove-word`、`remove-from-bank`
- 初始词库仍通过后端 `import-initial-words` 一次性导入，之后前端从 localStorage 读取

### 3. 前端答案检查（替代 `/api/dictation/check-answer`）

- 逻辑迁移到前端：trim + 去标点 + 小写 + 包含匹配
- 与后端原有逻辑完全一致

### 4. 后端精简

移除以下不再需要的端点：
- `POST /api/dictation/speak-word-both` — 前端 Web Speech API 替代
- `POST /api/dictation/check-answer` — 前端字符串比较替代
- `POST /api/dictation/get-new-words` — localStorage 替代
- `POST /api/dictation/get-review-words` — localStorage 替代
- `POST /api/dictation/add-to-review` — localStorage 替代
- `POST /api/dictation/remove-from-review` — localStorage 替代
- `POST /api/dictation/add-word` — localStorage 替代
- `POST /api/dictation/remove-word` — localStorage 替代
- `POST /api/dictation/remove-from-bank` — localStorage 替代
- `POST /api/dictation/upload-audio` — 不再需要（已用手写输入替代语音）
- `POST /api/dictation/recognize-speech` — 不再需要

保留的端点：
- `POST /api/dictation/upload-image` — TOS 图片上传
- `POST /api/dictation/recognize-all-words` — LLM 图片单词识别
- `POST /api/dictation/recognize-handwriting` — LLM 手写识别
- `POST /api/dictation/import-initial-words` — 初始词库导入
- `POST /api/growth/register` — 用户注册
- `GET /api/growth/users` — 用户列表
- `GET /api/growth/user/:id` — 用户信息
- `POST /api/growth/earn` — 积分获取
- `POST /api/growth/spend` — 积分消耗
- `GET /api/growth/history/:userId` — 积分历史
- `GET /api/growth/stats/:userId` — 积分统计

### 5. 词库补充

- 检查当前新单词词库数量
- 如不足 700+，从七年级上册单词表补充
- 发音由前端 Web Speech API 实时生成，无需预存

## 是否有原型设计

否（项目首次开发已完成，本次为现有程序的优化重构，不涉及 UI 变更）

## 实施步骤

1. **重构前端 HTML**：TTS 改用 Web Speech API、词库改用 localStorage、答案检查改用前端比较、移除对已删除后端端点的调用 — `server/public/index.html`
2. **精简后端 Controller**：移除 speak-word-both、check-answer、词库 CRUD、upload-audio、recognize-speech 等 11 个不再需要的端点 — `server/src/dictation/dictation.controller.ts`
3. **确认并补充词库**：检查词库单词数量，如不足 700+ 则通过 import-initial-words 补充 — `server/src/dictation/dictation.controller.ts`
4. **API 测试 + 前后端匹配验证**：curl 测试保留的后端端点，验证前端调用与后端路由一致
5. **执行 pnpm validate 校验**：修复所有 TypeScript 与 ESLint 错误
6. **编译检查与验证**：执行 `pnpm build` 确认构建成功，模拟用户流程验证完整功能
