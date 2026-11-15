// ---------- Logic (no page needed, so it can be checked) ----------

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function addPlant(plants, name) {
  const clean = String(name || "").trim();
  if (!clean) return plants;
  return [...plants, { id: makeId(), name: clean, measurements: [] }];
}

function removePlant(plants, plantId) {
  return plants.filter((p) => p.id !== plantId);
}

function sortByDate(measurements) {
  return [...measurements].sort((a, b) => a.date.localeCompare(b.date));
}

function addMeasurement(plants, plantId, date, height) {
  if (height === "" || height === null || height === undefined) return plants;
  const value = Number(height);
  if (!date || !Number.isFinite(value) || value < 0) return plants;
  return plants.map((p) =>
    p.id === plantId
      ? { ...p, measurements: sortByDate([...p.measurements, { id: makeId(), date, height: value }]) }
      : p
  );
}

function removeMeasurement(plants, plantId, measurementId) {
  return plants.map((p) =>
    p.id === plantId
      ? { ...p, measurements: p.measurements.filter((m) => m.id !== measurementId) }
      : p
  );
}

function currentHeight(plant) {
  const list = sortByDate(plant.measurements);
  return list.length ? list[list.length - 1].height : null;
}

function calculateGrowth(plant) {
  const list = sortByDate(plant.measurements);
  if (list.length < 2) return 0;
  return Math.round((list[list.length - 1].height - list[0].height) * 10) / 10;
}

function formatHeight(cm) {
  return cm === null ? "—" : `${Math.round(cm * 10) / 10} cm`;
}

function chartPoints(measurements, width, height) {
  const list = sortByDate(measurements);
  if (list.length === 0) return [];
  const pad = 10;
  const max = Math.max(...list.map((m) => m.height), 1);
  const stepX = list.length > 1 ? (width - pad * 2) / (list.length - 1) : 0;
  return list.map((m, i) => ({
    x: list.length > 1 ? pad + i * stepX : width / 2,
    y: height - pad - (m.height / max) * (height - pad * 2),
  }));
}

// ---------- Page ----------

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function todayString() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function drawChart(svg, measurements) {
  const points = chartPoints(measurements, 300, 100);
  const ns = "http://www.w3.org/2000/svg";
  svg.innerHTML = "";
  if (points.length === 0) return;
  if (points.length > 1) {
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#3f9a5a");
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(line);
  }
  points.forEach((p) => {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    dot.setAttribute("r", "3");
    dot.setAttribute("fill", "#2f7a46");
    svg.appendChild(dot);
  });
}

let plants = [];

function update(next) {
  plants = next;
  savePlants(plants);
  render();
}

function renderPlant(plant) {
  const node = document.getElementById("plant-template").content.cloneNode(true);
  node.querySelector(".plant-name").textContent = plant.name;
  node.querySelector(".current").textContent = formatHeight(currentHeight(plant));
  const growth = calculateGrowth(plant);
  node.querySelector(".growth").textContent = `${growth >= 0 ? "+" : ""}${growth} cm`;
  node.querySelector(".count").textContent = plant.measurements.length;
  drawChart(node.querySelector(".chart"), plant.measurements);

  node.querySelector(".remove-plant").addEventListener("click", () => {
    if (confirm(`Remove ${plant.name} and all its measurements?`)) update(removePlant(plants, plant.id));
  });

  const form = node.querySelector(".add-measure");
  form.querySelector(".measure-date").value = todayString();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = form.querySelector(".measure-date").value;
    const height = form.querySelector(".measure-height").value;
    update(addMeasurement(plants, plant.id, date, height));
  });

  const history = node.querySelector(".history");
  [...sortByDate(plant.measurements)].reverse().forEach((m) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = `${formatDate(m.date)} — ${formatHeight(m.height)}`;
    const btn = document.createElement("button");
    btn.className = "link danger";
    btn.type = "button";
    btn.textContent = "Delete";
    btn.addEventListener("click", () => update(removeMeasurement(plants, plant.id, m.id)));
    li.append(text, btn);
    history.appendChild(li);
  });
  return node;
}

function render() {
  const list = document.getElementById("plant-list");
  list.innerHTML = "";
  plants.forEach((p) => list.appendChild(renderPlant(p)));
  document.getElementById("empty-message").hidden = plants.length > 0;
}

function startApp() {
  plants = loadPlants();
  document.getElementById("add-plant-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("plant-name");
    update(addPlant(plants, input.value));
    input.value = "";
  });
  render();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", startApp);
}

if (typeof module !== "undefined") {
  module.exports = {
    addPlant, removePlant, addMeasurement, removeMeasurement,
    currentHeight, calculateGrowth, formatHeight, chartPoints, sortByDate,
  };
}
