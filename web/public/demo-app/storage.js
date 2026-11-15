const STORAGE_KEY = "plant-growth-tracker";

function savePlants(plants) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
  } catch (e) {
    // Saving may be blocked (for example in a private window); the app still works for this visit.
  }
}

function loadPlants() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

if (typeof module !== "undefined") {
  module.exports = { savePlants, loadPlants };
}
