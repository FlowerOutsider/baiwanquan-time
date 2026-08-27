import { api } from './src/api-client.js';
import { connectFloatingTimer } from './src/floating-timer.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const desktopBridge = window.baiwanquanDesktop;
const isFloatingWindow = new URLSearchParams(window.location.search).has('floating');
const escapeText = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
if (isFloatingWindow) document.documentElement.classList.add('desktop-floating');
let backendReady = false;
let backendProjectsById = new Map();

$$('[data-window-control]').forEach((button) => {
  button.addEventListener('click', () => desktopBridge?.windowControl(button.dataset.windowControl));
});

const persistProjectCreation = async (row, parentId = null) => {
  if (!backendReady) return;
  const label = row.querySelector('.tree-row');
  try {
    const { project } = await api.createProject({ name: label.dataset.projectName, parentId });
    row.dataset.projectId = project.id;
    label.dataset.projectId = project.id;
    backendProjectsById.set(project.id, project);
  } catch (error) {
    row.remove();
    window.alert(`项目未保存：${error.message}`);
  }
};

// 全局统计：将原“时间线”升级为统一的统计入口；项目内不再重复承载统计页面。
const globalStatsNav = $('[data-view="timeline"]');
const globalStatsView = $('#timelineView');
globalStatsNav.dataset.view = 'stats';
globalStatsNav.title = '统计';
globalStatsView.id = 'statsView';
globalStatsView.classList.add('global-stats-view');
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const statsDefaultEnd = new Date();
const statsDefaultStart = new Date(statsDefaultEnd);
statsDefaultStart.setMonth(statsDefaultStart.getMonth() - 1);
const statsFilter = (prefix) => `<div class="stats-filter-row"><div class="range-filter interactive-range" id="${prefix}Range" style="--start:0%;--end:100%"><div class="stats-filter-top"><div class="date-inputs"><input id="${prefix}Start" type="date" value="${isoDate(statsDefaultStart)}" /><span>—</span><input id="${prefix}End" type="date" value="${isoDate(statsDefaultEnd)}" /></div><div class="global-stats-filters"><label>项目<select id="${prefix}Project"><option value="all">全部项目</option><option value="desktop">百万拳桌面软件</option><option value="interface">└ 界面设计</option><option value="research">　└ 需求梳理</option><option value="interaction">　└ 交互设计</option><option value="english">英语学习</option></select></label></div></div><div class="range-track"><b></b><i class="start-handle" data-bound="start"></i><i class="end-handle" data-bound="end"></i></div><div class="range-boundaries"><span>${isoDate(statsDefaultStart).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')}</span><span>${isoDate(statsDefaultEnd).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')}</span></div></div></div>`;
globalStatsView.innerHTML = `
  <div class="page-heading global-stats-heading"><h1>统计</h1><nav class="stats-tabs" aria-label="统计视图"><button class="active" data-stats-tab="distribution">时间分布</button><button data-stats-tab="duration">每日时长</button><button data-stats-tab="heat">活动热力图</button></nav></div>
  <section class="global-stats-panel active" data-stats-panel="distribution">${statsFilter('distribution')}<div class="global-stats-module"><h2>时间分布</h2><div class="global-timeline" id="globalTimeline"><div data-project="interface" data-date="2026-07-02"><time>7月2日</time><span class="global-bar w40" title="百万拳桌面软件 / 界面设计&#10;09:10–10:25 · 1小时15分"></span></div><div data-project="english" data-date="2026-07-06"><time>7月6日</time><span class="global-bar w65" title="英语学习 / 听力练习&#10;14:00–15:27 · 1小时27分"></span></div><div data-project="interaction" data-date="2026-07-15"><time>7月15日</time><span class="global-bar w88" title="百万拳桌面软件 / 界面设计 / 交互设计&#10;09:10–11:45 · 2小时35分"></span></div></div></div></section>
  <section class="global-stats-panel" data-stats-panel="duration">${statsFilter('duration')}<div class="global-stats-module chart-section"><h2>每日时长（小时）</h2><div class="proportional-bars" id="durationBars"></div><div class="proportional-axis" id="durationAxis"></div><p class="chart-rule">横轴按自然日等距排列；标注起止日、每周一与跨月首日。</p></div></section>
  <section class="global-stats-panel" data-stats-panel="heat">${statsFilter('heat')}<div class="global-stats-module heat-section"><h2>活动热力图</h2><div class="heatmap global-heatmap" id="globalHeatmap"></div><p class="heatmap-note">每个月独立按周排列：列为周一至周日，格子代表筛选范围内的一天。</p></div></section>`;
const projectStatsTab = $('[data-project-tab="stats"]');
if (projectStatsTab) projectStatsTab.hidden = true;
const projectStatsPanel = $('#projectStats');
if (projectStatsPanel) projectStatsPanel.hidden = true;
$$('[data-stats-tab]').forEach((tab) => tab.addEventListener('click', () => {
  $$('[data-stats-tab]').forEach((item) => item.classList.toggle('active', item === tab));
  $$('[data-stats-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.statsPanel === tab.dataset.statsTab));
}));

$$('.rail-button').forEach((button) => {
  button.addEventListener('click', () => {
    const shell = $('#appShell');
    // 每次切换主栏目都丢弃目录的临时拖拽状态，避免覆盖层或零宽目录
    // 在返回项目页后留下空白内容区。
    restoreProjectRail();
    $$('.rail-button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $$('.view').forEach((view) => view.classList.remove('active'));
    $(`#${button.dataset.view}View`).classList.add('active');
    shell.classList.toggle('projects-active', button.dataset.view === 'projects');
    if (button.dataset.view !== 'timer') {
      countdownSetup.hidden = true;
      $('#timerView').classList.remove('countdown-choosing');
      $('#timerDigits').hidden = false;
      $('.timer-actions').hidden = false;
      $('.timer-actions').style.removeProperty('display');
    } else if (timerMode === '倒计时' && !countdownConfigured) openCountdownSetup();
  });
});

const newProjectMenu = $('#newProjectMenu');
const projectNameLabel = document.createElement('label');
projectNameLabel.textContent = '项目名称';
const projectNameInput = document.createElement('input');
projectNameInput.id = 'newProjectName';
projectNameInput.type = 'text';
projectNameInput.maxLength = 32;
projectNameInput.placeholder = '请输入项目名称';
projectNameInput.autocomplete = 'off';
projectNameLabel.append(projectNameInput);
const cancelProjectButton = document.createElement('button');
cancelProjectButton.id = 'cancelProjectCreate';
cancelProjectButton.type = 'button';
cancelProjectButton.textContent = '取消';
newProjectMenu.insertBefore(projectNameLabel, $('#createProjectConfirm'));
newProjectMenu.append(cancelProjectButton);

const closeNewProjectMenu = () => {
  newProjectMenu.hidden = true;
  projectNameInput.value = '';
};

const projectPathTree = () => {
  const childrenByParent = new Map();
  [...backendProjectsById.values()].filter((project) => project.status !== 'archived').forEach((project) => {
    const parent = project.parentId ?? 'root';
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(project);
  });
  const build = (parentId, parentPath = '', depth = 1) => (childrenByParent.get(parentId) ?? [])
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
    .map((project) => {
      const path = parentPath ? `${parentPath} / ${project.name}` : project.name;
      return { id: project.id, label: project.name, path, createDepth: depth + 1, children: build(project.id, path, depth + 1) };
    });
  return build('root');
};
const pathChooser = document.createElement('div');
pathChooser.id = 'pathChooser';
pathChooser.className = 'path-chooser';
pathChooser.hidden = true;
document.body.append(pathChooser);
const confirmLayer = document.createElement('section');
confirmLayer.className = 'app-confirm';
confirmLayer.hidden = true;
confirmLayer.innerHTML = '<div class="app-confirm-card" role="dialog" aria-modal="true"><h2></h2><p></p><footer><button type="button" data-confirm-cancel>取消</button><button type="button" data-confirm-ok>确认</button></footer></div>';
document.body.append(confirmLayer);
const askForConfirmation = (title, message, confirmText = '确认') => new Promise((resolve) => {
  confirmLayer.querySelector('h2').textContent = title;
  confirmLayer.querySelector('p').textContent = message;
  confirmLayer.querySelector('[data-confirm-ok]').textContent = confirmText;
  confirmLayer.hidden = false;
  const finish = (accepted) => {
    confirmLayer.hidden = true;
    confirmLayer.querySelector('[data-confirm-cancel]').onclick = null;
    confirmLayer.querySelector('[data-confirm-ok]').onclick = null;
    resolve(accepted);
  };
  confirmLayer.querySelector('[data-confirm-cancel]').onclick = () => finish(false);
  confirmLayer.querySelector('[data-confirm-ok]').onclick = () => finish(true);
});
let pathChooserSelect = null;
let pathChooserAllowUnassigned = true;
const expandedChooserPaths = new Set();
const renderPathChooser = () => {
  const renderNodes = (nodes, level = 0) => nodes.map((node) => `<div class="path-chooser-row" style="--level:${level}"><button type="button" class="path-choice" data-path="${escapeText(node.path)}" data-depth="${node.createDepth}" data-project-id="${node.id}">${escapeText(node.label)}</button>${node.children.length ? `<button type="button" class="path-drill" data-drill="${escapeText(node.path)}" aria-label="展开 ${escapeText(node.label)}">›</button>` : '<span></span>'}</div>${expandedChooserPaths.has(node.path) ? renderNodes(node.children, level + 1) : ''}`).join('');
  pathChooser.innerHTML = `${pathChooserAllowUnassigned ? '<button type="button" class="path-choice path-unassigned" data-path="" data-depth="1" data-project-id="">待分配时间段</button>' : ''}<button type="button" class="path-new" data-new="1">＋ 新建项目</button>${renderNodes(projectPathTree())}`;
};
const openPathChooser = (anchor, onSelect, options = {}) => {
  pathChooserSelect = onSelect;
  pathChooserAllowUnassigned = options.allowUnassigned !== false;
  expandedChooserPaths.clear();
  renderPathChooser();
  const rect = anchor.getBoundingClientRect();
  pathChooser.style.left = `${Math.min(rect.left, window.innerWidth - 290)}px`;
  pathChooser.style.top = `${Math.min(rect.bottom + 7, window.innerHeight - 300)}px`;
  pathChooser.hidden = false;
};
pathChooser.addEventListener('click', (event) => {
  const drill = event.target.closest('[data-drill]');
  if (drill) { expandedChooserPaths.add(drill.dataset.drill); renderPathChooser(); return; }
  const choice = event.target.closest('.path-choice');
  if (choice && pathChooserSelect) {
    pathChooserSelect(choice.dataset.path, Number(choice.dataset.depth), choice.dataset.projectId || null);
    pathChooser.hidden = true;
    return;
  }
  if (event.target.closest('[data-new]')) {
    pathChooser.hidden = true;
    newProjectMenu.hidden = false;
    projectNameInput.focus();
  }
});
$('#taskPicker').addEventListener('click', () => {
  $('#taskMenu').hidden = true;
  openPathChooser($('#taskPicker'), (path) => { $('#taskPicker').textContent = path || '待分配时间段'; });
});
$('#newProjectParentPicker').addEventListener('click', () => openPathChooser($('#newProjectParentPicker'), (path, depth, projectId) => {
  $('#newProjectParent').value = depth || 1;
  $('#newProjectParentPicker').dataset.projectId = projectId || '';
  $('#newProjectParentPicker').textContent = `⌄　${path || '顶层项目'}`;
}, { allowUnassigned: false }));
$('#createProjectConfirm').addEventListener('click', () => {
  const name = projectNameInput.value.trim();
  if (!name) {
    projectNameInput.focus();
    return;
  }
  const depth = Number($('#newProjectParent').value);
  const pending = document.querySelector('.tree-row.pending');
  const row = makeProjectRow(depth, name);
  pending.insertAdjacentElement('beforebegin', row);
  const parentId = depth > 1 ? ($('#newProjectParentPicker').dataset.projectId || null) : null;
  persistProjectCreation(row, parentId);
  const taskOption = document.createElement('button');
  taskOption.dataset.task = name;
  taskOption.textContent = name;
  taskOption.addEventListener('click', () => {
    $('#taskPicker').textContent = name;
    $('#taskMenu').hidden = true;
  });
  $('#taskMenu').insertBefore(taskOption, $('#taskMenu button[data-task="new"]'));
  $('#taskPicker').textContent = name;
  closeNewProjectMenu();
});
cancelProjectButton.addEventListener('click', closeNewProjectMenu);
document.addEventListener('pointerdown', (event) => {
  if (!newProjectMenu.hidden && !newProjectMenu.contains(event.target) && event.target !== $('#taskPicker')) closeNewProjectMenu();
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !newProjectMenu.hidden) closeNewProjectMenu();
});
$('#modePicker').addEventListener('click', (event) => {
  event.stopPropagation();
  $('#modeMenu').hidden = !$('#modeMenu').hidden;
});
$$('#modeMenu button').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  timerMode = button.dataset.mode;
  $('#modePicker').textContent = `${timerMode}　⌄`;
  $('#modeMenu').hidden = true;
  if (timerMode === '倒计时') openCountdownSetup();
  else {
    clearInterval(countdownInterval);
    setRunning(false);
    $('#timerView').classList.remove('countdown-choosing');
    $('#timerDigits').hidden = false;
    $('.timer-actions').hidden = false;
    $('.timer-actions').style.removeProperty('display');
    countdownSetup.hidden = true;
    renderTimer();
  }
}));

$$('[data-project-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    $('#unassignedDetail').hidden = true;
    document.querySelector('.project-header').hidden = false;
    $$('[data-project-tab]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $$('.project-panel').forEach((panel) => panel.classList.remove('active'));
    $(`#project${button.dataset.projectTab[0].toUpperCase()}${button.dataset.projectTab.slice(1)}`).classList.add('active');
    if (button.dataset.projectTab === 'segments') void loadProjectSessions();
  });
});

let timerMode = '秒表';
let countdownSeconds = 5 * 60;
let countdownInitialSeconds = 5 * 60;
let countdownConfigured = false;
let countdownInterval = null;
let stopwatchSeconds = 0;
let stopwatchInterval = null;
let activeEntryStartedAt = new Date().toISOString();
let pendingTimeSlices = [];
let timerPersistenceTimer = null;
const formatTimer = (total) => {
  const safe = Math.max(0, Math.floor(total));
  return `${String(Math.floor(safe / 3600)).padStart(2, '0')}:${String(Math.floor((safe % 3600) / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};
const renderTimer = () => {
  const value = timerMode === '倒计时' ? formatTimer(countdownSeconds) : formatTimer(stopwatchSeconds);
  $('#timerDigits').textContent = value;
  $('.focus-digits').textContent = value;
  $('#floatDigits').innerHTML = `<i class="time-part time-hour">${value.slice(0, 3)}</i><i class="time-part time-minute">${value.slice(3, 6)}</i><i class="time-part time-second">${value.slice(6)}</i>`;
  if (!isFloatingWindow) desktopBridge?.publishTimer({ value, running });
};
// 计时状态属于本地业务数据而非视觉状态：仅在状态变化时写入，避免每秒触发数据库写入。
const queueTimerPersistence = () => {
  if (!backendReady) return;
  window.clearTimeout(timerPersistenceTimer);
  timerPersistenceTimer = window.setTimeout(() => {
    api.saveTimer({
      mode: timerMode === '倒计时' ? 'countdown' : 'stopwatch',
      state: running ? 'running' : 'paused',
      projectId: selectedProjectId(),
      startedAt: activeEntryStartedAt,
      elapsedSeconds: timerMode === '倒计时' ? Math.max(0, countdownInitialSeconds - countdownSeconds) : stopwatchSeconds,
      plannedSeconds: timerMode === '倒计时' ? countdownInitialSeconds : null,
      note: $('#timerNote').value.trim(),
    }).catch(() => { /* 服务暂不可用时保留内存状态，下一次操作会重试。 */ });
  }, 180);
};
const syncTimerInputs = () => {
  const [hours, minutes, seconds] = formatTimer(timerMode === '倒计时' ? countdownSeconds : stopwatchSeconds).split(':');
  ['#trimEditor', '#focusTrimEditor', '#floatEditor'].forEach((selector) => {
    const inputs = $$(`${selector} input`);
    if (inputs.length === 3) [inputs[0].value, inputs[1].value, inputs[2].value] = [hours, minutes, seconds];
  });
};
const finishCountdown = () => {
  setRunning(false);
  // 倒计时自然归零即视为一次完成的专注：封口并保存该时间段，再复位到设定时长。
  // saveCurrentTimeEntry 内部会清空本次切片；无切片时是安全的空操作。
  void saveCurrentTimeEntry();
  $('#countdownFinished').hidden = false;
  renderTimer();
  queueTimerPersistence();
};
const tickCountdown = () => {
  if (timerMode !== '倒计时' || !running) return;
  countdownSeconds -= 1;
  if (countdownSeconds <= 0) {
    countdownSeconds = 0;
    finishCountdown();
    return;
  }
  renderTimer();
};
const beginCountdown = () => {
  clearInterval(countdownInterval);
  countdownInterval = window.setInterval(tickCountdown, 1000);
};
const beginStopwatch = () => {
  clearInterval(stopwatchInterval);
  stopwatchInterval = window.setInterval(() => {
    if (!running || timerMode !== '秒表') return;
    stopwatchSeconds += 1;
    renderTimer();
  }, 1000);
};
let running = false;
// 开始与暂停永远使用同一张原始圆形底图；播放态只由同一位置的中心符号覆盖。
const setRunning = (next) => {
  const wasRunning = running;
  if (wasRunning && !next && activeEntryStartedAt) {
    pendingTimeSlices.push({ startedAt: activeEntryStartedAt, endedAt: new Date().toISOString() });
    activeEntryStartedAt = null;
  }
  if (!wasRunning && next) activeEntryStartedAt = new Date().toISOString();
  running = next;
  $('#startButton').title = running ? '暂停' : '开始';
  $('#focusStartButton').title = running ? '暂停' : '开始';
  ['#startButton', '#focusStartButton'].forEach((selector) => {
    const button = $(selector);
    if (!button) return;
    button.classList.toggle('is-ready', !running);
    const image = button.querySelector('img');
    if (image) image.src = 'assets/pause.png?v=1';
  });
  $('#floatWidget').classList.toggle('is-paused', !running);
  if (timerMode === '倒计时') {
    if (running && countdownSeconds > 0) beginCountdown();
    else clearInterval(countdownInterval);
  } else if (running) {
    beginStopwatch();
  } else {
    clearInterval(stopwatchInterval);
  }
  queueTimerPersistence();
};

const selectedProjectId = () => {
  const label = $('#taskPicker').textContent.trim();
  if (!label || label === '待分配时间段') return null;
  const name = label.split('/').at(-1).trim();
  return [...$$('.tree-project-row .tree-row')].find((item) => item.dataset.projectName === name)?.dataset.projectId ?? null;
};

const saveCurrentTimeEntry = async () => {
  // 保存是一次计时段的终点：先停止以精确封口当前区间，再写入并清零等待下一段。
  if (running) setRunning(false);
  const slices = [...pendingTimeSlices];
  if (!slices.length) return;
  const resetSavedTimer = () => {
    pendingTimeSlices = [];
    activeEntryStartedAt = null;
    if (timerMode === '倒计时') countdownSeconds = countdownInitialSeconds;
    else stopwatchSeconds = 0;
    renderTimer();
    queueTimerPersistence();
  };
  if (!backendReady) {
    resetSavedTimer();
    return;
  }
  const note = $('#timerNote').value.trim();
  try {
    await Promise.all(slices.map((slice) => api.createEntry({
      projectId: selectedProjectId(),
      startedAt: slice.startedAt,
      endedAt: slice.endedAt,
      mode: timerMode === '倒计时' ? 'countdown' : 'stopwatch',
      plannedSeconds: timerMode === '倒计时' ? Math.max(1, countdownInitialSeconds) : null,
      note,
    }))); 
    resetSavedTimer();
    // 新建时间段后，今天、待分配目录、统计和当前项目主页均从同一 SQLite 数据源重算。
    void refreshTimeEntryViews();
  } catch (error) {
    window.alert(`时间段未保存：${error.message}`);
  }
};
$('#startButton').addEventListener('click', (event) => {
  setRunning(!running);
});

const toggleTimeEditor = (editor) => {
  if (editor.hidden) { setRunning(false); syncTimerInputs(); editor.hidden = false; return; }
  updateCountdownFromEditor(editor);
  editor.hidden = true;
};
$('#trimButton').addEventListener('click', () => toggleTimeEditor($('#trimEditor')));

$('#timerNoteButton').addEventListener('click', (event) => {
  event.stopPropagation();
  const panel = $('#timerNotePanel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) $('#timerNote').focus();
});
document.addEventListener('pointerdown', (event) => {
  const panel = $('#timerNotePanel');
  if (!panel.hidden && !panel.contains(event.target) && event.target !== $('#timerNoteButton')) panel.hidden = true;
}, true);

// 保存生成真实时间段；作废只丢弃当前未保存区间，不删除任何历史数据。
const discardCurrentTimeSlice = () => {
  pendingTimeSlices = [];
  activeEntryStartedAt = running ? new Date().toISOString() : null;
  if (timerMode === '倒计时') { countdownSeconds = countdownInitialSeconds; renderTimer(); }
  else { stopwatchSeconds = 0; renderTimer(); }
  queueTimerPersistence();
};
const captureCurrentTimeSlice = async () => {
  await saveCurrentTimeEntry();
  queueTimerPersistence();
};
$('#discardButton').addEventListener('click', discardCurrentTimeSlice);
$('#saveButton').addEventListener('click', () => { void saveCurrentTimeEntry(); });

// 专注态的视觉层与原生全屏必须成对进出。保存/作废也走同一出口，
// 避免 overlay 虽然隐藏但窗口仍停留在 kiosk 状态。
const enterFocus = () => {
  if (!countdownSetup.hidden) return;
  $('#focusOverlay').hidden = false;
};
const leaveFocus = () => {
  $('#focusOverlay').hidden = true;
  desktopBridge?.setFullscreen(false);
};
$('#focusButton').addEventListener('click', enterFocus);
$('#leaveFocus').addEventListener('click', leaveFocus);
$('#floatButton').addEventListener('click', () => {
  if (desktopBridge) desktopBridge.toggleFloat();
  else $('#floatWidget').hidden = !$('#floatWidget').hidden;
});

$('#focusTrimButton').addEventListener('click', () => toggleTimeEditor($('#focusTrimEditor')));
$('#focusStartButton').addEventListener('click', () => setRunning(!running));
// 专注态内的保存、废弃只结算当前时间段；专注态本身由右上角退出键显式结束。
$('#focusSaveButton').addEventListener('click', () => { void saveCurrentTimeEntry(); });
$('#focusDiscardButton').addEventListener('click', () => { discardCurrentTimeSlice(); });

const revealFocusControls = () => {
  const controls = $('.focus-controls');
  controls.classList.remove('is-hidden');
};
$('#focusOverlay').addEventListener('mousemove', revealFocusControls);
$('#focusOverlay').addEventListener('mouseenter', revealFocusControls);
$('#focusOverlay').addEventListener('dblclick', (event) => {
  // 专注态任意空白或数字区域均可双击进入原生全屏；四个操作按钮本身不触发。
  if (!event.target.closest('.focus-controls, .leave-focus, .focus-trim-editor')) desktopBridge?.setFullscreen(true);
});
// 专注态的时间只是读数。阻止浏览器在双击进入全屏前抢走文本选择。
$('#focusOverlay').addEventListener('mousedown', (event) => {
  if (!event.target.closest('.focus-controls, .leave-focus, .focus-trim-editor')) event.preventDefault();
});
let focusLastTap = 0;
document.addEventListener('pointerup', (event) => {
  if ($('#focusOverlay').hidden || event.target.closest('.focus-controls, .leave-focus, .focus-trim-editor')) return;
  const now = performance.now();
  if (now - focusLastTap < 360) desktopBridge?.setFullscreen(true);
  focusLastTap = now;
}, true);
$('#focusButton').addEventListener('click', revealFocusControls);

const countdownSetup = document.createElement('section');
countdownSetup.id = 'countdownSetup';
countdownSetup.className = 'countdown-setup';
countdownSetup.hidden = true;
countdownSetup.innerHTML = `<div class="countdown-setup-card" role="dialog" aria-modal="true" aria-label="选择倒计时"><p>选择倒计时时长</p><div class="countdown-presets"><button data-seconds="60">00:01:00</button><button data-seconds="300">00:05:00</button><button data-seconds="600">00:10:00</button><button data-seconds="1800">00:30:00</button><button data-seconds="3600">01:00:00</button><button data-custom="true">自定义</button></div></div>`;
document.body.append(countdownSetup);
const openCountdownSetup = () => {
  setRunning(false);
  $('#timerView').classList.add('countdown-choosing');
  $('#timerDigits').hidden = true;
  $('.timer-actions').hidden = true;
  $('.timer-actions').style.setProperty('display', 'none', 'important');
  countdownSetup.hidden = false;
};
const applyCountdown = (seconds, showEditor = false) => {
  countdownSeconds = Math.max(1, seconds);
  countdownInitialSeconds = countdownSeconds;
  countdownConfigured = true;
  setRunning(false);
  countdownSetup.hidden = true;
  $('#timerView').classList.remove('countdown-choosing');
  $('#timerDigits').hidden = false;
  $('.timer-actions').hidden = false;
  $('.timer-actions').style.removeProperty('display');
  syncTimerInputs();
  renderTimer();
  $('#trimEditor').hidden = !showEditor;
  queueTimerPersistence();
};
countdownSetup.addEventListener('click', (event) => {
  const choice = event.target.closest('button');
  if (!choice) return;
  if (choice.dataset.custom) {
    applyCountdown(countdownSeconds, true);
    return;
  }
  applyCountdown(Number(choice.dataset.seconds));
});
const updateCountdownFromEditor = (editor) => {
  const values = [...editor.querySelectorAll('input')].map((input, index) => Math.max(0, Math.min(index === 0 ? 99 : 59, Number(input.value) || 0)));
  const total = Math.max(1, values[0] * 3600 + values[1] * 60 + values[2]);
  if (timerMode === '倒计时') { countdownSeconds = total; countdownInitialSeconds = total; countdownConfigured = true; }
  else stopwatchSeconds = total;
  renderTimer();
  syncTimerInputs();
  queueTimerPersistence();
};
const restoreTimerFromBackend = (timer) => {
  if (!timer) return;
  timerMode = timer.mode === 'countdown' ? '倒计时' : '秒表';
  $('#modePicker').textContent = `${timerMode}　⌄`;
  activeEntryStartedAt = timer.mode === 'countdown' && timer.state === 'running' ? (timer.startedAt ?? new Date().toISOString()) : null;
  if (timer.mode !== 'countdown') {
    const elapsedSinceSave = timer.state === 'running' && timer.updatedAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(timer.updatedAt)) / 1000)) : 0;
    stopwatchSeconds = Math.max(0, timer.elapsedSeconds + elapsedSinceSave);
  }
  if (timer.mode === 'countdown') {
    countdownInitialSeconds = timer.plannedSeconds ?? countdownInitialSeconds;
    const elapsedSinceSave = timer.state === 'running' && timer.updatedAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(timer.updatedAt)) / 1000))
      : 0;
    const elapsed = Math.min(countdownInitialSeconds, Math.max(0, timer.elapsedSeconds + elapsedSinceSave));
    countdownSeconds = Math.max(0, countdownInitialSeconds - elapsed);
    countdownConfigured = true;
    countdownSetup.hidden = true;
    $('#timerView').classList.remove('countdown-choosing');
    $('#timerDigits').hidden = false;
    $('.timer-actions').hidden = false;
    $('.timer-actions').style.removeProperty('display');
    syncTimerInputs();
  }
  setRunning(timer.mode === 'countdown' && timer.state === 'running' && countdownSeconds > 0);
  renderTimer();
};
// 只有第二次点击“截取”才应用修改；点击任意其他位置只取消编辑，不改变读数。
document.addEventListener('pointerdown', (event) => {
  [['#trimEditor', '#trimButton'], ['#focusTrimEditor', '#focusTrimButton'], ['#floatEditor', '#floatTrimButton']].forEach(([editorSelector, buttonSelector]) => {
    const editor = $(editorSelector);
    if (!editor.hidden && !editor.contains(event.target) && !event.target.closest(buttonSelector)) {
      editor.hidden = true;
      if (editorSelector === '#floatEditor') {
        $('#floatDigits').hidden = false;
        $('#floatTrimButton').classList.remove('is-active');
      }
    }
  });
}, true);
const countdownFinished = document.createElement('section');
countdownFinished.id = 'countdownFinished';
countdownFinished.className = 'countdown-finished';
countdownFinished.hidden = true;
countdownFinished.innerHTML = '<div role="alertdialog" aria-modal="true"><strong>倒计时结束</strong><p>本次专注时间已完成。</p><button type="button">知道了</button></div>';
document.body.append(countdownFinished);
countdownFinished.querySelector('button').addEventListener('click', () => { countdownFinished.hidden = true; });
renderTimer();

const projectDurationLabel = (seconds) => {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分`;
};
const projectCreatedLabel = (createdAt) => {
  const date = new Date(createdAt);
  return `开始于 ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};
const projectPathLabel = (project) => {
  if (!project) return '待分配时间段';
  const names = [];
  const visited = new Set();
  let current = project;
  while (current && !visited.has(current.id)) {
    names.unshift(current.name);
    visited.add(current.id);
    current = current.parentId ? backendProjectsById.get(current.parentId) : null;
  }
  return names.join(' / ');
};
const renderProjectHome = async (project) => {
  if (!project) return;
  const title = $('#projectTitle');
  const description = $('.project-description [contenteditable="true"]');
  const meta = $('.project-meta');
  const total = $('.project-overview strong');
  const bars = $('.weekly-bars .bars');
  const labels = $('.weekly-bars .bar-labels');
  title.textContent = project.name;
  description.textContent = project.description || '';
  const path = projectPathLabel(project);
  meta.innerHTML = `<span class="meta-item meta-calendar">${projectCreatedLabel(project.createdAt)}</span><span class="meta-item meta-clock">0 个时间段</span><span class="meta-item meta-path" title="${escapeText(path)}">${escapeText(path)}</span>`;
  total.textContent = '0小时0分';
  bars.innerHTML = '';
  labels.innerHTML = '';
  if (!backendReady) return;
  try {
    const { statistics } = await api.statistics({ projectId: project.id, includeDescendants: true });
    if ($('.tree-row.active')?.dataset.projectId !== project.id) return;
    total.textContent = projectDurationLabel(statistics.totalSeconds);
    meta.innerHTML = `<span class="meta-item meta-calendar">${projectCreatedLabel(project.createdAt)}</span><span class="meta-item meta-clock">${statistics.entries.length} 个时间段</span><span class="meta-item meta-path" title="${escapeText(path)}">${escapeText(path)}</span>`;
    const daily = new Map(statistics.daily.map((item) => [item.date, item.seconds]));
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
      return date;
    });
    const max = Math.max(...daily.values(), 1);
    bars.innerHTML = dates.map((date) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return `<i style="--h:${Math.round(((daily.get(key) || 0) / max) * 100)}%"></i>`;
    }).join('');
    labels.innerHTML = dates.map((date) => `<span>${date.getMonth() + 1}/${date.getDate()}</span>`).join('');
  } catch { /* 详情页保持真实的空状态，不回退为演示数据。 */ }
};

const openProject = (button) => {
  restoreProjectRail();
  $$('.tree-project-row .tree-row').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  document.querySelector('.project-header h1').textContent = button.dataset.projectName;
  activeProjectName = button.dataset.projectName;
  const persistedProject = backendProjectsById.get(button.dataset.projectId);
  void renderProjectHome(persistedProject);
  const isArchived = button.closest('.tree-project-row')?.dataset.archived === 'true';
  $('#archiveProject').textContent = isArchived ? '▣ 已归档 · 点击恢复' : '▢ 归档';
  document.querySelector('.project-header').hidden = false;
  $('#unassignedDetail').hidden = true;
  // 每次从目录进入项目都明确回到主页，避免上一页的隐藏状态遗留为空白页。
  $$('[data-project-tab]').forEach((item) => item.classList.toggle('active', item.dataset.projectTab === 'home'));
  $$('.project-panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'projectHome'));
  document.querySelector('[data-view="projects"]').click();
  void loadProjectSessions(persistedProject);
};

const projectStart = new Date('2026-07-15T00:00:00');
const projectEnd = new Date('2026-07-18T00:00:00');
const updateRangePosition = () => {
  const start = new Date(`${$('#rangeStart').value}T00:00:00`);
  const end = new Date(`${$('#rangeEnd').value}T00:00:00`);
  const from = $('#rangeStart').value;
  const to = $('#rangeEnd').value;
  const available = $$('.date-choice').filter((button) => {
    const visible = button.dataset.iso >= from && button.dataset.iso <= to && hasSessionsOnDate(button.dataset.date);
    button.hidden = !visible;
    return visible;
  });
  if (available.length) {
    let selected = document.querySelector('.date-choice.selected:not([hidden])');
    if (!selected) {
      $$('.date-choice').forEach((item) => item.classList.remove('selected'));
      available[0].classList.add('selected');
      selected = available[0];
    }
    renderSessions(selected.dataset.date);
  }
  if (!available.length) {
    $$('.date-choice').forEach((item) => item.classList.remove('selected'));
    document.querySelector('.day-sessions').innerHTML = '<span class="empty-sessions">所选日期内没有时间段</span>';
    clearSegmentDetail();
  }
};

const formatISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const bindRange = (rangeId, startId, endId, min, max, onChange = () => {}) => {
  const range = $(`#${rangeId}`);
  const startInput = $(`#${startId}`);
  const endInput = $(`#${endId}`);
  const sync = () => {
    let start = new Date(`${startInput.value}T00:00:00`);
    let end = new Date(`${endInput.value}T00:00:00`);
    if (start > end) [start, end] = [end, start];
    startInput.value = formatISO(start); endInput.value = formatISO(end);
    range.classList.toggle('is-collapsed', start.getTime() === end.getTime());
    const totalDays = Math.max(1, Math.round((max - min) / 86400000));
    const positionFor = (date) => Math.max(0, Math.min(100, (Math.round((date - min) / 86400000) / totalDays) * 100));
    range.style.setProperty('--start', `${positionFor(start)}%`);
    range.style.setProperty('--end', `${positionFor(end)}%`);
    onChange();
  };
  startInput.addEventListener('change', sync);
  endInput.addEventListener('change', sync);
  // 所有时间筛选统一走这一套桌面鼠标拖动实现；同一天的双端点也不例外。
  const beginDrag = (bound, event) => {
    event.preventDefault();
    event.stopPropagation();
    const move = (pointer) => {
      const rect = range.querySelector('.range-track').getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (pointer.clientX - rect.left) / rect.width));
      // 轨道的每个刻度就是一天：先取整到日，再回写，避免视觉停在第三格而值实际落在第二格。
      const dayOffset = Math.round(ratio * Math.round((max - min) / 86400000));
      const next = new Date(min);
      next.setDate(min.getDate() + dayOffset);
      (bound === 'start' ? startInput : endInput).value = formatISO(next);
      sync();
    };
    const stop = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  };
  range.querySelectorAll('[data-bound]').forEach((handle) => handle.addEventListener('mousedown', (event) => beginDrag(handle.dataset.bound, event)));
  range.querySelector('.range-track').addEventListener('mousedown', (event) => {
    if (event.target.matches('[data-bound]') || event.target.closest('[data-bound]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const totalDays = Math.max(1, Math.round((max - min) / 86400000));
    const startRatio = Math.round((new Date(`${startInput.value}T00:00:00`) - min) / 86400000) / totalDays;
    const endRatio = Math.round((new Date(`${endInput.value}T00:00:00`) - min) / 86400000) / totalDays;
    const bound = Math.abs(startRatio - endRatio) < 0.001
      ? (ratio <= startRatio ? 'start' : 'end')
      : (Math.abs(ratio - startRatio) <= Math.abs(ratio - endRatio) ? 'start' : 'end');
    beginDrag(bound, event);
  });
  sync();
};
// 统计默认展示最近一个月，但拖动轨道仍允许回看本年度历史时间段。
const calendarStart = new Date(`${statsDefaultEnd.getFullYear()}-01-01T00:00:00`);
const calendarEnd = new Date(`${isoDate(statsDefaultEnd)}T00:00:00`);
const projectScope = {
  all: ['desktop', 'interface', 'research', 'interaction', 'english', 'unassigned'],
  desktop: ['desktop', 'interface', 'research', 'interaction'],
  interface: ['interface', 'research', 'interaction'],
  research: ['research'],
  interaction: ['interaction'],
  english: ['english'],
};
function refreshStatsPanel(prefix, target) {
  const project = $(`#${prefix}Project`).value;
  const from = $(`#${prefix}Start`).value;
  const to = $(`#${prefix}End`).value;
  $$(target).forEach((item) => {
    const matchesProject = projectScope[project].includes(item.dataset.project);
    const matchesDate = item.dataset.date >= from && item.dataset.date <= to;
    item.hidden = !matchesProject || !matchesDate;
  });
}
const refreshDistribution = () => {
  const from = $('#distributionStart').value;
  const to = $('#distributionEnd').value;
  const project = $('#distributionProject').value;
  const daily = new Map();
  statisticsEntries
    .filter((entry) => projectScope[project].includes(entry.project) && entry.date >= from && entry.date <= to)
    .forEach((entry) => {
      const current = daily.get(entry.date) ?? { date: entry.date, minutes: 0, segments: [] };
      current.minutes += entry.minutes;
      current.segments.push(entry);
      daily.set(entry.date, current);
    });
  const entries = [...daily.values()].sort((left, right) => right.date.localeCompare(left.date));
  const largest = Math.max(...entries.map((entry) => entry.minutes), 1);
  $('#globalTimeline').innerHTML = entries.map((entry) => {
    const hours = Math.floor(entry.minutes / 60);
    const minutes = entry.minutes % 60;
    const duration = `${hours ? `${hours}小时` : ''}${minutes}分`;
    const width = Math.max(8, Math.min(100, Math.round((entry.minutes / largest) * 100)));
    const details = [...entry.segments]
      .sort((left, right) => (left.startedAt ?? '').localeCompare(right.startedAt ?? ''))
      .map((segment) => `${segment.path ?? segment.label} · ${segment.start ?? '—'}–${segment.end ?? '—'} · ${projectDurationLabel(segment.minutes * 60)}`)
      .join('\n');
    return `<div data-date="${entry.date}"><time>${entry.date.slice(5).replace('-', '月')}日</time><span class="global-bar" style="width:${width}%" title="${escapeText(details)}"></span></div>`;
  }).join('') || '<p class="stats-empty">当前筛选范围没有已保存的时间段。</p>';
  updateStatsRangeLabels('distribution');
};
let statisticsEntries = [
  { date: '2026-07-02', project: 'interface', minutes: 75, label: '界面设计' },
  { date: '2026-07-06', project: 'english', minutes: 87, label: '听力练习' },
  { date: '2026-07-15', project: 'interaction', minutes: 155, label: '交互设计' },
  { date: '2026-08-03', project: 'research', minutes: 65, label: '需求梳理' },
  { date: '2026-08-18', project: 'interface', minutes: 92, label: '界面设计' },
];
const formatShortDate = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateRange = (from, to) => {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};
const updateStatsRangeLabels = (prefix) => {
  const range = $(`#${prefix}Range`);
  if (!range) return;
  const labels = [...range.querySelectorAll('.range-boundaries span')];
  const format = (value) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日');
  if (labels[0]) labels[0].textContent = format($(`#${prefix}Start`).value);
  if (labels[1]) labels[1].textContent = format($(`#${prefix}End`).value);
};
const refreshDuration = () => {
  const from = $('#durationStart').value;
  const to = $('#durationEnd').value;
  const project = $('#durationProject').value;
  const dates = dateRange(from, to);
  const daily = new Map();
  statisticsEntries
    .filter((entry) => projectScope[project].includes(entry.project) && entry.date >= from && entry.date <= to)
    .forEach((entry) => {
      const current = daily.get(entry.date) ?? { date: entry.date, minutes: 0, segments: [] };
      current.minutes += entry.minutes;
      current.segments.push(entry);
      daily.set(entry.date, current);
    });
  const entries = [...daily.values()].sort((left, right) => left.date.localeCompare(right.date));
  const max = Math.max(...entries.map((entry) => entry.minutes), 1);
  const bars = $('#durationBars');
  bars.style.setProperty('--day-step', `${100 / Math.max(1, dates.length - 1)}%`);
  bars.innerHTML = entries.map((entry) => {
    const dayIndex = dates.findIndex((date) => localDateKey(date) === entry.date);
    const at = dates.length === 1 ? 50 : (dayIndex / (dates.length - 1)) * 100;
    const details = entry.segments.map((segment) => `${entry.date.slice(5).replace('-', '月')}日 · ${segment.label} · ${projectDurationLabel(segment.minutes * 60)}`).join('\n');
    return `<i style="--at:${at}%;--h:${Math.max(8, (entry.minutes / max) * 82)}%" title="${escapeText(details)}"></i>`;
  }).join('');
  const ticks = dates.filter((date, index) => index === 0 || index === dates.length - 1 || (index % 7 === 0) || date.getDate() === 1);
  $('#durationAxis').innerHTML = ticks.map((date) => {
    const index = dates.findIndex((item) => item.getTime() === date.getTime());
    const at = dates.length === 1 ? 50 : (index / (dates.length - 1)) * 100;
    return `<span style="--at:${at}%">${formatShortDate(date)}</span>`;
  }).join('');
  updateStatsRangeLabels('duration');
};
const refreshHeat = () => {
  const from = $('#heatStart').value;
  const to = $('#heatEnd').value;
  const project = $('#heatProject').value;
  const dates = dateRange(from, to);
  const entries = new Map();
  statisticsEntries
    .filter((entry) => projectScope[project].includes(entry.project) && entry.date >= from && entry.date <= to)
    .forEach((entry) => {
      const current = entries.get(entry.date) ?? { minutes: 0, segments: [] };
      current.minutes += entry.minutes;
      current.segments.push(entry);
      entries.set(entry.date, current);
    });
  const cellsForMonth = (monthDates) => {
    const firstWeekday = (monthDates[0].getDay() + 6) % 7;
    const blanks = Array.from({ length: firstWeekday }, () => '<i class="heatmap-blank" aria-hidden="true"></i>').join('');
    const cells = monthDates.map((date, index) => {
    const key = localDateKey(date);
    const entry = entries.get(key);
    // 统计图只呈现已保存的本地时间段；空白日期必须保持空白。
    const activity = entry?.minutes ?? 0;
    const level = activity >= 120 ? 'l3' : activity >= 60 ? 'l2' : activity > 0 ? 'l1' : '';
    const label = entry ? entry.segments.map((segment) => `${segment.label} · ${projectDurationLabel(segment.minutes * 60)}`).join('\n') : '无记录';
      return `<i class="${level}" title="${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${label}"></i>`;
    }).join('');
    return `${blanks}${cells}`;
  };
  const months = dates.reduce((groups, date) => {
    const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(date);
    return groups;
  }, new Map());
  $('#globalHeatmap').innerHTML = [...months.entries()].map(([label, monthDates]) => `<section class="heatmap-month"><h3>${label}</h3><div class="heatmap-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div class="heatmap-month-grid">${cellsForMonth(monthDates)}</div></section>`).join('');
  updateStatsRangeLabels('heat');
};
const refreshBackendStatistics = async () => {
  if (!backendReady) return;
  try {
    const { statistics } = await api.statistics();
    const projectKeys = { '百万拳桌面软件': 'desktop', '界面设计': 'interface', '需求梳理': 'research', '交互设计': 'interaction', '英语学习': 'english', '听力练习': 'english' };
    statisticsEntries = statistics.entries.map((entry) => {
      const project = backendProjectsById.get(entry.projectId);
      const label = project?.name ?? '待分配时间段';
      return {
        date: localDateKey(new Date(entry.startedAt)), project: projectKeys[label] ?? 'unassigned',
        minutes: Math.max(1, Math.round(entry.durationSeconds / 60)), label,
        path: projectPathLabel(project), start: displayClock(entry.startedAt), end: displayClock(entry.endedAt), startedAt: entry.startedAt,
      };
    });
    refreshDistribution();
    refreshDuration();
    refreshHeat();
  } catch {
    // 网络瞬断或服务关闭时保留上一次的统计画面。
  }
};
// 项目时间段、项目统计、时间线严格共用同一条日历拖动轨道。
bindRange('statsRange', 'statsRangeStart', 'statsRangeEnd', calendarStart, calendarEnd);
bindRange('distributionRange', 'distributionStart', 'distributionEnd', calendarStart, calendarEnd, refreshDistribution);
bindRange('durationRange', 'durationStart', 'durationEnd', calendarStart, calendarEnd, refreshDuration);
bindRange('heatRange', 'heatStart', 'heatEnd', calendarStart, calendarEnd, refreshHeat);
$('#distributionProject').addEventListener('change', refreshDistribution);
$('#durationProject').addEventListener('change', refreshDuration);
$('#heatProject').addEventListener('change', refreshHeat);
refreshDistribution();
refreshDuration();
refreshHeat();

let activeProjectName = '界面设计';
let projectSessionEntries = [];
let selectedProjectSegmentId = null;
const minutes = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const entryDateKey = (entry) => localDateKey(new Date(entry.startedAt));
const entriesForDate = (date) => projectSessionEntries
  .filter((entry) => entryDateKey(entry) === date)
  .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
const hasSessionsOnDate = (date) => entriesForDate(date).length > 0;
const clearSegmentDetail = () => {
  $('#dayTrack').innerHTML = '';
  $('#segmentDuration').textContent = '—';
  $('#segmentLength').textContent = '—';
  $('#segmentStart').textContent = '—';
  $('#segmentEnd').textContent = '—';
  $('#assignedProjectPicker').textContent = '未选择时间段';
  $('.segment-detail').classList.add('is-empty');
};
const renderProjectDayTrack = (entries, selectedEntryId) => {
  const track = $('#dayTrack');
  track.innerHTML = entries.map((entry) => {
    const start = displayClock(entry.startedAt); const end = displayClock(entry.endedAt);
    const left = (minutes(start) / 1440) * 100;
    const right = (minutes(end) / 1440) * 100;
    const selected = entry.id === selectedEntryId ? ' selected' : '';
    const label = durationText(entry.durationSeconds);
    return `<button type="button" class="project-day-session${selected}" data-entry-id="${entry.id}" style="--start:${left}%;--end:${right}%" title="${start} – ${end} · ${label}" aria-label="${start} – ${end} · ${label}"></button>`;
  }).join('');
};
const setSegment = (entryId) => {
  const selectedDate = document.querySelector('.date-choice.selected');
  if (!selectedDate) return;
  const entry = projectSessionEntries.find((item) => item.id === entryId);
  if (!entry) return;
  selectedProjectSegmentId = entry.id;
  renderProjectDayTrack(entriesForDate(selectedDate.dataset.date), entry.id);
  const start = displayClock(entry.startedAt); const end = displayClock(entry.endedAt);
  const label = durationText(entry.durationSeconds);
  $('#segmentDuration').textContent = label;
  $('#segmentLength').textContent = label;
  $('#segmentStart').textContent = new Date(entry.startedAt).toLocaleString('zh-CN', { hour12: false });
  $('#segmentEnd').textContent = new Date(entry.endedAt).toLocaleString('zh-CN', { hour12: false });
  $('#assignedProjectPicker').textContent = backendProjectsById.get(entry.projectId)?.name ?? '待分配时间段';
  $('.segment-detail .detail-note').textContent = entry.note || '';
  $('.segment-detail .detail-note').dataset.entryId = entry.id;
  $('.segment-detail').classList.remove('is-empty');
};
const renderSessions = (date) => {
  const host = document.querySelector('.day-sessions');
  const entries = entriesForDate(date);
  if (!entries.length) { host.innerHTML = '<span class="empty-sessions">所选日期内没有时间段</span>'; clearSegmentDetail(); return; }
  host.innerHTML = entries.map((entry, index) => `<button class="time-choice${index === 0 ? ' selected' : ''}" data-entry-id="${entry.id}">${displayClock(entry.startedAt)} – ${displayClock(entry.endedAt)}</button>`).join('');
  const first = entries[0];
  setSegment(first.id);
};
const projectDateLabel = (iso) => {
  const date = new Date(`${iso}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日（${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}）`;
};
const loadProjectSessions = async (project = backendProjectsById.get($('.tree-row.active')?.dataset.projectId)) => {
  if (!backendReady || !project?.id) return;
  try {
    const { statistics } = await api.statistics({ projectId: project.id, includeDescendants: true });
    if ($('.tree-row.active')?.dataset.projectId !== project.id) return;
    projectSessionEntries = [...statistics.entries].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    const dates = [...new Set(projectSessionEntries.map(entryDateKey))];
    document.querySelector('.date-sessions').innerHTML = dates.map((iso, index) => `<button class="date-choice${index === 0 ? ' selected' : ''}" data-iso="${iso}" data-date="${iso}">${projectDateLabel(iso)}</button>`).join('') || '<span class="empty-sessions">该项目还没有时间段</span>';
    if (!dates.length) { document.querySelector('.day-sessions').innerHTML = '<span class="empty-sessions">所选日期内没有时间段</span>'; clearSegmentDetail(); return; }
    $('#rangeStart').value = dates[0];
    $('#rangeEnd').value = dates.at(-1);
    updateRangePosition();
  } catch {
    // 保留上一次的真实数据，避免服务短暂不可用时以样例替代。
  }
};
// 时间段只有一个事实来源（SQLite）。任何归属变动后同时重算今天、统计、待分配目录及当前项目详情。
const refreshTimeEntryViews = async () => {
  await Promise.all([refreshUnassignedTree(), refreshTodayFromBackend(), refreshBackendStatistics()]);
  const activeId = $('.tree-row.active')?.dataset.projectId;
  const activeProject = backendProjectsById.get(activeId);
  if (activeProject) await Promise.all([renderProjectHome(activeProject), loadProjectSessions(activeProject)]);
};
document.querySelector('.date-sessions').addEventListener('click', (event) => {
  const button = event.target.closest('.date-choice'); if (!button) return;
  $$('.date-choice').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  button.scrollIntoView({ block: 'center', behavior: 'smooth' });
  renderSessions(button.dataset.date);
});
document.querySelector('.day-sessions').addEventListener('click', (event) => {
  const button = event.target.closest('.time-choice');
  if (!button) return;
  $$('.time-choice').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  button.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setSegment(button.dataset.entryId);
});
$('#dayTrack').addEventListener('click', (event) => {
  const button = event.target.closest('.project-day-session');
  if (!button) return;
  const matchingChoice = [...document.querySelectorAll('.time-choice')].find((item) => item.dataset.entryId === button.dataset.entryId);
  if (matchingChoice) matchingChoice.click();
});
// 在会话数据准备好后绑定筛选；无记录时会同时清空右侧详情。
bindRange('segmentRange', 'rangeStart', 'rangeEnd', calendarStart, calendarEnd, updateRangePosition);

// 今日：时间条始终以 00:00–24:00 为完整尺度；点击任一时间段同步凸显下方详情行。
const selectTodaySession = (id) => {
  $$('#todayTrack .session, .session-row').forEach((item) => item.classList.toggle('selected', (item.dataset.sessions ?? item.dataset.session).split(',').includes(id)));
};
const localDayBounds = () => {
  const current = new Date();
  const start = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  const end = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};
const displayClock = (iso) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const durationText = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return remainder ? `${hours}小时${minutes}分${remainder}秒` : `${hours}小时${minutes}分`;
};
const renderUnassignedTree = (entries) => {
  const host = $('#projectTree');
  const anchor = host.querySelector('.tree-add');
  host.querySelectorAll('.segment-node').forEach((node) => node.remove());
  entries.filter((entry) => !entry.projectId && !entry.deletedAt)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    .forEach((entry) => {
      const button = document.createElement('button');
      button.className = 'tree-row segment-node';
      button.type = 'button';
      button.draggable = true;
      button.dataset.entryId = entry.id;
      button.dataset.start = displayClock(entry.startedAt);
      button.dataset.end = displayClock(entry.endedAt);
      button.textContent = `　　${button.dataset.start} – ${button.dataset.end}`;
      anchor.before(button);
    });
};
const refreshUnassignedTree = async () => {
  if (!backendReady) return;
  try { renderUnassignedTree((await api.listEntries()).entries); } catch { /* 保留现有目录 */ }
};
const refreshTodayFromBackend = async () => {
  if (!backendReady) return;
  try {
    const bounds = localDayBounds();
    const { entries } = await api.statistics({ from: bounds.start, to: bounds.end }).then(({ statistics }) => statistics);
    if (!entries.length) {
      const heading = $('#todayView .page-heading p');
      if (heading) heading.textContent = '0小时0分 · 0 个时间段';
      $('#timerView .today-strip span').textContent = '今天　0小时0分';
      $('#todayTrack').innerHTML = '';
      $('.session-list').innerHTML = '<p class="empty-sessions">今天还没有已保存的时间段</p>';
      return;
    }
    const ordered = [...entries].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    const total = ordered.reduce((sum, entry) => sum + entry.durationSeconds, 0);
    const heading = $('#todayView .page-heading p');
    if (heading) heading.textContent = `${durationText(total)} · ${ordered.length} 个时间段`;
    $('#timerView .today-strip span').textContent = `今天　${durationText(total)}`;
    const grouped = ordered.reduce((groups, entry) => {
      const previous = groups.at(-1);
      // 相邻两分钟内的极短记录共用一个可辨识时间块；详情完整保留在悬停信息与下方列表。
      if (previous && Date.parse(entry.startedAt) - Date.parse(previous.entries.at(-1).endedAt) <= 120_000) {
        previous.entries.push(entry);
        return groups;
      }
      groups.push({ entries: [entry] });
      return groups;
    }, []);
    $('#todayTrack').innerHTML = grouped.map((group, index) => {
      const first = group.entries[0]; const last = group.entries.at(-1);
      const start = new Date(first.startedAt); const end = new Date(last.endedAt);
      const startPercent = ((start.getHours() * 60 + start.getMinutes()) / 1440) * 100;
      const endPercent = ((end.getHours() * 60 + end.getMinutes()) / 1440) * 100;
      const details = group.entries.map((entry) => `${backendProjectsById.get(entry.projectId)?.name ?? '待分配时间段'} · ${displayClock(entry.startedAt)}–${displayClock(entry.endedAt)} · ${durationText(entry.durationSeconds)}`).join('\n');
      return `<button class="session${index === 0 ? ' selected' : ''}" data-sessions="${group.entries.map((entry) => entry.id).join(',')}" style="--start:${startPercent}%;--end:${endPercent}%" title="${escapeText(details)}" aria-label="${escapeText(details)}"></button>`;
    }).join('');
    $('.session-list').innerHTML = ordered.map((entry, index) => {
      const projectName = backendProjectsById.get(entry.projectId)?.name ?? '待分配时间段';
      return `<article class="session-row${index === 0 ? ' selected' : ''}" data-session="${entry.id}" data-entry-id="${entry.id}"><b>${displayClock(entry.startedAt)} – ${displayClock(entry.endedAt)}</b><button class="today-project-picker" data-entry-id="${entry.id}" title="选择所属项目">${escapeText(projectName)}</button><span class="session-note" contenteditable="true" data-entry-id="${entry.id}" title="点击编辑备注">${escapeText(entry.note)}</span><em>${durationText(entry.durationSeconds)}</em></article>`;
    }).join('');
  } catch {
    // 读取失败不清空当前页面，以便用户仍可继续离线操作。
  }
};
const openTodayProjectMenu = (picker) => {
  openPathChooser(picker, (path, _depth, projectId) => {
    picker.textContent = path || '待分配时间段';
    if (backendReady && picker.dataset.entryId) {
      api.updateEntry(picker.dataset.entryId, { projectId }).then(() => {
        void refreshTimeEntryViews();
      }).catch((error) => window.alert(`项目分配未保存：${error.message}`));
    }
  });
};
$('#todayTrack').addEventListener('click', (event) => {
  const session = event.target.closest('.session');
  if (session) selectTodaySession(session.dataset.sessions.split(',')[0]);
});
document.querySelector('.session-list').addEventListener('click', (event) => {
  const picker = event.target.closest('.today-project-picker');
  if (picker) {
    event.stopPropagation();
    openTodayProjectMenu(picker);
    return;
  }
  const row = event.target.closest('.session-row');
  if (row) selectTodaySession(row.dataset.session);
});
document.querySelector('.session-list').addEventListener('blur', (event) => {
  const note = event.target.closest('.session-note[data-entry-id]');
  if (!note || !backendReady) return;
  api.updateEntry(note.dataset.entryId, { note: note.textContent }).catch((error) => window.alert(`备注未保存：${error.message}`));
}, true);

const makeProjectRow = (depth, name = '新建子项目', projectId = '') => {
  const row = document.createElement('div');
  row.className = 'tree-project-row archivable';
  row.dataset.depth = depth;
  if (projectId) row.dataset.projectId = projectId;
  const role = depth === 1 ? 'parent' : 'child';
  row.innerHTML = `<button class="tree-disclosure" type="button" aria-label="展开或收起 ${name}"></button><button class="tree-row ${role}" data-project-name="${name}"${projectId ? ` data-project-id="${projectId}"` : ''}>${name}</button><button class="tree-add-child" title="创建子项目" aria-label="创建子项目">＋</button>`;
  return row;
};
const renderProjectTreeFromBackend = (projects) => {
  const host = $('#projectTree');
  [...host.querySelectorAll('.tree-project-row')].forEach((row) => row.remove());
  const childrenByParent = new Map();
  projects.forEach((project) => {
    const key = project.parentId ?? 'root';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(project);
  });
  const pending = host.querySelector('.tree-row.pending');
  const selectedName = window.localStorage.getItem('baiwanquan:active-project-name') || activeProjectName;
  const appendBranch = (parentId, depth) => {
    (childrenByParent.get(parentId) ?? []).sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt)).forEach((project) => {
      const row = makeProjectRow(depth, project.name, project.id);
      if (project.status === 'archived') row.dataset.archived = 'true';
      if (project.name === selectedName) row.querySelector('.tree-row').classList.add('active');
      host.insertBefore(row, pending);
      appendBranch(project.id, depth + 1);
    });
  };
  appendBranch('root', 1);
  // 新安装没有历史项目时，localStorage 仍可能保留旧演示项目名。
  // 此时必须选中真实目录中的第一个可用项目，不能让静态页面的示例内容留在主区域。
  let activeRow = host.querySelector('.tree-row.active');
  if (!activeRow) {
    activeRow = [...host.querySelectorAll('.tree-project-row:not([data-archived="true"]) .tree-row')][0]
      ?? host.querySelector('.tree-project-row .tree-row');
    activeRow?.classList.add('active');
  }
  if (activeRow) {
    activeProjectName = activeRow.dataset.projectName;
    window.localStorage.setItem('baiwanquan:active-project-name', activeProjectName);
  }
  syncProjectTree();
};
const syncProjectTree = () => {
  const rows = $$('.tree-project-row');
  rows.forEach((row, index) => {
    const depth = Number(row.dataset.depth);
    const nextDepth = Number(rows[index + 1]?.dataset.depth || 0);
    const disclosure = row.querySelector('.tree-disclosure');
    const hasChildren = nextDepth > depth;
    row.classList.toggle('has-children', hasChildren);
    if (disclosure) disclosure.disabled = !hasChildren && depth !== 1;
  });
  let closedDepth = 0;
  rows.forEach((row) => {
    const depth = Number(row.dataset.depth);
    if (closedDepth && depth <= closedDepth) closedDepth = 0;
    const hiddenByAncestor = closedDepth && depth > closedDepth;
    row.hidden = Boolean(hiddenByAncestor) || (row.dataset.archived === 'true' && !$('#showArchivedProjects').checked);
    if (!hiddenByAncestor && row.dataset.collapsed === 'true') closedDepth = depth;
  });
};
$('.project-tree').addEventListener('click', (event) => {
  const unassigned = event.target.closest('.segment-node');
  if (unassigned) {
    document.querySelector('[data-view="projects"]').click();
    document.querySelector('.project-header').hidden = true;
    $$('.project-panel').forEach((panel) => panel.classList.remove('active'));
    $('#unassignedDetail').hidden = false;
    $('#unassignedDetail h2').textContent = `${unassigned.dataset.start} – ${unassigned.dataset.end}`;
    return;
  }
  const disclosure = event.target.closest('.tree-disclosure');
  if (disclosure) {
    const row = disclosure.closest('.tree-project-row');
    if (!row.classList.contains('has-children')) return;
    row.dataset.collapsed = row.dataset.collapsed === 'true' ? 'false' : 'true';
    syncProjectTree();
    return;
  }
  const add = event.target.closest('.tree-add-child');
  if (add) {
    const parent = add.closest('.tree-project-row');
    const depth = Number(parent.dataset.depth);
    if (depth < 5) {
      const row = makeProjectRow(depth + 1);
      parent.insertAdjacentElement('afterend', row);
      persistProjectCreation(row, parent.dataset.projectId || null);
    }
    syncProjectTree();
    return;
  }
  if (event.target.closest('.tree-add')) {
    const pending = document.querySelector('.tree-row.pending');
    const row = makeProjectRow(1);
    pending.insertAdjacentElement('beforebegin', row);
    persistProjectCreation(row);
    syncProjectTree();
    return;
  }
  const project = event.target.closest('.tree-project-row .tree-row');
  if (project) {
    openProject(project);
  }
});
syncProjectTree();
$('.project-tree').addEventListener('dragstart', (event) => {
  const node = event.target.closest('.segment-node');
  if (!node) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', node.dataset.entryId);
  node.classList.add('dragging');
});
$('.project-tree').addEventListener('dragend', () => document.querySelector('.segment-node.dragging')?.classList.remove('dragging'));
$('.project-tree').addEventListener('dragover', (event) => {
  if (event.target.closest('.tree-project-row')) event.preventDefault();
});
$('.project-tree').addEventListener('drop', async (event) => {
  const target = event.target.closest('.tree-project-row');
  const node = document.querySelector('.segment-node.dragging');
  if (!target || !node) return;
  event.preventDefault();
  const projectButton = target.querySelector('.tree-row');
  const project = projectButton.dataset.projectName || '项目';
  const accepted = await askForConfirmation('移动待分配时间段', `确认将 ${node.dataset.start} – ${node.dataset.end} 移动到“${project}”吗？`, '移动');
  if (!accepted) return;
  try {
    if (backendReady) await api.updateEntry(node.dataset.entryId, { projectId: projectButton.dataset.projectId });
    node.remove();
    await refreshTimeEntryViews();
  } catch (error) { window.alert(`移动未保存：${error.message}`); }
});

$('#sessionProjectPicker').addEventListener('click', () => {
  $('#sessionProjectMenu').hidden = true;
  openPathChooser($('#sessionProjectPicker'), (path) => { $('#sessionProjectPicker').textContent = path || '待分配时间段'; });
});
$$('#sessionProjectMenu button').forEach((button) => button.addEventListener('click', () => {
  $('#sessionProjectPicker').textContent = button.dataset.path;
  $('#sessionProjectMenu').hidden = true;
}));
const assignedPicker = $('#assignedProjectPicker');
const assignedMenu = $('#assignedProjectMenu');
assignedPicker.textContent = '界面设计 / 视觉设计 / 页面布局优化';
$('#sessionProjectPicker').textContent = '选择所属项目';
const toggleProjectMenu = (picker, menu) => {
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  if (willOpen) {
    const rect = picker.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.left = `${rect.left}px`;
  }
};
assignedPicker.addEventListener('click', () => {
  assignedMenu.hidden = true;
  openPathChooser(assignedPicker, async (path, _depth, projectId) => {
    if (!selectedProjectSegmentId || !backendReady) { assignedPicker.textContent = path || '待分配时间段'; return; }
    try {
      await api.updateEntry(selectedProjectSegmentId, { projectId });
      await refreshTimeEntryViews();
    } catch (error) { window.alert(`项目分配未保存：${error.message}`); }
  });
});
$$('#assignedProjectMenu button').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.path === 'new') {
    $('#assignedProjectMenu').hidden = true;
    newProjectMenu.hidden = false;
    projectNameInput.focus();
    return;
  }
  $('#assignedProjectPicker').textContent = button.dataset.path || '待分配时间段';
  $('#assignedProjectMenu').hidden = true;
}));
const archiveWindow = 7 * 24 * 60 * 60 * 1000;
const statsProjectKey = { '界面设计': 'interface', '需求梳理': 'research', '交互设计': 'interaction', '英语学习': 'english' };
const markStatisticsLifecycle = (projectName, lifecycle) => {
  const key = statsProjectKey[projectName];
  if (!key) return;
  $$(`[data-project="${key}"]`).forEach((item) => {
    item.dataset.lifecycle = lifecycle;
    const suffix = lifecycle === 'active' ? '' : ` · ${lifecycle === 'archived' ? '已归档' : '已删除'}`;
    if (item.classList.contains('global-bar')) {
      if (!item.dataset.baseLabel) item.dataset.baseLabel = item.textContent;
      item.textContent = `${item.dataset.baseLabel}${suffix}`;
    }
    if (item.title) item.title = item.title.replace(/\n?(已归档|已删除)$/, '') + suffix;
  });
};
const refreshArchivedProjects = () => {
  const showArchived = $('#showArchivedProjects').checked;
  $$('.tree-project-row.archivable').forEach((node) => {
    if (node.dataset.archived !== 'true') return;
    const expired = Number(node.dataset.archiveUntil || 0) && Date.now() > Number(node.dataset.archiveUntil);
    node.dataset.deleted = expired ? 'true' : 'false';
    node.hidden = expired || !showArchived;
    const name = node.querySelector('.tree-row.child')?.dataset.projectName;
    if (name) markStatisticsLifecycle(name, expired ? 'deleted' : 'archived');
  });
};
$('#showArchivedProjects').addEventListener('change', refreshArchivedProjects);
$('#archiveProject').addEventListener('click', async () => {
  const current = document.querySelector('.tree-row.child.active')?.closest('.tree-project-row');
  if (!current) return;
  const restoring = current.dataset.archived === 'true';
  const accepted = await askForConfirmation(
    restoring ? '恢复归档项目' : '归档项目',
    restoring ? '确认恢复此项目及其全部子项目吗？' : '归档后将不再接受新的时间段；七天内可在“显示归档项目”中恢复。',
    restoring ? '恢复' : '归档',
  );
  if (!accepted) return;
  if (backendReady && current.dataset.projectId) {
    api.archiveProject(current.dataset.projectId, !restoring).catch((error) => window.alert(`项目状态未保存：${error.message}`));
  }
  const level = Number(current.dataset.depth);
  let insideArchivedBranch = false;
  $$('.archivable').forEach((node) => {
    const depth = Number(node.dataset.depth);
    if (node === current) insideArchivedBranch = true;
    else if (insideArchivedBranch && depth <= level) insideArchivedBranch = false;
    if (!insideArchivedBranch) return;
    if (restoring) {
      delete node.dataset.archived;
      delete node.dataset.archiveUntil;
      delete node.dataset.deleted;
      node.hidden = false;
      const name = node.querySelector('.tree-row.child')?.dataset.projectName;
      if (name) markStatisticsLifecycle(name, 'active');
    } else {
      node.dataset.archived = 'true';
      node.dataset.archiveUntil = String(Date.now() + archiveWindow);
      node.hidden = !$('#showArchivedProjects').checked;
      const name = node.querySelector('.tree-row.child')?.dataset.projectName;
      if (name) markStatisticsLifecycle(name, 'archived');
    }
  });
  if (restoring) {
    $('#archiveProject').textContent = '▢ 归档';
  } else {
    $('#archiveProject').textContent = '▣ 已归档 · 点击恢复';
    document.querySelector('[data-view="timer"]').click();
  }
  refreshArchivedProjects();
});

$('#floatWidget').addEventListener('contextmenu', (event) => {
  event.preventDefault();
  $('#floatMenu').hidden = false;
});

$('#floatToggleButton').addEventListener('click', (event) => {
  event.stopPropagation();
  if (isFloatingWindow) desktopBridge?.floatAction('pin');
  flashFloatAction(event.currentTarget);
});

const flashFloatAction = (button) => {
  button.classList.add('is-active');
  window.setTimeout(() => button.classList.remove('is-active'), 180);
};
let floatMenuDismissedAt = 0;
$('#floatWidget').addEventListener('mousemove', (event) => {
  // 原生悬浮窗正由主进程逐帧移动；renderer 再重绘液态高光会造成拖动闪烁。
  if (isFloatingWindow) return;
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--gx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
  event.currentTarget.style.setProperty('--gy', `${((event.clientY - rect.top) / rect.height) * 100}%`);
});
$('#floatTrimButton').addEventListener('click', (event) => {
  event.stopPropagation();
  const editor = $('#floatEditor');
  if (editor.hidden) {
    if (isFloatingWindow) {
      const inputs = $$('#floatEditor input');
      const value = $('#floatDigits').textContent.trim().split(':');
      [inputs[0].value, inputs[1].value, inputs[2].value] = value;
      desktopBridge?.floatAction('trim-start');
    } else { setRunning(false); syncTimerInputs(); }
    editor.hidden = false;
  } else {
    if (isFloatingWindow) {
      const values = [...editor.querySelectorAll('input')].map((input, index) => Math.max(0, Math.min(index === 0 ? 99 : 59, Number(input.value) || 0)));
      desktopBridge?.floatAction('trim-apply', { seconds: Math.max(1, values[0] * 3600 + values[1] * 60 + values[2]) });
    } else updateCountdownFromEditor(editor);
    editor.hidden = true;
  }
  $('#floatDigits').hidden = !editor.hidden;
  event.currentTarget.classList.toggle('is-active', !editor.hidden);
});
$('#floatSaveButton').addEventListener('click', (event) => { event.stopPropagation(); if (isFloatingWindow) desktopBridge?.floatAction('save'); else void saveCurrentTimeEntry(); flashFloatAction(event.currentTarget); });
$('#floatDiscardButton').addEventListener('click', (event) => { event.stopPropagation(); if (isFloatingWindow) desktopBridge?.floatAction('discard'); else discardCurrentTimeSlice(); flashFloatAction(event.currentTarget); });
$('#floatOpenMainButton').addEventListener('click', (event) => { event.stopPropagation(); desktopBridge?.floatAction('open-main'); flashFloatAction(event.currentTarget); });
$('#floatCloseButton').addEventListener('click', (event) => { event.stopPropagation(); desktopBridge?.floatAction('close-float'); flashFloatAction(event.currentTarget); });
const dismissFloatMenu = (event) => {
  const menu = $('#floatMenu');
  // 菜单显示后，悬浮主体的单击与拖拽均不应收起；只有主体以外的点击才收起。
  if (!menu.hidden && !$('#floatWidget').contains(event.target)) menu.hidden = true;
};
document.addEventListener('pointerdown', dismissFloatMenu, true);
document.addEventListener('click', dismissFloatMenu, true);
document.addEventListener('pointerdown', (event) => {
  if (!pathChooser.hidden && !pathChooser.contains(event.target) && !event.target.closest('.task-picker, .segment-project-picker, .today-project-picker, .new-project-parent-picker')) pathChooser.hidden = true;
}, true);

let dragging = false, offsetX = 0, offsetY = 0, floatMoved = false, draggingCollapsed = false, nativeFloatPointer = null;
let lastFloatBodyClickAt = 0;
const floatWidget = $('#floatWidget');
if (isFloatingWindow) {
  connectFloatingTimer({ bridge: desktopBridge, widget: floatWidget, menu: $('#floatMenu'), digits: $('#floatDigits') });
}
desktopBridge?.onFloatAction((action) => {
  if (isFloatingWindow) return;
  const message = typeof action === 'string' ? { action } : action;
  if (message.action === 'toggle') setRunning(!running);
  if (message.action === 'trim-start') setRunning(false);
  if (message.action === 'trim-apply') {
    const value = formatTimer(Math.max(1, Math.floor(Number(message.payload?.seconds) || 0))).split(':');
    const inputs = $$('#trimEditor input');
    [inputs[0].value, inputs[1].value, inputs[2].value] = value;
    setRunning(false);
    updateCountdownFromEditor($('#trimEditor'));
  }
  if (message.action === 'save') void saveCurrentTimeEntry();
  if (message.action === 'discard') discardCurrentTimeSlice();
});
const restoreFloatWidget = () => {
  if (!floatWidget.classList.contains('is-collapsed')) return;
  const dockLeft = floatWidget.classList.contains('dock-left');
  floatWidget.classList.remove('is-collapsed', 'dock-left', 'dock-right', 'dock-top', 'dock-bottom');
  const width = floatWidget.getBoundingClientRect().width;
  // 右侧收缩后恢复时预留菜单的完整宽度，避免右侧四个按钮被屏幕边界裁掉。
  const menuClearance = 96;
  floatWidget.style.left = dockLeft ? '20px' : `${Math.max(20, window.innerWidth - width - menuClearance)}px`;
  floatWidget.style.right = 'auto';
  floatWidget.style.top = `${Math.max(18, Math.min(window.innerHeight - 190, Number.parseFloat(floatWidget.dataset.lastTop || 72)))}px`;
};
floatWidget.addEventListener('click', () => {
  if (floatMoved) {
    lastFloatBodyClickAt = 0;
    return;
  }
  if (!floatMoved && !draggingCollapsed && floatWidget.classList.contains('is-collapsed')) {
    if (isFloatingWindow) desktopBridge?.restoreFloat(); else restoreFloatWidget();
  } else if (!floatMoved && !$('#floatMenu').hidden && $('#floatEditor').hidden) {
    // 短按主体仅关闭菜单；拖动后的 click 不会改变菜单状态。
    $('#floatMenu').hidden = true;
    floatMenuDismissedAt = Date.now();
    lastFloatBodyClickAt = 0;
  } else if (!floatWidget.classList.contains('is-collapsed')) {
    // 不使用浏览器 dblclick：它可能把拖动或间隔过久的点击误判为双击。
    const now = Date.now();
    if (now - lastFloatBodyClickAt <= 320) {
      lastFloatBodyClickAt = 0;
      if (isFloatingWindow) desktopBridge?.floatAction('toggle');
      else setRunning(!running);
    } else {
      lastFloatBodyClickAt = now;
    }
  }
});
floatWidget.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || event.target.closest('button,input')) return;
  if (isFloatingWindow) {
    dragging = true; floatMoved = false;
    nativeFloatPointer = { x: event.screenX, y: event.screenY };
    // 主进程直接读取全局鼠标坐标移动原生窗口，避免窗口移动后 renderer 坐标产生跳帧。
    desktopBridge?.beginFloatDrag();
    return;
  }
  draggingCollapsed = floatWidget.classList.contains('is-collapsed');
  dragging = true; floatMoved = false;
  const rect = floatWidget.getBoundingClientRect();
  offsetX = event.clientX - rect.left;
  offsetY = event.clientY - rect.top;
});
window.addEventListener('mousemove', (event) => {
  if (!dragging) return;
  if (isFloatingWindow) {
    const dx = event.screenX - nativeFloatPointer.x;
    const dy = event.screenY - nativeFloatPointer.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      floatMoved = true;
    }
    return;
  }
  const nextTop = event.clientY - offsetY;
  const rect = floatWidget.getBoundingClientRect();
  if (Math.abs(nextTop - rect.top) > 3 || (!draggingCollapsed && Math.abs(event.clientX - offsetX - rect.left) > 3)) floatMoved = true;
  if (draggingCollapsed) {
    floatWidget.style.top = `${Math.max(18, Math.min(window.innerHeight - rect.height - 18, nextTop))}px`;
  } else {
    floatWidget.style.left = `${event.clientX - offsetX}px`;
    floatWidget.style.top = `${nextTop}px`;
    floatWidget.style.right = 'auto';
  }
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  if (isFloatingWindow) {
    dragging = false;
    nativeFloatPointer = null;
    desktopBridge?.endFloatDrag();
    window.setTimeout(() => { floatMoved = false; }, 120);
    return;
  }
  dragging = false;
  const rect = floatWidget.getBoundingClientRect();
  if (draggingCollapsed) {
    draggingCollapsed = false;
    window.setTimeout(() => { floatMoved = false; }, 120);
    return;
  }
  floatWidget.dataset.lastTop = String(rect.top);
  // 只有主体超过屏幕边缘三分之一后才收缩，避免正常贴边时误触发。
  const dockLeft = rect.left <= -(rect.width / 3);
  const dockRight = rect.right >= window.innerWidth + (rect.width / 3);
  if (dockLeft || dockRight) {
    $('#floatMenu').hidden = true;
    floatWidget.classList.add('is-collapsed', dockLeft ? 'dock-left' : 'dock-right');
    floatWidget.style.top = `${Math.max(24, Math.min(window.innerHeight - 50, rect.top))}px`;
    floatWidget.style.left = dockLeft ? '0px' : 'auto';
    floatWidget.style.right = dockRight ? '0px' : 'auto';
  }
  window.setTimeout(() => { floatMoved = false; }, 120);
});
// 收缩窗口只有一条极窄的可见把手；在透明区域收到的点击同样应恢复为原悬浮位置。
document.addEventListener('click', (event) => {
  if (!isFloatingWindow || event.button === 2 || !floatWidget.classList.contains('is-collapsed') || floatMoved) return;
  desktopBridge?.restoreFloat();
}, true);

// 项目目录可拖拽收合；点击任意项目会恢复为默认目录宽度。
const appShell = $('#appShell');
const projectRail = $('#projectRail');
const projectRailResizer = document.createElement('div');
projectRailResizer.id = 'projectRailResizer';
projectRailResizer.setAttribute('aria-label', '调整项目目录宽度');
const projectRailToggle = document.createElement('button');
projectRailToggle.id = 'projectRailToggle';
projectRailToggle.type = 'button';
projectRailToggle.title = '展开或收起项目目录';
projectRailToggle.textContent = '☰';
const projectRailRestore = document.createElement('button');
projectRailRestore.id = 'projectRailRestore';
projectRailRestore.type = 'button';
projectRailRestore.title = '恢复内容区域';
projectRailRestore.setAttribute('aria-label', '恢复内容区域');
projectRailRestore.textContent = '‹';
appShell.append(projectRailResizer, projectRailToggle, projectRailRestore);
const restoreProjectRail = () => {
  appShell.classList.remove('project-rail-closed', 'project-rail-full');
    appShell.style.setProperty('--project-rail-width', '258px');
};
const closeProjectRail = () => {
  appShell.classList.remove('project-rail-full');
  appShell.classList.add('project-rail-closed');
  appShell.style.setProperty('--project-rail-width', '0px');
};
const expandProjectRailFull = () => {
  appShell.classList.remove('project-rail-closed');
  appShell.classList.add('project-rail-full');
  appShell.style.removeProperty('--project-rail-width');
};
projectRailToggle.addEventListener('click', () => {
  if (appShell.classList.contains('project-rail-closed')) restoreProjectRail();
  else closeProjectRail();
});
projectRailRestore.addEventListener('click', restoreProjectRail);
let railResizing = false;
let railStartX = 0;
let railStartWidth = 298;
projectRailResizer.addEventListener('mousedown', (event) => {
  event.preventDefault();
  railResizing = true;
  railStartX = event.clientX;
  railStartWidth = projectRail.getBoundingClientRect().width;
});
window.addEventListener('mousemove', (event) => {
  if (!railResizing) return;
  const raw = railStartWidth + event.clientX - railStartX;
  // 只有拖到紧贴左侧导航栏时才自动收起；中间宽度和向右扩展均完整保留。
  if (raw <= 36) {
    closeProjectRail();
    return;
  }
  const maxWidth = Math.max(48, appShell.clientWidth - 82);
  // 只有接近最右边缘时才进入覆盖式全展开，不在中间宽度提前吸附。
  if (raw >= maxWidth - 28) {
    expandProjectRailFull();
    return;
  }
  const next = Math.max(48, Math.min(maxWidth, raw));
  appShell.classList.remove('project-rail-closed', 'project-rail-full');
  appShell.style.setProperty('--project-rail-width', `${next}px`);
});
window.addEventListener('mouseup', () => {
  if (!railResizing) return;
  railResizing = false;
  if (projectRail.getBoundingClientRect().width < 16) closeProjectRail();
});

const heatmap = $('#heatmap');
for (let index = 0; index < 112; index += 1) {
  const cell = document.createElement('i');
  if ([34,35,36,58,59,60,61,82,83,84].includes(index)) cell.className = 'l3';
  else if (index % 11 === 0 || index % 13 === 0) cell.className = 'l2';
  else if (index % 5 === 0) cell.className = 'l1';
  cell.title = `${Math.max(0, (index % 7) * 23)} 分钟`;
  heatmap.append(cell);
}

// 可编辑说明在本地保留：刷新页面后不会丢失用户刚刚修改的项目说明或备注。
$$('[contenteditable="true"]').forEach((field, index) => {
  const row = field.closest('[data-session]');
  const key = field.dataset.editKey || (row ? `today-note-${row.dataset.session}` : `editable-${index}`);
  const storageKey = `baiwanquan:${key}`;
  const saved = window.localStorage.getItem(storageKey);
  if (saved !== null) field.innerHTML = saved;
  field.addEventListener('input', () => window.localStorage.setItem(storageKey, field.innerHTML));
});

// 项目名称仅在详情页标题修改；提交后同步回当前目录项。
$('#projectTitle').addEventListener('focus', (event) => { event.currentTarget.dataset.previousName = activeProjectName; });
$('#projectTitle').addEventListener('blur', (event) => {
  const title = event.currentTarget;
  const previousName = title.dataset.previousName || activeProjectName;
  const nextName = title.textContent.trim() || previousName;
  title.textContent = nextName;
  const current = $('.tree-row.active');
  if (current) {
    current.textContent = nextName;
    current.dataset.projectName = nextName;
  }
  activeProjectName = nextName;
  window.localStorage.setItem('baiwanquan:active-project-name', nextName);
  if (backendReady && current?.dataset.projectId) {
    api.updateProject(current.dataset.projectId, { name: nextName }).then(({ project }) => {
      backendProjectsById.set(project.id, project);
      void refreshBackendStatistics();
    }).catch((error) => window.alert(`项目名称未保存：${error.message}`));
  }
});

$('.project-description [contenteditable="true"]').addEventListener('blur', (event) => {
  const current = $('.tree-row.active');
  if (!backendReady || !current?.dataset.projectId) return;
  api.updateProject(current.dataset.projectId, { description: event.currentTarget.textContent }).then(({ project }) => {
    backendProjectsById.set(project.id, project);
  }).catch((error) => window.alert(`项目说明未保存：${error.message}`));
});
$('.segment-detail .detail-note').addEventListener('blur', (event) => {
  const entryId = event.currentTarget.dataset.entryId;
  if (!entryId || !backendReady) return;
  api.updateEntry(entryId, { note: event.currentTarget.textContent }).then(async () => {
    await Promise.all([refreshTodayFromBackend(), refreshBackendStatistics()]);
  }).catch((error) => window.alert(`备注未保存：${error.message}`));
});

$('#timerNote').addEventListener('input', queueTimerPersistence);

// 渐进式数据迁移：首次连接本地服务时，将现有演示目录写入数据库并给 DOM 绑定稳定 ID。
// 后续重命名、新建和归档均使用该 ID 调用 API；服务不可用时不影响离线界面。
const initialiseLocalPersistence = async () => {
  try {
    const snapshot = await api.bootstrap();
    const projects = [...snapshot.projects];
    // 只有全新数据库才导入内置示例树；已有数据始终以数据库为准，避免刷新后复活旧目录。
    if (!projects.length) {
      const parents = {};
      for (const row of $$('.tree-project-row')) {
        const depth = Number(row.dataset.depth);
        const label = row.querySelector('.tree-row');
        const parentId = depth === 1 ? null : parents[depth - 1];
        const { project } = await api.createProject({ name: label.dataset.projectName, parentId });
        projects.push(project);
        parents[depth] = project.id;
        Object.keys(parents).filter((keyDepth) => Number(keyDepth) > depth).forEach((keyDepth) => delete parents[keyDepth]);
      }
    }
    renderProjectTreeFromBackend(projects);
    backendReady = true;
    backendProjectsById = new Map(projects.map((project) => [project.id, project]));
    document.documentElement.dataset.persistence = 'ready';
    restoreTimerFromBackend(snapshot.timer);
    renderUnassignedTree(snapshot.entries);
    void refreshTimeEntryViews();
  } catch (error) {
    backendReady = false;
    document.documentElement.dataset.persistence = 'offline';
  }
};

void initialiseLocalPersistence();

if (isFloatingWindow) {
  // 等两个绘制帧，确保 desktop-floating 的透明背景、隐藏主界面与液态层全部已生效。
  requestAnimationFrame(() => requestAnimationFrame(() => desktopBridge?.floatReady()));
}
