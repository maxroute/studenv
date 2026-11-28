const query = new URLSearchParams(window.location.search);
const retry = query.get("retry");

if (query.get("state") === "offline" && retry) {
  document.body.dataset.state = "offline";
  document.getElementById("retry").href = retry;
  // Back online: try again without being asked.
  window.addEventListener("online", () => window.location.assign(retry));
}
