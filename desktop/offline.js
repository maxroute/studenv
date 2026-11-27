const address = new URLSearchParams(window.location.search).get("app");
if (address) document.getElementById("retry").href = address;
