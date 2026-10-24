"use strict";

/*
 * 课程引擎：课程内容全部在 lessons/dayXX/lesson.json 中。
 * 要新增一天，不需要改这个文件：复制 _template 目录并更新 lessons/index.json。
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
function resultStats() {
  const qs = allQuestions();
  const choice = qs.filter(q => q.type === "choice");
  const written = qs.filter(q => q.type === "write");
  const mcCorrect = choice.filter(q => state.answers[q.id] === q.answer).length;
  const marked = written.filter(q => ["correct","review"].includes(state.grades[q.id]));
  const writtenCorrect = written.filter(q => state.grades[q.id] === "correct").length;
  const needsReview = qs.filter(q => q.type === "choice" ? state.answers[q.id] !== q.answer : state.grades[q.id] === "review");
  return { count:qs.length, choice:choice.length, written:written.length, mcCorrect,
    marked:marked.length, writtenCorrect, complete:marked.length === written.length,
    needsReview, score:mcCorrect+writtenCorrect };
}

// 静态托管不支持自动扫描文件夹，所以只需在 index.json 的 lessons 数组登记目录名。
async function loadCatalogue() {
  const resp = await fetch("./lessons/index.json", { cache:"no-cache" });
  if (!resp.ok) throw Error(`课程目录加载失败 (${resp.status})`);
  const manifest = await resp.json();
  if (!Array.isArray(manifest.lessons)) throw Error("lessons/index.json 缺少 lessons 数组");
  state.manifest = manifest;
  const rows = await Promise.all(manifest.lessons.map(async id => {
    if (!/^day\d{2,3}$/.test(id)) throw Error(`无效的课程目录名：${id}`);
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
  const match = /^#\/((?:day\d{2,3}))\/?$/.exec(location.hash);
  return match ? match[1] : null;
}
function updateTitle(text) { document.title = `${text} · 每天一点点韩语`; }

function renderHome() {
  state.lesson = null;
  indicator.textContent = `${state.lessons.size} 天已上线`;
  updateTitle("课程首页");
  const items = [...state.lessons.values()];
  const cards = items.map(l => {
    const old = readProgress(l.id);
    const qs = allQuestions(l);
    const answered = qs.filter(q => String(old.answers[q.id]??"").trim()).length;
    const written = qs.filter(q=>q.type === "write");
    const graded = written.every(q=>["correct","review"].includes(old.grades[q.id]));
    const finished = old.submitted && graded;
    const tag = finished ? "✓ 已完成" : old.submitted ? "待核对" : answered ? `已做 ${answered}/${qs.length}` : "开始学习";
    return `<a href="#/${esc(l.id)}" class="panel course-card" aria-label="打开 Day ${esc(l.day)}：${esc(l.title)}">
      <div class="course-top"><span class="course-day">DAY ${String(l.day).padStart(2,"0")}</span><span class="course-status ${finished?"done":""}">${esc(tag)}</span></div>
      <h2>${esc(l.title)}</h2><p class="course-desc">${esc(l.summary)}</p>
      <div class="course-bottom"><span>${esc(l.topic)} · ${qs.length} 题 · 约 ${esc(l.minutes || 20)} 分钟</span><span aria-hidden="true">↗</span></div></a>`;
  }).join("");
  app.innerHTML = `<header class="hero home-hero">
    <div class="eyebrow">Korean Writing Practice</div>
    <h1>${esc(state.manifest.headline || "把韩语说成完整的句子")}</h1>
    <p class="subtitle">${esc(state.manifest.description || "每天一点点，练出自然的韩语句子。")}</p>
    <div class="summary"><span>📱 手机友好</span><span>✍️ 选择 + 造句</span><span>💾 自动保存进度</span></div>
  </header>
  <section aria-label="课程列表"><div class="group-header"><h2>选择今天的课程</h2><small>已上线 ${items.length} / 计划 ${esc(state.manifest.plannedDays || items.length)} 天</small></div>
  <div class="home-grid">${cards}</div></section>
  <section class="panel home-info"><h2>给妈妈的小提示 🌷</h2><p>可以先把题目大声读出来，再打字写答案。写完后再看参考答案，不用一次就做到完美。每天十五到二十分钟就好。</p></section>`;
}

function renderQuestion(q, number) {
  const value = state.answers[q.id] ?? "";
  const prompt = `<div class="qhead"><span class="qnum">${String(number).padStart(2,"0")}</span><div class="qtext ko">${esc(q.prompt)}</div></div>`;
  const control = q.type === "choice"
    ? `<div class="options" role="radiogroup" aria-label="第 ${number} 题">${(q.options || []).map(opt => `<label class="option ko"><input type="radio" name="${esc(q.id)}" data-answer="${esc(q.id)}" value="${esc(opt)}" ${value === opt ? "checked":""} ${state.submitted?"disabled":""}><span>${esc(opt)}</span></label>`).join("")}</div>`
    : `<textarea class="answerbox ko" data-answer="${esc(q.id)}" rows="2" aria-label="第 ${number} 题答案" placeholder="在这里写韩语句子…" spellcheck="false" ${state.submitted?"readonly":""}>${esc(value)}</textarea>`;
  const stat = state.grades[q.id];
  const details = state.submitted ? `<div class="answer-details">
    ${q.type === "choice" ? `<div class="${value===q.answer?"right-choice":"wrong-choice"}">${value===q.answer?"✓ 这道题答对了":"✗ 这道题需要复习"}</div>` : ""}
    <div class="answer-label">参考答案</div><div class="answer-value ko">${esc(q.answer)}</div>
    <div class="explanation">${esc(q.explanation || "")}</div>
    ${q.type === "write" ? `<div class="grade"><span class="grade-title">对照后核对：</span><button type="button" data-grade="${esc(q.id)}" data-state="correct" class="${stat==="correct"?"active":""}">✓ 我写对了</button><button type="button" data-grade="${esc(q.id)}" data-state="review" class="${stat==="review"?"active":""}">↻ 需要复习</button></div>` : ""}
    </div>` : "";
  return `<article class="question" id="question-${esc(q.id)}">${prompt}${control}${details}</article>`;
}

function renderLesson(id) {
  const l = state.lessons.get(id);
  if (!l) { showError(`暂时没有找到 ${id} 这一天的课程。`); return; }
  // 重新渲染同一天（交卷、重做）时优先保留内存状态，兼容禁用 localStorage 的浏览器。
  const old = state.lesson?.id === id
    ? { answers: state.answers, grades: state.grades, submitted: state.submitted }
    : readProgress(id);
  state.lesson = l; state.answers = old.answers; state.grades = old.grades; state.submitted = old.submitted;
  indicator.textContent = `DAY ${String(l.day).padStart(2,"0")} / ${state.manifest.plannedDays || state.lessons.size}`;
  updateTitle(`Day ${l.day} ${l.topic}`);
  const tipItems = (l.lesson.tips || []).map(s=>`<li class="ko">${esc(s)}</li>`).join("");
  let idx=0;
  const sectionHTML=l.sections.map(group=>{
    const questionHTML=group.questions.map(q=>renderQuestion(q,++idx)).join("");
    return `<section class="group"><div class="group-header"><h2>${esc(group.title)}</h2><small>${esc(group.hint || "")}</small></div>
      <p class="group-desc">${esc(group.description || "")}</p>${questionHTML}</section>`;
  }).join("");
  const all=allQuestions();
  const pos=state.manifest.lessons.indexOf(id);
  const next=state.manifest.lessons[pos+1];
  app.innerHTML = `<a class="back-link" href="#/">← 返回课程目录</a>
    <header class="hero"><div class="eyebrow">Day ${String(l.day).padStart(2,"0")} · ${esc(l.category || "句子训练")}</div>
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
    <div id="quiz">${sectionHTML}</div>
    <section class="actions ${state.submitted?"hidden":""}" id="submit-area"><button class="button primary" data-action="submit" type="button">完成练习 · 查看答案 →</button>
      <p>进度自动保存在这台设备的浏览器中；中途退出也可以继续。</p></section>
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
  document.getElementById("score-detail").textContent = `选择题：${stats.mcCorrect} / ${stats.choice} · 写作题已核对：${stats.marked} / ${stats.written}`;
  document.getElementById("review-note").textContent = stats.complete
    ? stats.score >= Math.ceil(stats.count*.8) ? "做得不错！回顾错题，明天继续练习。" : "把需要复习的题再大声说一遍、写一遍，慢慢来就好。"
    : `还剩 ${stats.written-stats.marked} 道写作题没核对。其他自然、正确的韩语表达也算对，不必与参考答案一模一样。`;
}
function mark(qid, verdict) {
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
  return [
    `📖 韩语训练 · Day ${String(l.day).padStart(2,"0")} (${l.topic})`,
    s.complete ? `总分：${s.score}/${s.count}` : `选择题：${s.mcCorrect}/${s.choice}（写作题尚未全部核对）`,
    `需要复习：${s.needsReview.length} 题${s.needsReview.length?`（${s.needsReview.map(q=>qs.indexOf(q)+1).join("、")}）`:""}`,
    "", ...qs.map((q,i) => `${i+1}. ${String(state.answers[q.id] || "（未作答）").replace(/\s*\n\s*/g," / ")}\n   ${q.type==="choice"?(state.answers[q.id]===q.answer?"✓ 正确":"✗ 答错"):(state.grades[q.id]==="correct"?"✓ 已核对正确":state.grades[q.id]==="review"?"✗ 需要复习":"○ 尚未核对")}`)
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
  const actions={submit:submitLesson,copy:copySummary,reset:resetLesson};
  if (actions[button.dataset.action]) actions[button.dataset.action]();
});
window.addEventListener("hashchange",showRoute);
loadCatalogue().then(showRoute).catch(err=>showError(err.message));
