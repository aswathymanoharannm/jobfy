const roleSearchTerms = {
  "data-science": ["data scientist", "data science"],
  "data-analytics": ["data analyst", "business analyst", "business intelligence analyst"],
  "ml-ai": ["machine learning engineer", "AI developer", "AI engineer"]
};

const roleTitlePatterns = {
  "data-science": /\b(data scientist|data science|research scientist|quantitative scientist)\b/i,
  "data-analytics": /\b(data analyst|business analyst|business intelligence|analytics (?:analyst|engineer)|bi analyst|reporting analyst|product analyst|marketing analyst)\b/i,
  "ml-ai": /\b(machine learning|ai engineer|ai developer|ai research|artificial intelligence|ml engineer|llm engineer|computer vision|applied scientist)\b/i
};

const form = document.querySelector("#job-search-form");
const roleInputs = [...document.querySelectorAll('input[name="role"]')];
const locationInput = document.querySelector("#location");
const dateInput = document.querySelector("#date-posted");
const citySelect = document.querySelector("#city-select");
const cityBoardLinks = document.querySelector("#city-board-links");
const selectionCount = document.querySelector("#selection-count");
const formMessage = document.querySelector("#form-message");
const clearLocationButton = document.querySelector("#clear-location");
const resultsSection = document.querySelector("#results-section");
const resultsStatus = document.querySelector("#results-status");
const resultsCount = document.querySelector("#results-count");
const jobList = document.querySelector("#job-list");

const preferencesKey = "fieldnotes-job-search-v1";

function updateSelectionCount() {
  const count = roleInputs.filter((input) => input.checked).length;
  selectionCount.textContent = `${count} ${count === 1 ? "specialty" : "specialties"} selected`;
}

function updateClearButton() {
  clearLocationButton.hidden = locationInput.value.length === 0;
}

function selectedSearchTerms() {
  return roleInputs
    .filter((input) => input.checked)
    .flatMap((input) => roleSearchTerms[input.value]);
}

function updateCityBoardLinks() {
  const city = citySelect.value;
  const terms = selectedSearchTerms();
  const query = terms.length ? terms.join(" OR ") : "data science OR data analyst OR machine learning";
  const indeed = new URL("https://in.indeed.com/jobs");
  indeed.searchParams.set("q", query);
  indeed.searchParams.set("l", city);

  const linkedIn = new URL("https://www.linkedin.com/jobs/search/");
  linkedIn.searchParams.set("keywords", query);
  linkedIn.searchParams.set("location", `${city}, India`);

  const foundit = new URL("https://www.foundit.in/srp/results");
  foundit.searchParams.set("query", query);
  foundit.searchParams.set("locations", city);

  const destinations = [
    { name: "Indeed India", url: indeed },
    { name: "LinkedIn Jobs", url: linkedIn },
    { name: "Foundit", url: foundit }
  ];
  cityBoardLinks.replaceChildren(...destinations.map(({ name, url }) => {
    const link = document.createElement("a");
    link.className = "city-board-link";
    link.href = url.toString();
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Search ${name}`;
    link.append(document.createTextNode(" ↗"));
    return link;
  }));
}

function savePreferences() {
  const preferences = {
    roles: roleInputs.filter((input) => input.checked).map((input) => input.value),
    location: locationInput.value,
    datePosted: dateInput.value,
    city: citySelect.value
  };

  try {
    localStorage.setItem(preferencesKey, JSON.stringify(preferences));
  } catch (error) {
    console.warn("Could not save search preferences in this browser.", error);
  }
}

function loadPreferences() {
  let saved;
  try {
    saved = localStorage.getItem(preferencesKey);
  } catch (error) {
    console.warn("Could not read saved search preferences from this browser.", error);
    return;
  }
  if (!saved) return;

  try {
    const preferences = JSON.parse(saved);
    if (!preferences || typeof preferences !== "object") return;
    if (Array.isArray(preferences.roles)) {
      roleInputs.forEach((input) => {
        input.checked = preferences.roles.includes(input.value);
      });
    }
    if (typeof preferences.location === "string") locationInput.value = preferences.location;
    if (typeof preferences.datePosted === "string" && [...dateInput.options].some((option) => option.value === preferences.datePosted)) {
      dateInput.value = preferences.datePosted;
    }
    if (typeof preferences.city === "string" && [...citySelect.options].some((option) => option.value === preferences.city)) {
      citySelect.value = preferences.city;
    }
  } catch (error) {
    console.warn("Saved search preferences could not be read.", error);
  }
}

function safeHttpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function matchesSearch(job, selectedRoles, days, requestedArea) {
  const roleMatch = selectedRoles.some((role) => roleTitlePatterns[role]?.test(job.title || ""));
  if (!roleMatch || (job.expiresAt && job.expiresAt < Date.now())) return false;

  if (days) {
    if (!job.publishedAt || Date.now() - job.publishedAt > Number(days) * 24 * 60 * 60 * 1000) return false;
  }

  if (requestedArea && requestedArea.toLowerCase() !== "india") {
    const listingLocation = String(job.location || "").toLowerCase();
    const requestedTokens = requestedArea.toLowerCase().split(/[\s,]+/).filter((token) => token.length > 2);
    const isIndiaWideRemote = /\bindia\b|\bworldwide\b|\banywhere\b|\bglobal\b/i.test(listingLocation);
    if (!isIndiaWideRemote && !requestedTokens.some((token) => listingLocation.includes(token))) return false;
  }
  return true;
}

function deduplicateJobs(jobs) {
  const unique = new Map();
  jobs.forEach((job) => {
    if (!job.title || !safeHttpsUrl(job.applyUrl)) return;
    const key = `${String(job.title).trim().toLowerCase()}|${String(job.company || "").trim().toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, job);
  });
  return [...unique.values()];
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function createJobCard(job) {
  const card = document.createElement("article");
  card.className = "job-card";

  const content = document.createElement("div");
  content.className = "job-card-content";
  const meta = document.createElement("div");
  meta.className = "job-meta";

  if (job.category) {
    const category = document.createElement("span");
    category.className = "job-category";
    category.textContent = job.category.split(" · ")[0];
    meta.append(category);
  }
  if (job.publishedAt) {
    const date = document.createElement("span");
    date.className = "job-date";
    date.textContent = formatDate(job.publishedAt);
    meta.append(date);
  }
  const source = document.createElement("a");
  source.className = "job-source";
  source.href = job.sourceHome;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = `via ${job.source}`;
  meta.append(source);

  const title = document.createElement("h3");
  title.className = "job-title";
  title.textContent = job.title;

  const company = document.createElement("p");
  company.className = "job-company";
  company.textContent = job.company || "Company not listed";

  const location = document.createElement("p");
  location.className = "job-location";
  location.textContent = `Remote · ${job.location || "India eligible"}`;
  content.append(meta, title, company, location);

  if (job.salary) {
    const salary = document.createElement("p");
    salary.className = "job-salary";
    salary.textContent = job.salary;
    content.append(salary);
  }
  if (job.description) {
    const description = document.createElement("p");
    description.className = "job-description";
    description.textContent = job.description.length > 230 ? `${job.description.slice(0, 230).trimEnd()}…` : job.description;
    content.append(description);
  }
  if (Array.isArray(job.tags) && job.tags.length) {
    const tags = document.createElement("div");
    tags.className = "job-tags";
    job.tags.slice(0, 5).forEach((value) => {
      const tag = document.createElement("span");
      tag.className = "job-tag";
      tag.textContent = value;
      tags.append(tag);
    });
    content.append(tags);
  }

  const apply = document.createElement("a");
  apply.className = "apply-button";
  apply.href = safeHttpsUrl(job.applyUrl);
  apply.target = "_blank";
  apply.rel = "noopener noreferrer";
  apply.textContent = "View job & apply";
  apply.setAttribute("aria-label", `View and apply for ${job.title} at ${job.company || "the company"} on ${job.source}`);
  card.append(content, apply);
  return card;
}

function displayJobs(snapshot, selectedRoles, days, requestedArea) {
  const matches = deduplicateJobs(snapshot.jobs)
    .filter((job) => matchesSearch(job, selectedRoles, days, requestedArea))
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

  jobList.replaceChildren(...matches.map(createJobCard));
  resultsCount.textContent = `${matches.length} ${matches.length === 1 ? "job" : "jobs"}`;

  const updatedAt = new Date(snapshot.fetchedAt);
  const updateText = Number.isNaN(updatedAt.getTime())
    ? ""
    : ` Feed refreshed ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(updatedAt)}.`;
  const failedSources = Array.isArray(snapshot.failedSources) ? snapshot.failedSources : [];
  const remoteNote = requestedArea && requestedArea.toLowerCase() !== "india"
    ? " Remote listings are India-eligible, not restricted to the selected city."
    : "";
  if (matches.length) {
    resultsStatus.textContent = `Showing India-eligible roles from ${new Set(matches.map((job) => job.source)).size} job feeds.${updateText}${remoteNote}${failedSources.length ? ` Some feeds were unavailable: ${failedSources.join(", ")}.` : ""}`;
    resultsStatus.classList.remove("empty");
  } else {
    resultsStatus.textContent = "No matching remote listings are available for these filters. Use the city search links below for local openings.";
    resultsStatus.classList.add("empty");
  }
}

roleInputs.forEach((input) => input.addEventListener("change", () => {
  updateSelectionCount();
  updateCityBoardLinks();
  savePreferences();
}));

locationInput.addEventListener("input", () => {
  updateClearButton();
  savePreferences();
});
dateInput.addEventListener("change", savePreferences);
citySelect.addEventListener("change", () => {
  updateCityBoardLinks();
  savePreferences();
});

clearLocationButton.addEventListener("click", () => {
  locationInput.value = "";
  updateClearButton();
  savePreferences();
  locationInput.focus();
});

document.querySelector("#reset-button").addEventListener("click", () => {
  roleInputs.forEach((input) => { input.checked = true; });
  locationInput.value = "India";
  dateInput.value = "";
  citySelect.value = "Bengaluru, Karnataka";
  formMessage.hidden = true;
  updateSelectionCount();
  updateClearButton();
  updateCityBoardLinks();
  savePreferences();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selectedRoles = roleInputs.filter((input) => input.checked).map((input) => input.value);
  if (!selectedRoles.length) {
    formMessage.textContent = "Choose at least one specialty to search.";
    formMessage.hidden = false;
    roleInputs[0].focus();
    return;
  }

  formMessage.hidden = true;
  resultsSection.hidden = false;
  resultsStatus.classList.remove("empty");
  resultsStatus.textContent = "Loading the latest job snapshot…";
  resultsCount.textContent = "";
  jobList.replaceChildren();
  savePreferences();
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const response = await fetch("./jobs.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`The refreshed job feed is not ready yet (${response.status}).`);
    const snapshot = await response.json();
    if (!Array.isArray(snapshot.jobs)) throw new Error("The job feed returned an unexpected response.");
    displayJobs(snapshot, selectedRoles, dateInput.value, locationInput.value.trim());
  } catch (error) {
    console.error("Could not load the published job snapshot.", error);
    resultsCount.textContent = "";
    resultsStatus.classList.add("empty");
    resultsStatus.textContent = error instanceof Error
      ? `${error.message} GitHub Actions refreshes the listings automatically; try again shortly.`
      : "Could not load job listings. Please try again later.";
  }
});

loadPreferences();
updateSelectionCount();
updateClearButton();
updateCityBoardLinks();
document.querySelector("#year").textContent = new Date().getFullYear();
