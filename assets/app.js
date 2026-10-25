"use strict";

/*
 * 课程引擎：课程内容放在 lessons/dayXX/lesson.json 或 lessons/extensionXX/lesson.json。
 * 新课仅需新增目录并登记 lessons/index.json；课程题库与页面逻辑相互分离。
 * 由于浏览器安全限制，JSON 的 fetch 必须通过 http(s) 打开，VS Code 可用 Live Server。
 */
const app = document.getElementById("app");
const indicator = document.getElementById("top-indicator");
const STORAGE_PREFIX = "korean-mom-practice.v2.";
const state = { manifest: null, lessons: new Map(), lesson: null, answers: {}, grades: {}, submitted: false };
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// 每道题的 id 独立于排序，用 id 保存答案，增删题目时不会把旧答案串到其它题上。
function key(id) { return `${STORAGE_PREFIX}${id}`; }
function readProgress(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(key(id)) || "null");
    if (raw && typeof raw === "object") return {
      answers: raw.answers && typeof raw.answers === "object" ? raw.answers : {},
      grades: raw.grades && typeof raw.grades === "object" ? raw.grades : {},
      submitted: raw.submitted === true
    };
  } catch (_) { /* 某些手机无本地存储权限时，依然允许练习。 */ }
  return { answers:{}, grades:{}, submitted:false };
}
function saveProgress() {
  if (!state.lesson) return;
  try { localStorage.setItem(key(state.lesson.id), JSON.stringify({
    answers:state.answers,grades:state.grades,submitted:state.submitted
  })); } catch (_) { /* 存储失败不阻止答题。 */ }
}
function allQuestions(lesson=state.lesson) {
  return lesson.sections.flatMap(group => group.questions);
}
function completedQuestions() {
  return allQuestions().filter(q => String(state.answers[q.id] ?? "").trim()).length;
}
// 只对明确要求固定词形/改写格式的题自动核对，翻译开放题继续自评。
// 不删除汉字/韩文字之间的空格，避免把错误分词误判为完全正确。
function normalizeFixedAnswer(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g," ").replace(/[.!?。！？]+$/g,"").trim();
}
function isFixedCorrect(q) {
  const actual = normalizeFixedAnswer(state.answers[q.id]);
  // accept 可选：未来添加多个同样正确的固定答案时，使用字符串数组。
  const accepted = Array.isArray(q.accept) ? q.accept : [];
  return !!actual && [q.answer, ...accepted].some(ans => normalizeFixedAnswer(ans) === actual);
}
function isQuestionCorrect(q) {
  if (q.type === "choice") return state.answers[q.id] === q.answer;
  if (q.autoGrade) return isFixedCorrect(q);
  return state.grades[q.id] === "correct";
}
function labelFor(lesson) {
  // 扩展课程按 ID 自动生成名称，无需在 lesson.json 里增加 displayLabel。
  // 如果题库显式给了 displayLabel，优先保留已有设置。
  if (lesson.displayLabel) return lesson.displayLabel;
  const extensionMatch = /^extension(\d{2,3})$/.exec(lesson.id || "");
  if (extensionMatch) return `EXTENSION ${Number(extensionMatch[1])}`;
  return `DAY ${String(lesson.day).padStart(2,"0")}`;
}
function resultStats() {
  const qs = allQuestions();
  const choice = qs.filter(q => q.type === "choice");
  const auto = qs.filter(q => q.type === "write" && q.autoGrade);
  const manual = qs.filter(q => q.type === "write" && !q.autoGrade);
  const manualMarked = manual.filter(q => ["correct","review"].includes(state.grades[q.id]));
  const needsReview = qs.filter(q => q.type !== "write" || q.autoGrade
    ? !isQuestionCorrect(q) : state.grades[q.id] === "review");
  return {
    count:qs.length, choice:choice.length, choiceCorrect:choice.filter(isQuestionCorrect).length,
    auto:auto.length, autoCorrect:auto.filter(isQuestionCorrect).length,
    manual:manual.length, manualMarked:manualMarked.length,
    manualCorrect:manual.filter(isQuestionCorrect).length,
    complete:manualMarked.length === manual.length, needsReview,
    score:qs.filter(isQuestionCorrect).length
  };
}

// 静态托管不支持自动扫描文件夹，所以只需在 index.json 的 lessons 数组登记目录名。
async function loadCatalogue() {
  const resp = await fetch("./lessons/index.json", { cache:"no-cache" });
  if (!resp.ok) throw Error(`课程目录加载失败 (${resp.status})`);
  const manifest = await resp.json();
  if (!Array.isArray(manifest.lessons)) throw Error("lessons/index.json 缺少 lessons 数组");
  state.manifest = manifest;
  const rows = await Promise.all(manifest.lessons.map(async id => {
    // 增加 extensionXX 目录，不占用 Day 编号，后续可以自由扩展 Extension 2、3。
    if (!/^(?:day|extension)\d{2,3}$/.test(id)) throw Error(`无效的课程目录名：${id}`);
    const response = await fetch(`./lessons/${id}/lesson.json`, {cache:"no-cache"});
    if (!response.ok) throw Error(`读取 ${id}/lesson.json 失败 (${response.status})`);
    const lesson = await response.json();
    if (lesson.id !== id || !Array.isArray(lesson.sections) || !lesson.lesson) {
      throw Error(`${id}/lesson.json 的字段不完整`);
    }
    const qs = allQuestions(lesson);
    if (!qs.length || qs.some(q => !q.id || !["choice","write"].includes(q.type) || !q.prompt || !q.answer)) {
      throw Error(`${id} 的题目字段有误（需 id/type/prompt/answer）`);
    }
    if (new Set(qs.map(q=>q.id)).size !== qs.length) throw Error(`${id} 存在重复题目 id`);
    state.lessons.set(id, lesson);
    return lesson;
  }));
  // 保留 lessons/index.json 中的展示顺序。
  return rows;
}
function navId() {
  const match = /^#\/((?:day|extension)\d{2,3})\/?$/.exec(location.hash);
  return match ? match[1] : null;
}
function updateTitle(text) { document.title = `${text} · 每天一点点韩语`; }

function renderHome() {
  state.lesson = null;
  indicator.textContent = `${state.lessons.size} 个训练已上线`;
  updateTitle("课程首页");
  const items = [...state.lessons.values()];
  const cards = items.map(l => {
    const old = readProgress(l.id);
    const qs = allQuestions(l);
    const answered = qs.filter(q => String(old.answers[q.id]??"").trim()).length;
    const written = qs.filter(q=>q.type === "write");
    // 只有开放写作题需要人工核对，固定答案题提交后直接评分。
    const graded = written.filter(q=>!q.autoGrade).every(q=>["correct","review"].includes(old.grades[q.id]));
    const finished = old.submitted && graded;
    const tag = finished ? "✓ 已完成" : old.submitted ? "待核对" : answered ? `已做 ${answered}/${qs.length}` : "开始学习";
    return `<a href="#/${esc(l.id)}" class="panel course-card" aria-label="打开 ${esc(labelFor(l))}：${esc(l.title)}">
      <div class="course-top"><span class="course-day">${esc(labelFor(l))}</span><span class="course-status ${finished?"done":""}">${esc(tag)}</span></div>
      <h2>${esc(l.title)}</h2><p class="course-desc">${esc(l.summary)}</p>
      <div class="course-bottom"><span>${esc(l.topic)} · ${qs.length} 题 · 约 ${esc(l.minutes || 20)} 分钟</span><span aria-hidden="true">↗</span></div></a>`;
  }).join("");
  app.innerHTML = `<header class="hero home-hero">
    <div class="eyebrow">Korean Writing Practice</div>
    <h1>${esc(state.manifest.headline || "把韩语说成完整的句子")}</h1>
    <p class="subtitle">${esc(state.manifest.description || "每天一点点，练出自然的韩语句子。")}</p>
    <div class="summary"><span>📱 手机友好</span><span>✍️ 选择 + 造句</span><span>💾 自动保存进度</span></div>
  </header>
  <section aria-label="课程列表"><div class="group-header"><h2>选择今天的课程</h2><small>课程 ${items.filter(l=>!l.id.startsWith("extension")).length} 天 + 强化训练 ${items.filter(l=>l.id.startsWith("extension")).length} 组</small></div>
  <div class="home-grid">${cards}</div></section>
  <section class="panel home-info"><h2>给妈妈的小提示 🌷</h2><p>可以先把题目大声读出来，再打字写答案。写完后再看参考答案，不用一次就做到完美。短课可以每天十五分钟；强化卷可以分模块完成，页面会自动保存进度。</p></section>`;
}

function renderQuestion(q, number) {
  const value = state.answers[q.id] ?? "";
  const prompt = `<div class="qhead"><span class="qnum">${String(number).padStart(2,"0")}</span><div class="qtext ko">${esc(q.prompt)}</div></div>`;
  const control = q.type === "choice"
    ? `<div class="options" role="radiogroup" aria-label="第 ${number} 题">${(q.options || []).map(opt => `<label class="option ko"><input type="radio" name="${esc(q.id)}" data-answer="${esc(q.id)}" value="${esc(opt)}" ${value === opt ? "checked":""} ${state.submitted?"disabled":""}><span>${esc(opt)}</span></label>`).join("")}</div>`
    : `<textarea class="answerbox ko" data-answer="${esc(q.id)}" rows="${q.autoGrade?1:2}" aria-label="第 ${number} 题答案" placeholder="${q.autoGrade?"填写规定的韩语答案…":"在这里写完整韩语句子…"}" spellcheck="false" ${state.submitted?"readonly":""}>${esc(value)}</textarea>`;
  const stat = state.grades[q.id];
  const fixed = q.type === "write" && q.autoGrade;
  const passed = isQuestionCorrect(q);
  const details = state.submitted ? `<div class="answer-details">
    ${q.type === "choice" || fixed ? `<div class="${passed?"right-choice":"wrong-choice"}">${passed?"✓ 自动核对通过":"✗ 与标准答案不一致，请复习词形或拼写"}</div>` : ""}
    <div class="answer-label">参考答案</div><div class="answer-value ko">${esc(q.answer)}</div>
    <div class="explanation">${esc(q.explanation || "")}</div>
    ${q.type === "write" && !fixed ? `<div class="grade"><span class="grade-title">逐字检查助词、拼写和词尾，再核对：</span><button type="button" data-grade="${esc(q.id)}" data-state="correct" class="${stat==="correct"?"active":""}">✓ 已仔细核对，正确</button><button type="button" data-grade="${esc(q.id)}" data-state="review" class="${stat==="review"?"active":""}">↻ 需要复习</button></div>
    ${!isFixedCorrect(q)?`<div class="selfcheck-tip">提示：你的写法与参考答案不完全相同。可以是正确的其他表达，但务必检查词形、助词、拼写，不要只看意思接近。</div>`:""}` : ""}
    </div>` : "";
  return `<article class="question ${fixed?"fixed-question":""}" id="question-${esc(q.id)}">${prompt}${control}${details}</article>`;
}

function renderLesson(id) {
  const l = state.lessons.get(id);
  if (!l) { showError(`暂时没有找到 ${id} 这一天的课程。`); return; }
  // 重新渲染同一天（交卷、重做）时优先保留内存状态，兼容禁用 localStorage 的浏览器。
  const old = state.lesson?.id === id
    ? { answers: state.answers, grades: state.grades, submitted: state.submitted }
    : readProgress(id);
  state.lesson = l; state.answers = old.answers; state.grades = old.grades; state.submitted = old.submitted;
  indicator.textContent = labelFor(l);
  updateTitle(`${labelFor(l)} ${l.topic}`);
  const tipItems = (l.lesson.tips || []).map(s=>`<li class="ko">${esc(s)}</li>`).join("");
  let idx=0;
  const sectionHTML=l.sections.map((group, groupIndex)=>{
    const questionHTML=group.questions.map(q=>renderQuestion(q,++idx)).join("");
    return `<section class="group" id="section-${groupIndex}"><div class="group-header"><h2>${esc(group.title)}</h2><small>${esc(group.hint || "")}</small></div>
      <p class="group-desc">${esc(group.description || "")}</p>${questionHTML}</section>`;
  }).join("");
  const all=allQuestions();
  const pos=state.manifest.lessons.indexOf(id);
  const next=state.manifest.lessons[pos+1];
  // 长卷专用的分模块跳转，不改变 URL hash，以免与课程路由冲突。
  const jumpButtons = all.length >= 30 ? `<nav class="section-jumps" aria-label="快速跳转到练习模块">${l.sections.map((g,i)=>`<button type="button" data-scroll="section-${i}">${esc(g.title)}</button>`).join("")}</nav>` : "";
  app.innerHTML = `<a class="back-link" href="#/">← 返回课程目录</a>
    <header class="hero"><div class="eyebrow">${esc(labelFor(l))} · ${esc(l.category || "句子训练")}</div>
      <h1>${esc(l.title)}</h1><p class="subtitle">${esc(l.summary)}</p>
      <div class="summary"><span>⏱ 约 ${esc(l.minutes || 20)} 分钟</span><span>✍️ ${all.length} 道练习题</span><span>📱 自动保存进度</span></div>
    </header>
    <section class="panel lesson"><div class="section-kicker"><i>✦</i> 今日学习卡</div>
      <h2>${esc(l.lesson.title)}</h2><p>${esc(l.lesson.rule)}</p>
      <div class="example"><div class="ko">${(l.lesson.before || []).map(esc).join("<br>")}</div>
        <div class="meaning">${esc(l.lesson.beforeTranslation || "")}</div>
        <div class="arrow">↓ 合成一句话</div>
        <div class="ko after">${esc(l.lesson.after || "")}</div><div class="meaning">${esc(l.lesson.afterTranslation || "")}</div></div>
      <div class="tip"><span>💡</span><div><b>小提醒：</b><ul class="tips-list">${tipItems}</ul></div></div>
    </section>
    <section class="panel progress-panel"><div class="progress-row"><span id="progress-text">做题进度</span>
      <span id="progress-count">0 / ${all.length}</span></div><div class="track"><div id="progress-fill" class="fill"></div></div></section>
    ${jumpButtons}<div id="quiz">${sectionHTML}</div>
    <section class="actions ${state.submitted?"hidden":""}" id="submit-area"><button class="button primary" data-action="submit" type="button">完成练习 · 查看答案 →</button>
      <p>可分几次完成，进度自动保存。固定形式题自动核对，开放题请逐字检查。</p></section>
    <section class="panel result ${state.submitted?"":"hidden"}" id="results" aria-live="polite">
      <div class="result-top"><div><div class="section-kicker">✓ 今日练习总结</div><h2>今天完成啦！</h2></div>
      <div class="score" id="score">—<small>满分 ${all.length} 分</small></div></div>
      <p id="score-detail"></p><div id="review-note" class="review-note"></div>
      <div class="result-controls"><button class="button secondary" data-action="copy" type="button">📋 复制成绩发给家人</button>
      <button class="button ghost" data-action="reset" type="button">↻ 重新做一遍</button></div>
      <p class="copy-message hidden" id="copy-message"></p><textarea id="manual-copy" class="hidden" readonly rows="5" aria-label="手动复制成绩"></textarea>
      ${next?`<div class="day-nav"><a class="button secondary" href="#/${esc(next)}">去下一天练习 →</a></div>`:""}
    </section>`;
  updateProgress();
  if (state.submitted) updateResults();
}
function updateProgress() {
  if (!state.lesson) return;
  const qs = allQuestions();
  const count = completedQuestions();
  const countNode=document.getElementById("progress-count");
  if (countNode) countNode.textContent = `${count} / ${qs.length}`;
  const fill=document.getElementById("progress-fill");
  if (fill) fill.style.width = `${count/qs.length*100}%`;
  const info=document.getElementById("progress-text");
  if (info) info.textContent = count===qs.length ? "全部题目都已填写 ✓" : "做题进度";
}
function updateResults() {
  const stats = resultStats();
  document.getElementById("score").innerHTML = `${stats.complete?stats.score:"—"}<small>满分 ${stats.count} 分</small>`;
  document.getElementById("score-detail").textContent = `选择题 ${stats.choiceCorrect}/${stats.choice} · 固定答案自动核对 ${stats.autoCorrect}/${stats.auto} · 开放题自评 ${stats.manualCorrect}/${stats.manual}`;
  document.getElementById("review-note").textContent = stats.complete
    ? `共 ${stats.needsReview.length} 道需要复习。开放翻译的分数是自评，不代表老师已经批改；对照参考答案再看一遍。`
    : `还剩 ${stats.manual-stats.manualMarked} 道开放题未核对。固定形式题判分较严格，有其他正确表达可向家人确认。`;
}
function mark(qid, verdict) {
  const q = allQuestions().find(item => item.id === qid);
  if (!q || q.type !== "write" || q.autoGrade) return;
  // 旧版自评容易把拼写错误算作正确：答案不一致时增加一次确认。
  if (verdict === "correct" && !isFixedCorrect(q) &&
      !confirm("你的答案与参考答案不同。请仔细核对拼写、助词、词尾。确认它确实是自然且语法正确的韩语吗？")) return;
  state.grades[qid] = verdict;
  saveProgress();
  // 只刷新当前题的两个按钮，避免重新渲染页面导致手机滚动位置跳动。
  document.querySelectorAll("[data-grade]").forEach(button => {
    if (button.dataset.grade === qid) button.classList.toggle("active",button.dataset.state===verdict);
  });
  updateResults();
}

function submitLesson() {
  if (state.submitted) return;
  const missed=allQuestions().length-completedQuestions();
  if (missed && !confirm(`还有 ${missed} 道题没写。要现在交卷并查看答案吗？`)) return;
  state.submitted=true;saveProgress();
  renderLesson(state.lesson.id);
  const first=document.querySelector(".question");
  first?.scrollIntoView({behavior:"smooth",block:"start"});
}
function makeSummary() {
  const l=state.lesson,qs=allQuestions(),s=resultStats();
  function verdict(q) {
    if (q.type === "choice" || q.autoGrade) return isQuestionCorrect(q) ? "✓ 自动核对正确" : "✗ 自动核对未通过";
    if (state.grades[q.id] === "correct") return "✓ 自评正确（未自动核验）";
    if (state.grades[q.id] === "review") return "✗ 自评需要复习";
    return "○ 尚未自评";
  }
  return [
    `📖 韩语训练 · ${labelFor(l)} (${l.topic})`,
    s.complete ? `总分：${s.score}/${s.count}（开放题含自评）` : `已自动核对：${s.choiceCorrect+s.autoCorrect}/${s.choice+s.auto}；尚有 ${s.manual-s.manualMarked} 道开放题待自评`,
    `需要复习：${s.needsReview.length} 题${s.needsReview.length?`（${s.needsReview.map(q=>qs.indexOf(q)+1).join("、")}）`:""}`,
    "", ...qs.map((q,i) => `${i+1}. ${String(state.answers[q.id] || "（未作答）").replace(/\s*\n\s*/g," / ")}\n   ${verdict(q)}`)
  ].join("\n");
}

async function copySummary() {
  const message=document.getElementById("copy-message");
  const backup=document.getElementById("manual-copy");
  const text=makeSummary();
  try {
    if (!navigator.clipboard?.writeText) throw Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(text);
    message.textContent="✓ 已复制！打开微信或其他聊天软件粘贴发送即可。";
    backup.classList.add("hidden");
  } catch (_) {
    // 部分微信内置浏览器不开放 Clipboard API；显示可选中的文本作为备用方案。
    backup.value=text;backup.classList.remove("hidden");backup.focus();backup.select();
    let copied=false;
    try { copied=document.execCommand("copy"); } catch (_) { /* 保留手动复制。 */ }
    message.textContent=copied?"✓ 已复制成绩，可直接粘贴发送。":"请长按下方文字，选择「全选」和「复制」。";
  }
  message.classList.remove("hidden");
}
function resetLesson() {
  if (!confirm("确定清空这一天的所有作答和成绩，并重新练习吗？")) return;
  state.answers={};state.grades={};state.submitted=false;saveProgress();
  renderLesson(state.lesson.id);
  scrollTo({top:0,behavior:"smooth"});
}
function showError(reason) {
  indicator.textContent="加载失败";
  app.innerHTML=`<section class="panel error-panel"><h1>课程没能打开</h1><p>${esc(reason)}</p>
    <p>如果你在 VS Code 里直接双击打开 <code>index.html</code>，浏览器可能不允许读取 JSON 文件。请使用 <b>Live Server</b> 预览；上传 GitHub Pages 后就能正常打开。</p>
    <a href="#/" class="back-link">← 返回首页</a></section>`;
}
function showRoute() {
  const id=navId();
  if (!id) renderHome(); else renderLesson(id);
  scrollTo(0,0);
}

// 事件代理：加新题或加新课程时都无需注册额外的监听器。
app.addEventListener("input",event => {
  const target=event.target;
  if (!state.lesson || state.submitted || !target.matches("textarea[data-answer]")) return;
  state.answers[target.dataset.answer] = target.value;saveProgress();updateProgress();
});
app.addEventListener("change",event => {
  const target=event.target;
  if (!state.lesson || state.submitted || !target.matches('input[type="radio"][data-answer]')) return;
  state.answers[target.dataset.answer] = target.value;saveProgress();updateProgress();
});
app.addEventListener("click",event => {
  const button=event.target.closest("button");
  if (!button || !state.lesson) return;
  if (button.dataset.grade) return mark(button.dataset.grade,button.dataset.state);
  if (button.dataset.scroll) { document.getElementById(button.dataset.scroll)?.scrollIntoView({behavior:"smooth",block:"start"}); return; }
  const actions={submit:submitLesson,copy:copySummary,reset:resetLesson};
  if (actions[button.dataset.action]) actions[button.dataset.action]();
});
window.addEventListener("hashchange",showRoute);
loadCatalogue().then(showRoute).catch(err=>showError(err.message));
