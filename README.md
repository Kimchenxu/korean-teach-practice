# 每天一点点韩语 🌷

适合**能听懂、能说韩语，但写句子不熟练**的人使用的手机练习网页。项目是原生 HTML + CSS + JavaScript + JSON，不需要 npm、React、数据库或付费服务器。

- 首页列出已经发布的课程，手机点开即可练习。
- 每天独立题库；选择题自动评分，造句题看参考答案后自评。
- 分天保存作答和成绩，同一部手机的同一个浏览器可继续学习。
- 可以复制每一天的详细成绩发给家人。
- 不会上传作答记录；如果换手机、清理浏览器数据或用不同浏览器，记录不会自动同步。

## 目录结构

```text
korean-mom-practice/
├── index.html                  # 唯一的网页入口，基本不用改
├── assets/
│   ├── style.css               # 手机端样式
│   └── app.js                  # 通用答题逻辑，基本不用改
├── lessons/
│   ├── index.json              # 课程列表，新加 Day 要在这里登记
│   ├── day01/
│   │   └── lesson.json         # Day 1：-고 入门，15 题
│   ├── day02/
│   │   └── lesson.json         # Day 2：-고 进阶，15 题
│   └── _template/
│       └── lesson.json         # 新课程模板（不会出现在主页）
└── README.md
```

## 在 VS Code 里怎么预览？

**不要直接双击 `index.html` 用 `file://` 打开。** 由于题目放在 JSON 文件里，浏览器通常会禁止 `file://` 页面读取其他文件。

### 最简单：Live Server

1. 用 VS Code 打开整个 `korean-mom-practice` **文件夹**。
2. 安装 VS Code 插件 **Live Server**。
3. 右键 `index.html` → **Open with Live Server**。
4. 会打开类似 `http://127.0.0.1:5500/` 的地址；点击 Day 1、Day 2 开始答题。

不安装插件也可以在项目文件夹打开终端执行：

```bash
# 用 Python 启动一个仅用于本地预览的静态文件服务器。
python3 -m http.server 5500
```

然后打开 `http://localhost:5500/`。

## 如何新增 Day 3？只需要两步

### 第 1 步：复制课程模板

在 VS Code 中，把 `lessons/_template/lesson.json` 复制到新建的 `lessons/day03/lesson.json`。模板现在已经写好一个 `-지만` 示例，你可以继续加题、改讲解。

每个 `lesson.json` 大致是这样的：

```json
{
  "id": "day03",
  "day": 3,
  "topic": "-지만",
  "category": "句子连接",
  "title": "学会表达‘但是’",
  "summary": "今天练习韩语转折句。",
  "minutes": 20,
  "lesson": {
    "title": "-지만：表达转折",
    "rule": "在这里写语法讲解。",
    "before": ["오늘은 바빠요.", "그래도 공부해요."],
    "beforeTranslation": "今天很忙。还是学习。",
    "after": "오늘은 바쁘지만 공부해요.",
    "afterTranslation": "今天虽然忙，但还是学习。",
    "tips": ["바쁘다 → 바쁘지만"]
  },
  "sections": [
    {
      "title": "第一部分 · 选择填空",
      "description": "选出正确答案",
      "hint": "1 道选择题",
      "questions": [
        {
          "id": "q01",
          "type": "choice",
          "prompt": "오늘은 바쁘(   ) 공부해요.",
          "options": ["고", "지만", "어서"],
          "answer": "지만",
          "explanation": "바쁘다 + 지만 → 바쁘지만。"
        }
      ]
    },
    {
      "title": "第二部分 · 句子合并",
      "description": "合并短句",
      "hint": "1 道写作题",
      "questions": [
        {
          "id": "q02",
          "type": "write",
          "prompt": "오늘은 바빠요.\n그래도 공부해요.",
          "answer": "오늘은 바쁘지만 공부해요.",
          "explanation": "바쁘다 + 지만 → 바쁘지만。"
        }
      ]
    }
  ]
}
```

注意：

- `type: "choice"` 是**选择题**，需要 `options`；`type: "write"` 是**输入答案的写作题**，不需要 `options`。
- 每道题的 `id` 在**当天**不能重复（如 `q01`、`q02`）。不同天可以重用同样的题号。
- `sections` 和 `questions` 可以自行增加或删减，系统会自动计算题量和分数。
- `id` 不要随便更改，系统依靠它找到对应的浏览器本地进度。
- **JSON 不支持 `//` 或 `/* ... */` 注释**。需要解释的内容写进 `explanation`，开发备注写在 README 或 JS 注释中。

### 第 2 步：登记到课程列表

打开 `lessons/index.json`，把新课程加进 `lessons` 数组：

```json
{
  "siteTitle": "每天一点点韩语",
  "headline": "把韩语说成完整的句子",
  "description": "从简单短句开始，每天练一点连接语法。",
  "plannedDays": 14,
  "lessons": ["day01", "day02", "day03"]
}
```

刷新首页，就会自动出现 **Day 3**。以后 Day 4、Day 5 也是相同操作：**建文件夹 + 写 lesson.json + 在 index.json 登记**。不用碰 `assets/app.js`。

## 部署到 GitHub Pages

1. 把**整个项目里的内容**上传到 GitHub 仓库根目录（必须能在仓库首页看到 `index.html`、`assets/`、`lessons/`）。不是只上传 ZIP。
2. GitHub 仓库 → **Settings → Pages**。
3. **Source** 设为 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)` → **Save**。
4. 发布后访问 `https://<你的用户名>.github.io/<仓库名>/`。

更新课程后，在 VS Code 的 Source Control 中提交并同步，或在项目目录执行：

```bash
# 将新增和修改的课程文件纳入版本管理。
git add .
# 为这次课程更新留下说明。
git commit -m "Add Korean practice lessons"
# 推送到 GitHub，Pages 会依据仓库设置重新发布。
git push
```

> 如果已有仓库：将 ZIP 解压后的**全部文件**拷贝到该仓库的根目录，再提交更新。旧版只有一个 `index.html`，新版还需要 `assets/` 和 `lessons/` 两个文件夹。

## 常见问题

**首页显示“课程没能打开”**：通常是直接双击本地 HTML，或 JSON 路径/拼写出错。先检查是否通过 Live Server 打开，并用编辑器校验 JSON。

**新课没出现**：检查文件是否在 `lessons/day03/lesson.json`，且 `lessons/index.json` 已登记 `day03`，文件里的 `id` 也是 `day03`。

**更新后妈妈的旧成绩还在吗？** 只要同一浏览器、本地数据没被清除，且课程 `id` 与题目 `id` 没变，通常会保留。如果改变了题目意思和正确答案，建议采用新的题号，避免旧答题记录误用。

**能跨手机同步吗？** 不能。这个版本为了免费、简单、不用注册，使用本地浏览器存储。未来如果需要家长后台、跨设备同步，可以在此结构上增加服务器或数据库。
