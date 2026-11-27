const { clockText, ringLeft, timeLeftMs } = window.timerLogic;

const element = (id) => document.getElementById(id);
const time = element("time");
const line = element("line");
const ring = element("ring");
const toggle = element("toggle");

let state = { status: "idle" };

function write(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function draw() {
  document.body.dataset.status = state.status;
  document.body.dataset.break = state.status === "finished" && state.canStartBreak ? "yes" : "no";
  if (state.status === "idle") return;

  if (state.status === "finished") {
    write(time, `${state.label} done`);
    write(line, state.title);
    return;
  }

  const now = Date.now();
  write(time, clockText(timeLeftMs(state, now)));
  const name = state.title || state.label;
  write(line, state.status === "paused" ? `Paused · ${name}` : name);
  line.title = name;
  ring.style.strokeDashoffset = String(100 * (1 - ringLeft(state, now)));

  const action = state.status === "paused" ? "Resume" : "Pause";
  toggle.setAttribute("aria-label", action);
  toggle.title = action;
}

window.miniTimer.onState((next) => {
  state = next;
  draw();
});

element("toggle").addEventListener("click", () => window.miniTimer.act("toggle"));
element("open").addEventListener("click", () => window.miniTimer.act("open"));
element("hide").addEventListener("click", () => window.miniTimer.act("hide"));
element("break").addEventListener("click", () => window.miniTimer.act("startBreak"));

setInterval(draw, 250);
window.miniTimer.ready();
