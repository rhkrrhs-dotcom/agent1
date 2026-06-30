const STORAGE_KEY = "work-triage-board-v1";
const RADAR_STORAGE_KEY = "russia-banner-radar-v1";

const state = {
  tasks: loadTasks(),
  radar: loadRadar(),
  projects: [],
  projectFilter: "recent",
  projectSearch: "",
  filter: "all",
  search: "",
};

const els = {
  form: document.querySelector("#captureForm"),
  noteInput: document.querySelector("#noteInput"),
  addBlank: document.querySelector("#addBlank"),
  searchInput: document.querySelector("#searchInput"),
  segments: document.querySelectorAll(".segment"),
  lists: {
    todo: document.querySelector("#todoList"),
    doing: document.querySelector("#doingList"),
    done: document.querySelector("#doneList"),
  },
  counts: {
    total: document.querySelector("#totalCount"),
    today: document.querySelector("#todayCount"),
    done: document.querySelector("#doneCount"),
    todoColumn: document.querySelector("#todoCount"),
    doingColumn: document.querySelector("#doingCount"),
    doneColumn: document.querySelector("#doneColumnCount"),
  },
  exportMarkdown: document.querySelector("#exportMarkdown"),
  clearDone: document.querySelector("#clearDone"),
  translateInput: document.querySelector("#translateInput"),
  translateOutput: document.querySelector("#translateOutput"),
  targetLanguage: document.querySelector("#targetLanguage"),
  translateTone: document.querySelector("#translateTone"),
  translateDetail: document.querySelector("#translateDetail"),
  translateButton: document.querySelector("#translateButton"),
  translateStatus: document.querySelector("#translateStatus"),
  loadNoteForTranslate: document.querySelector("#loadNoteForTranslate"),
  copyTranslation: document.querySelector("#copyTranslation"),
  useTranslationAsNote: document.querySelector("#useTranslationAsNote"),
  radarReport: document.querySelector("#radarReport"),
  radarIdea: document.querySelector("#radarIdea"),
  radarIdeaList: document.querySelector("#radarIdeaList"),
  radarStatus: document.querySelector("#radarStatus"),
  updateRadar: document.querySelector("#updateRadar"),
  addRadarIdea: document.querySelector("#addRadarIdea"),
  saveRadarReport: document.querySelector("#saveRadarReport"),
  radarChecks: document.querySelectorAll("[data-radar-check]"),
  syncProjects: document.querySelector("#syncProjects"),
  projectStatus: document.querySelector("#projectStatus"),
  projectSearch: document.querySelector("#projectSearch"),
  projectFilters: document.querySelectorAll("[data-project-filter]"),
  projectList: document.querySelector("#projectList"),
  projectCounts: {
    total: document.querySelector("#projectTotal"),
    recent: document.querySelector("#projectRecent"),
    overdue: document.querySelector("#projectOverdue"),
    upcoming: document.querySelector("#projectUpcoming"),
  },
  template: document.querySelector("#taskTemplate"),
};

if (state.tasks.length === 0) {
  state.tasks = parseNotes(els.noteInput.value);
  saveTasks();
}

render();
renderRadar();
renderProjects();
syncProjects();

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const parsed = parseNotes(els.noteInput.value);
  state.tasks = [...parsed, ...state.tasks];
  els.noteInput.value = "";
  saveTasks();
  render();
});

els.addBlank.addEventListener("click", () => {
  state.tasks.unshift(createTask({ title: "새 업무", owner: "", due: "" }));
  saveTasks();
  render();
});

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value.trim().toLowerCase();
  render();
});

els.segments.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    els.segments.forEach((segment) => segment.classList.toggle("active", segment === button));
    render();
  });
});

els.exportMarkdown.addEventListener("click", async () => {
  const markdown = toMarkdown(state.tasks);
  await copyText(markdown);
  els.exportMarkdown.title = "클립보드에 복사됨";
  window.setTimeout(() => {
    els.exportMarkdown.title = "Markdown 내보내기";
  }, 1600);
});

els.clearDone.addEventListener("click", () => {
  state.tasks = state.tasks.filter((task) => task.status !== "done");
  saveTasks();
  render();
});

els.loadNoteForTranslate.addEventListener("click", () => {
  els.translateInput.value = els.noteInput.value.trim();
});

els.translateButton.addEventListener("click", async () => {
  const text = els.translateInput.value.trim();
  if (!text) {
    setTranslateStatus("번역할 내용을 입력하세요.", "error");
    return;
  }

  setTranslateStatus("번역 중", "loading");
  els.translateButton.disabled = true;

  try {
    const translated = await translateText({
      text,
      targetLanguage: els.targetLanguage.value,
      tone: els.translateTone.value,
      detail: els.translateDetail.value,
    });
    els.translateOutput.value = translated;
    setTranslateStatus("완료", "success");
  } catch (error) {
    els.translateOutput.value = "";
    setTranslateStatus(error.message, "error");
  } finally {
    els.translateButton.disabled = false;
  }
});

els.copyTranslation.addEventListener("click", async () => {
  const text = els.translateOutput.value.trim();
  if (!text) return;
  await copyText(text);
  setTranslateStatus("복사됨", "success");
});

els.useTranslationAsNote.addEventListener("click", () => {
  const text = els.translateOutput.value.trim();
  if (!text) return;
  els.noteInput.value = text;
  setTranslateStatus("메모에 넣음", "success");
});

els.saveRadarReport.addEventListener("click", () => {
  state.radar.report = els.radarReport.value.trim();
  state.radar.updatedAt = Date.now();
  saveRadar();
  setRadarStatus("저장됨", "success");
});

els.updateRadar.addEventListener("click", async () => {
  await updateRadarReport();
});

els.addRadarIdea.addEventListener("click", () => {
  addRadarIdea();
});

els.radarIdea.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addRadarIdea();
  }
});

els.radarChecks.forEach((check) => {
  check.addEventListener("change", () => {
    state.radar.checks[check.dataset.radarCheck] = check.checked;
    state.radar.updatedAt = Date.now();
    saveRadar();
    setRadarStatus("저장됨", "success");
  });
});

els.syncProjects.addEventListener("click", async () => {
  await syncProjects();
});

els.projectSearch.addEventListener("input", (event) => {
  state.projectSearch = event.target.value.trim().toLowerCase();
  renderProjects();
});

els.projectFilters.forEach((button) => {
  button.addEventListener("click", () => {
    state.projectFilter = button.dataset.projectFilter;
    els.projectFilters.forEach((filter) => filter.classList.toggle("active", filter === button));
    renderProjects();
  });
});

function render() {
  Object.values(els.lists).forEach((list) => {
    list.innerHTML = "";
  });

  const visibleTasks = state.tasks.filter(matchesView);
  const grouped = {
    todo: visibleTasks.filter((task) => task.status === "todo"),
    doing: visibleTasks.filter((task) => task.status === "doing"),
    done: visibleTasks.filter((task) => task.status === "done"),
  };

  Object.entries(grouped).forEach(([status, tasks]) => {
    if (tasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "비어 있음";
      els.lists[status].append(empty);
      return;
    }

    tasks.forEach((task) => {
      els.lists[status].append(renderTask(task));
    });
  });

  els.counts.total.textContent = state.tasks.length;
  els.counts.today.textContent = state.tasks.filter((task) => normalizeDue(task.due) === "today").length;
  els.counts.done.textContent = state.tasks.filter((task) => task.status === "done").length;
  els.counts.todoColumn.textContent = grouped.todo.length;
  els.counts.doingColumn.textContent = grouped.doing.length;
  els.counts.doneColumn.textContent = grouped.done.length;
}

function renderTask(task) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const title = node.querySelector(".task-title");
  const owner = node.querySelector(".owner-input");
  const due = node.querySelector(".due-input");
  const remove = node.querySelector(".delete-button");

  title.value = task.title;
  owner.value = task.owner;
  due.value = task.due;

  title.addEventListener("change", () => updateTask(task.id, { title: title.value.trim() || "제목 없음" }));
  owner.addEventListener("change", () => updateTask(task.id, { owner: owner.value.trim() }));
  due.addEventListener("change", () => updateTask(task.id, { due: due.value.trim() }));
  remove.addEventListener("click", () => {
    state.tasks = state.tasks.filter((item) => item.id !== task.id);
    saveTasks();
    render();
  });

  node.querySelectorAll("[data-move]").forEach((button) => {
    const status = button.dataset.move;
    button.classList.toggle("active", task.status === status);
    button.addEventListener("click", () => updateTask(task.id, { status }));
  });

  return node;
}

function updateTask(id, patch) {
  state.tasks = state.tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: Date.now() } : task));
  saveTasks();
  render();
}

function parseNotes(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => createTask(parseLine(line)));
}

function parseLine(line) {
  const ownerMatch = line.match(/^([^:：]{2,16})[:：]\s*(.+)$/);
  const source = ownerMatch ? ownerMatch[2] : line;
  const owner = ownerMatch ? ownerMatch[1].trim() : findOwner(source);
  return {
    title: cleanupTitle(source),
    owner,
    due: findDue(source),
  };
}

function createTask({ title, owner = "", due = "", status = "todo" }) {
  return {
    id: crypto.randomUUID(),
    title,
    owner,
    due,
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function cleanupTitle(text) {
  return text
    .replace(/\b(오늘|내일|이번 주|다음 주|월요일|화요일|수요일|목요일|금요일|토요일|일요일)\b/g, "")
    .replace(/\d{1,2}시(까지)?/g, "")
    .replace(/까지/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function findOwner(text) {
  const match = text.match(/([가-힣A-Za-z]{2,16})(님|씨)?(에게|한테|와|과|랑)\s/);
  return match ? match[1] : "";
}

function findDue(text) {
  const dayMatch = text.match(/오늘|내일|이번 주|다음 주|월요일|화요일|수요일|목요일|금요일|토요일|일요일/);
  const timeMatch = text.match(/\d{1,2}시/);
  return [dayMatch?.[0], timeMatch?.[0]].filter(Boolean).join(" ");
}

function matchesView(task) {
  const haystack = `${task.title} ${task.owner} ${task.due}`.toLowerCase();
  if (state.search && !haystack.includes(state.search)) return false;
  if (state.filter === "today") return normalizeDue(task.due) === "today";
  if (state.filter === "week") return task.due !== "";
  return true;
}

function normalizeDue(due) {
  return due.includes("오늘") ? "today" : "";
}

function toMarkdown(tasks) {
  const statusLabel = {
    todo: "해야 함",
    doing: "진행 중",
    done: "완료",
  };

  return ["# 내 업무 에이전트", "", ...tasks.map((task) => {
    const owner = task.owner ? ` 담당: ${task.owner}` : "";
    const due = task.due ? ` 마감: ${task.due}` : "";
    return `- [${task.status === "done" ? "x" : " "}] ${task.title} (${statusLabel[task.status]})${owner}${due}`;
  })].join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const buffer = document.createElement("textarea");
  buffer.value = text;
  buffer.setAttribute("readonly", "");
  buffer.style.position = "fixed";
  buffer.style.opacity = "0";
  document.body.append(buffer);
  buffer.select();
  document.execCommand("copy");
  buffer.remove();
}

async function translateText(payload) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "번역 서버를 확인하세요.");
  }

  return data.translation;
}

function setTranslateStatus(message, type) {
  els.translateStatus.textContent = message;
  els.translateStatus.className = `status-pill ${type || ""}`.trim();
}

async function syncProjects() {
  setProjectStatus("불러오는 중", "loading");
  els.syncProjects.disabled = true;
  try {
    const response = await fetch("/api/projects");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "프로젝트 시트를 확인하세요.");
    }
    state.projects = data.projects || [];
    renderProjects();
    setProjectStatus("동기화됨", "success");
  } catch (error) {
    setProjectStatus(error.message, "error");
  } finally {
    els.syncProjects.disabled = false;
  }
}

function renderProjects() {
  const enriched = state.projects.map((project) => ({
    ...project,
    status: projectStatus(project),
  }));
  const visible = enriched.filter(matchesProjectView);

  els.projectCounts.total.textContent = enriched.length;
  els.projectCounts.recent.textContent = enriched.filter(projectIsRecent).length;
  els.projectCounts.overdue.textContent = enriched.filter((project) => project.status === "overdue").length;
  els.projectCounts.upcoming.textContent = enriched.filter((project) => project.status === "upcoming").length;
  els.projectList.innerHTML = "";

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = state.projects.length ? "조건에 맞는 프로젝트 없음" : "동기화를 눌러 시트에서 가져오기";
    els.projectList.append(empty);
    return;
  }

  visible.slice(0, 40).forEach((project) => {
    els.projectList.append(renderProject(project));
  });
}

function renderProject(project) {
  const item = document.createElement("article");
  item.className = `project-card ${project.status}`;
  const head = document.createElement("div");
  head.className = "project-card-head";
  const title = document.createElement("h3");
  title.textContent = project.title || "제목 없음";
  const badge = document.createElement("span");
  badge.textContent = project.category || "General";
  head.append(title, badge);

  const meta = document.createElement("p");
  meta.textContent = [
    project.manager && `매니저: ${project.manager}`,
    project.date && `등록일: ${project.date}`,
    project.deadline && `마감: ${project.deadline}`,
  ].filter(Boolean).join(" · ");

  item.append(head, meta);
  return item;
}

function projectStatus(project) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = project.deadlineIso ? new Date(`${project.deadlineIso}T00:00:00`) : null;

  if (due && due < today) return "overdue";
  if (due && due >= today) return "upcoming";
  if (projectIsRecent(project)) return "recent";
  return "old";
}

function projectIsRecent(project) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const created = project.dateIso ? new Date(`${project.dateIso}T00:00:00`) : null;
  const daysFromCreated = created ? Math.round((today - created) / 86400000) : Infinity;
  return daysFromCreated >= 0 && daysFromCreated <= 30;
}

function matchesProjectView(project) {
  const haystack = `${project.title} ${project.manager} ${project.category} ${project.deadline}`.toLowerCase();
  if (state.projectSearch && !haystack.includes(state.projectSearch)) return false;
  if (state.projectFilter === "all") return true;
  if (state.projectFilter === "recent") return projectIsRecent(project);
  return project.status === state.projectFilter;
}

function setProjectStatus(message, type) {
  els.projectStatus.textContent = message;
  els.projectStatus.className = `status-pill ${type || ""}`.trim();
}

function renderRadar() {
  els.radarReport.value = state.radar.report || "";
  els.radarChecks.forEach((check) => {
    check.checked = Boolean(state.radar.checks[check.dataset.radarCheck]);
  });
  renderRadarIdeas();
}

async function updateRadarReport() {
  setRadarStatus("업데이트 중", "loading");
  els.updateRadar.disabled = true;
  try {
    const response = await fetch("/api/radar-update");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "레이더 업데이트를 확인하세요.");
    }
    state.radar.report = data.report || "";
    state.radar.updatedAt = Date.now();
    els.radarReport.value = state.radar.report;
    saveRadar();
    setRadarStatus("업데이트됨", "success");
  } catch (error) {
    setRadarStatus(error.message, "error");
  } finally {
    els.updateRadar.disabled = false;
  }
}

function renderRadarIdeas() {
  els.radarIdeaList.innerHTML = "";
  if (state.radar.ideas.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = "저장된 아이디어 없음";
    els.radarIdeaList.append(empty);
    return;
  }

  state.radar.ideas.forEach((idea) => {
    const item = document.createElement("article");
    item.className = "idea-card";
    const text = document.createElement("p");
    text.textContent = idea.text;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "아이디어 삭제");
    remove.addEventListener("click", () => {
      state.radar.ideas = state.radar.ideas.filter((savedIdea) => savedIdea.id !== idea.id);
      state.radar.updatedAt = Date.now();
      saveRadar();
      renderRadarIdeas();
      setRadarStatus("저장됨", "success");
    });
    item.append(text, remove);
    els.radarIdeaList.append(item);
  });
}

function addRadarIdea() {
  const text = els.radarIdea.value.trim();
  if (!text) {
    setRadarStatus("아이디어를 입력하세요.", "error");
    return;
  }

  state.radar.ideas.unshift({
    id: crypto.randomUUID(),
    text,
    createdAt: Date.now(),
  });
  els.radarIdea.value = "";
  state.radar.updatedAt = Date.now();
  saveRadar();
  renderRadarIdeas();
  setRadarStatus("저장됨", "success");
}

function setRadarStatus(message, type) {
  els.radarStatus.textContent = message;
  els.radarStatus.className = `status-pill ${type || ""}`.trim();
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function loadRadar() {
  try {
    return {
      report: "",
      ideas: [],
      checks: {},
      ...(JSON.parse(localStorage.getItem(RADAR_STORAGE_KEY)) ?? {}),
    };
  } catch {
    return {
      report: "",
      ideas: [],
      checks: {},
    };
  }
}

function saveRadar() {
  localStorage.setItem(RADAR_STORAGE_KEY, JSON.stringify(state.radar));
}
