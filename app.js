

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUSES = ["todo", "in_progress", "in_review", "done"];

const board = document.getElementById("board");
const lists = Object.fromEntries(
  STATUSES.map((s) => [s, document.querySelector(`.column-list[data-status="${s}"]`)])
);
const counts = Object.fromEntries(
  STATUSES.map((s) => [s, document.querySelector(`.column[data-status="${s}"] .column-count`)])
);
const statsEl = document.getElementById("board-stats");
const errorBanner = document.getElementById("error-banner");
const errorText = document.getElementById("error-banner-text");
const dialog = document.getElementById("task-dialog");
const form = document.getElementById("task-form");

init();

async function init() {
  showLoadingSkeletons();
  try {
    await ensureSession();
    await loadTasks();
    initDragAndDrop();
  } catch (err) {
    console.error(err);
    showError("Couldn't connect to the board. Check your connection and refresh.");
    clearLoadingSkeletons();
  }
}

async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

async function loadTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  clearLoadingSkeletons();
  if (error) {
    showError("Couldn't load tasks. Refresh to try again.");
    console.error(error);
    return;
  }
  renderBoard(data);
}

async function createTask(fields) {
  const { data, error } = await supabase
    .from("tasks")
    .insert(fields)
    .select()
    .single();

  if (error) {
    showError("Couldn't add the task. Please try again.");
    console.error(error);
    return null;
  }
  return data;
}

async function updateStatus(taskId, newStatus) {
  const { error } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", taskId);

  if (error) {
    showError("Couldn't move the task — reloading the board.");
    console.error(error);
    await loadTasks();
  } else {
    refreshCounts();
  }
}

async function deleteTask(taskId, cardEl) {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) {
    showError("Couldn't delete the task. Please try again.");
    console.error(error);
    return;
  }
  cardEl.remove();
  refreshCounts();
}

function renderBoard(tasks) {
  STATUSES.forEach((s) => (lists[s].innerHTML = ""));
  tasks.forEach((task) => {
    const status = STATUSES.includes(task.status) ? task.status : "todo";
    lists[status].appendChild(buildCard(task));
  });
  refreshCounts();
}

function buildCard(task) {
  const card = document.createElement("article");
  card.className = "task-card";
  card.dataset.id = task.id;

  const title = document.createElement("h3");
  title.className = "task-title";
  title.textContent = task.title;
  card.appendChild(title);

  if (task.description) {
    const desc = document.createElement("p");
    desc.className = "task-desc";
    desc.textContent = task.description;
    card.appendChild(desc);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";

  if (task.priority) {
    const chip = document.createElement("span");
    chip.className = `chip priority-${task.priority}`;
    chip.textContent = task.priority;
    meta.appendChild(chip);
  }

  if (task.due_date) {
    meta.appendChild(buildDueBadge(task.due_date));
  }

  if (meta.children.length > 0) card.appendChild(meta);

  const del = document.createElement("button");
  del.className = "task-delete";
  del.type = "button";
  del.setAttribute("aria-label", "Delete task");
  del.textContent = "×";
  del.addEventListener("click", () => deleteTask(task.id, card));
  card.appendChild(del);

  return card;
}

function buildDueBadge(dueDateStr) {
  const badge = document.createElement("span");
  badge.className = "due-badge";

  const due = new Date(dueDateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - today) / 86400000);

  if (diffDays < 0) badge.classList.add("overdue");
  else if (diffDays <= 2) badge.classList.add("due-soon");

  badge.textContent = due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  badge.title = `Due ${due.toLocaleDateString()}`;
  return badge;
}

function refreshCounts() {
  let total = 0;
  let done = 0;
  STATUSES.forEach((s) => {
    const n = lists[s].querySelectorAll(".task-card").length;
    counts[s].textContent = n;
    total += n;
    if (s === "done") done = n;
    toggleEmptyState(s, n);
  });
  statsEl.textContent = total === 0 ? "" : `${total} task${total === 1 ? "" : "s"} · ${done} done`;
}

function toggleEmptyState(status, count) {
  const list = lists[status];
  const existing = list.querySelector(".empty-state");
  if (count === 0 && !existing) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent =
      status === "done" ? "Nothing finished yet" : "No tasks — drag one here or add a new one";
    list.appendChild(empty);
  } else if (count > 0 && existing) {
    existing.remove();
  }
}

function showLoadingSkeletons() {
  STATUSES.forEach((s) => {
    lists[s].innerHTML = "";
    for (let i = 0; i < 2; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton-card";
      lists[s].appendChild(sk);
    }
  });
}

function clearLoadingSkeletons() {
  document.querySelectorAll(".skeleton-card").forEach((el) => el.remove());
}

function showError(message) {
  errorText.textContent = message;
  errorBanner.hidden = false;
}
document.getElementById("error-banner-dismiss").addEventListener("click", () => {
  errorBanner.hidden = true;
});

function initDragAndDrop() {
  STATUSES.forEach((status) => {
    new Sortable(lists[status], {
      group: "board",          
      animation: 160,
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      filter: ".empty-state",  
      onEnd(evt) {
        const taskId = evt.item.dataset.id;
        const newStatus = evt.to.dataset.status;
        const oldStatus = evt.from.dataset.status;
        refreshCounts();
        if (taskId && newStatus && newStatus !== oldStatus) {
          updateStatus(taskId, newStatus);
        }
      },
    });
  });
}

document.getElementById("btn-new-task").addEventListener("click", () => {
  form.reset();
  dialog.showModal();
  document.getElementById("f-title").focus();
});

document.getElementById("btn-cancel-task").addEventListener("click", () => dialog.close());

dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("f-title").value.trim();
  if (!title) return;

  const saveBtn = document.getElementById("btn-save-task");
  saveBtn.disabled = true;
  saveBtn.textContent = "Adding…";

  const task = await createTask({
    title,
    description: document.getElementById("f-description").value.trim() || null,
    priority: document.getElementById("f-priority").value,
    due_date: document.getElementById("f-due").value || null,
    status: "todo",
  });

  saveBtn.disabled = false;
  saveBtn.textContent = "Add task";

  if (task) {
    lists.todo.prepend(buildCard(task));
    refreshCounts();
    dialog.close();
  }
});
