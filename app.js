const roleKeywords = {
  "data-science": /\b(data scientist|data science|research scientist|statistician|quantitative analyst)\b/i,
  "data-analytics": /\b(data analyst|business analyst|business intelligence|analytics analyst|bi analyst|reporting analyst|product analyst|marketing analyst|data analytics)\b/i,
  "ml-ai": /\b(machine learning|deep learning|artificial intelligence|ai engineer|ai developer|ml engineer|mlops|nlp|computer vision|llm|applied scientist|generative ai|ai coding|ai research)\b/i
};

const feeds = [
  {
    id: "himalayas",
    name: "Himalayas",
    home: "https://himalayas.app/",
    cacheKey: "fieldnotes-himalayas-jobs-v4",
    fetch: fetchHimalayas
  },
  {
    id: "jobicy",
    name: "Jobicy",
    home: "https://jobicy.com/",
    cacheKey: "fieldnotes-jobicy-jobs-v4",
    fetch: fetchJobicy
  },
  {
    id: "remoteok",
    name: "Remote OK",
    home: "https://remoteok.com/",
    cacheKey: "fieldnotes-remoteok-jobs-v4",
    fetch: fetchRemoteOk
  },
  {
    id: "remotive",
    name: "Remotive",
    home: "https://remotive.com/",
    cacheKey: "fieldnotes-remotive-jobs-v4",
    fetch: fetchRemotive
  }
];

const form = document.querySelector("#job-search-form");
const roleInputs = [...document.querySelectorAll('input[name="role"]')];
const locationInput = document.querySelector("#location");
const dateInput = document.querySelector("#date-posted");
const selectionCount = document.querySelector("#selection-count");
const formMessage = document.querySelector("#form-message");
const clearLocationButton = document.querySelector("#clear-location");
const resultsSection = document.querySelector("#results-section");
const resultsStatus = document.querySelector("#results-status");
const resultsCount = document.querySelector("#results-count");
const jobList = document.querySelector("#job-list");

const preferencesKey = "fieldnotes-job-search-v1";
const requestLogKey = "fieldnotes-remotive-requests-v2";
const cacheDurationMs = 6 * 60 * 60 * 1000;
const staleCacheDurationMs = 7 * 24 * 60 * 60 * 1000;
const requestWindowMs = 24 * 60 * 60 * 1000;
const maxRemotiveRequestsPerWindow = 4;

function updateSelectionCount() {
  const count = roleInputs.filter((input) => input.checked).length;
  selectionCount.textContent = `${count} ${count === 1 ? "specialty" : "specialties"} selected`;
}

function updateClearButton() {
  clearLocationButton.hidden = locationInput.value.length === 0;
}

function savePreferences() {
  const preferences = {
    roles: roleInputs.filter((input) => input.checked).map((input) => input.value),
    location: locationInput.value,
    datePosted: dateInput.value
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
  } catch (error) {
    console.warn("Saved search preferences could not be read.", error);
  }
}

function parseCache(cacheKey) {
  try {
    const cache = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cache && Number.isFinite(cache.fetchedAt) && Array.isArray(cache.jobs)) return cache;
  } catch (error) {
    console.warn(`Could not read cached ${cacheKey} listings.`, error);
  }
  return null;
}

function saveCache(cacheKey, jobs) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), jobs }));
  } catch (error) {
    console.warn(`Could not cache ${cacheKey} listings in this browser.`, error);
  }
}

function readRemotiveRequestTimes(now) {
  try {
    const timestamps = JSON.parse(localStorage.getItem(requestLogKey) || "[]");
    if (Array.isArray(timestamps)) {
      return timestamps.filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < requestWindowMs);
    }
  } catch (error) {
    console.warn("The Remotive refresh history could not be read.", error);
  }
  return [];
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`The feed returned an error (${response.status}).`);
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The feed took too long to respond.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getFeedJobs(feed) {
  const now = Date.now();
  const cached = parseCache(feed.cacheKey);
  if (cached && now - cached.fetchedAt < cacheDurationMs) {
    return { jobs: cached.jobs, stale: false };
  }

  if (feed.id === "remotive") {
    const requestTimes = readRemotiveRequestTimes(now);
    if (requestTimes.length >= maxRemotiveRequestsPerWindow) {
      if (cached) return { jobs: cached.jobs, stale: true };
      throw new Error("Remotive's daily API request limit has been reached.");
    }
    requestTimes.push(now);
    try {
      localStorage.setItem(requestLogKey, JSON.stringify(requestTimes));
    } catch (error) {
      console.warn("Could not save Remotive's request history.", error);
    }
  }

  try {
    const jobs = await feed.fetch();
    saveCache(feed.cacheKey, jobs);
    return { jobs, stale: false };
  } catch (error) {
    if (cached && now - cached.fetchedAt < staleCacheDurationMs) {
      return { jobs: cached.jobs, stale: true, error };
    }
    throw error;
  }
}

async function fetchHimalayas() {
  const searches = [
    "data scientist",
    "data analyst",
    "machine learning",
    "artificial intelligence",
    "analytics"
  ];
  const requests = searches.flatMap((query) => [1, 2, 3].map((page) => {
    const url = new URL("https://himalayas.app/jobs/api/search");
    url.searchParams.set("country", "IN");
    url.searchParams.set("q", query);
    url.searchParams.set("sort", "recent");
    url.searchParams.set("page", String(page));
    return fetchJson(url);
  }));
  const responses = await Promise.allSettled(requests);
  const successful = responses.filter((result) => result.status === "fulfilled");
  if (!successful.length) throw new Error("Himalayas could not be reached.");
  return deduplicateJobs(successful.flatMap((result) => result.value.jobs || []).map((job) => normalizeHimalayas(job)));
}

async function fetchJobicy() {
  const requests = [
    { geo: "apac", industry: "data-science" },
    { geo: "apac", tag: "data analyst" },
    { geo: "apac", tag: "data scientist" },
    { geo: "apac", tag: "machine learning" },
    { geo: "apac", tag: "AI developer" }
  ];
  const responses = await Promise.allSettled(requests.map((filters) => {
    const url = new URL("https://jobicy.com/api/jobs");
    url.searchParams.set("count", "100");
    Object.entries(filters).forEach(([key, value]) => url.searchParams.set(key, value));
    return fetchJson(url);
  }));
  const successful = responses.filter((result) => result.status === "fulfilled");
  if (!successful.length) throw new Error("Jobicy could not be reached.");
  return deduplicateJobs(successful.flatMap((result) => result.value.jobs || []).map((job) => normalizeJobicy(job)));
}

async function fetchRemoteOk() {
  const response = await fetchJson("https://remoteok.com/api");
  if (!Array.isArray(response)) throw new Error("Remote OK returned an unexpected response.");
  return response
    .filter((job) => job.position && job.url)
    .map((job) => normalizeRemoteOk(job));
}

async function fetchRemotive() {
  const response = await fetchJson("https://remotive.com/api/remote-jobs");
  if (!response || !Array.isArray(response.jobs)) throw new Error("Remotive returned an unexpected response.");
  return response.jobs.map((job) => normalizeRemotive(job));
}

function normalizeHimalayas(job) {
  const locationRestrictions = Array.isArray(job.locationRestrictions) ? job.locationRestrictions : [];
  const applicationUrl = safeHttpsUrl(job.applicationLink);
  return {
    id: `himalayas:${job.guid}`,
    title: job.title,
    company: job.companyName,
    location: locationRestrictions.length ? locationRestrictions.join(", ") : "Worldwide",
    eligibleIndia: !locationRestrictions.length || locationRestrictions.some((location) => /^india$/i.test(location)),
    category: [...(job.parentCategories || []), ...(job.categories || [])].join(" · "),
    tags: [...(job.parentCategories || []), ...(job.categories || [])],
    description: shortDescription(job.excerpt || job.description),
    publishedAt: dateValue(job.pubDate, true),
    expiresAt: dateValue(job.expiryDate, true),
    salary: formatSalary(job.minSalary, job.maxSalary, job.currency, job.salaryPeriod),
    employmentType: job.employmentType,
    source: "Himalayas",
    sourceHome: "https://himalayas.app/",
    applyUrl: applicationUrl
  };
}

function normalizeJobicy(job) {
  const location = String(job.jobGeo || "");
  const eligibleIndia = /\bindia\b|\bapac\b|\banywhere\b|\bworldwide\b|\bglobal\b/i.test(location);
  return {
    id: `jobicy:${job.id}`,
    title: job.jobTitle,
    company: job.companyName,
    location: location || "Location not specified",
    eligibleIndia,
    category: Array.isArray(job.jobIndustry) ? job.jobIndustry.join(" · ") : String(job.jobIndustry || ""),
    tags: [],
    description: shortDescription(job.jobExcerpt || job.jobDescription),
    publishedAt: dateValue(job.pubDate),
    expiresAt: null,
    salary: formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod),
    employmentType: Array.isArray(job.jobType) ? job.jobType.join(", ") : String(job.jobType || ""),
    source: "Jobicy",
    sourceHome: "https://jobicy.com/",
    sourceUrl: safeHttpsUrl(job.url),
    applyUrl: safeHttpsUrl(job.url)
  };
}

function normalizeRemoteOk(job) {
  const location = String(job.location || "");
  return {
    id: `remoteok:${job.id}`,
    title: job.position,
    company: job.company,
    location: location || "Location not specified",
    eligibleIndia: /\bindia\b|\bworldwide\b|\banywhere\b|\bglobal\b/i.test(location),
    category: Array.isArray(job.tags) ? job.tags.slice(0, 3).join(" · ") : "",
    tags: Array.isArray(job.tags) ? job.tags : [],
    description: shortDescription(job.description),
    publishedAt: dateValue(job.date),
    expiresAt: null,
    salary: formatSalary(job.salary_min, job.salary_max, job.salary_currency, "year"),
    employmentType: "",
    source: "Remote OK",
    sourceHome: "https://remoteok.com/",
    sourceUrl: safeHttpsUrl(job.url),
    applyUrl: safeHttpsUrl(job.url)
  };
}

function normalizeRemotive(job) {
  const location = String(job.candidate_required_location || "");
  return {
    id: `remotive:${job.id}`,
    title: job.title,
    company: job.company_name,
    location: location || "Location not specified",
    eligibleIndia: /\bindia\b|\bworldwide\b|\banywhere\b|\bglobal\b/i.test(location),
    category: job.category || "",
    tags: Array.isArray(job.tags) ? job.tags : [],
    description: shortDescription(job.description),
    publishedAt: dateValue(job.publication_date),
    expiresAt: null,
    salary: job.salary || "",
    employmentType: job.job_type || "",
    source: "Remotive",
    sourceHome: "https://remotive.com/",
    sourceUrl: safeHttpsUrl(job.url),
    applyUrl: safeHttpsUrl(job.url)
  };
}

function safeHttpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function dateValue(value, unixSeconds = false) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const timestamp = unixSeconds && Number.isFinite(numeric) ? numeric * 1000 : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatSalary(minimum, maximum, currency, period) {
  if (!minimum && !maximum) return "";
  const formatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const range = minimum && maximum
    ? `${formatter.format(minimum)}–${formatter.format(maximum)}`
    : formatter.format(minimum || maximum);
  return [currency, range, period].filter(Boolean).join(" ");
}

function plainTextDescription(description) {
  const documentFragment = new DOMParser().parseFromString(description || "", "text/html");
  return (documentFragment.body.textContent || "").replace(/\s+/g, " ").trim();
}

function shortDescription(description) {
  return plainTextDescription(description).slice(0, 600);
}

function matchesSearch(job, selectedRoles, days) {
  if (!job.eligibleIndia || !selectedRoles.some((role) => {
    const matcher = roleKeywords[role];
    const searchable = [
      job.title,
      ...(Array.isArray(job.tags) ? job.tags : [])
    ].join(" ");
    return matcher?.test(searchable);
  })) return false;

  if (job.expiresAt && job.expiresAt < Date.now()) return false;
  if (days) {
    if (!job.publishedAt || Date.now() - job.publishedAt > Number(days) * 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

function deduplicateJobs(jobs) {
  const unique = new Map();
  jobs.forEach((job) => {
    if (!job.title || !job.applyUrl) return;
    const key = `${String(job.title).trim().toLowerCase()}|${String(job.company || "").trim().toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, job);
  });
  return [...unique.values()];
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(timestamp);
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

  const descriptionText = plainTextDescription(job.description);
  if (descriptionText) {
    const description = document.createElement("p");
    description.className = "job-description";
    description.textContent = descriptionText.length > 230
      ? `${descriptionText.slice(0, 230).trimEnd()}…`
      : descriptionText;
    content.append(description);
  }

  if (Array.isArray(job.tags) && job.tags.length) {
    const tags = document.createElement("div");
    tags.className = "job-tags";
    job.tags.slice(0, 5).forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "job-tag";
      chip.textContent = tag;
      tags.append(chip);
    });
    content.append(tags);
  }

  const apply = document.createElement("a");
  apply.className = "apply-button";
  apply.href = job.applyUrl;
  apply.target = "_blank";
  apply.rel = "noopener noreferrer";
  apply.textContent = "View job & apply";
  apply.setAttribute("aria-label", `View and apply for ${job.title} at ${job.company || "the company"} on ${job.source}`);
  card.append(content, apply);
  return card;
}

function displayJobs(jobs, selectedRoles, days, sourceErrors) {
  const matches = deduplicateJobs(jobs)
    .filter((job) => matchesSearch(job, selectedRoles, days))
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

  jobList.replaceChildren(...matches.map(createJobCard));
  resultsCount.textContent = `${matches.length} ${matches.length === 1 ? "job" : "jobs"}`;
  if (matches.length) {
    const sourceCount = new Set(matches.map((job) => job.source)).size;
    resultsStatus.textContent = `Showing India-eligible roles from ${sourceCount} job ${sourceCount === 1 ? "feed" : "feeds"}.${sourceErrors.length ? ` Some feeds were unavailable: ${sourceErrors.join(", ")}.` : ""}`;
    resultsStatus.classList.remove("empty");
  } else {
    resultsStatus.textContent = sourceErrors.length
      ? `No matching jobs found. These feeds could not be reached: ${sourceErrors.join(", ")}. Please try again later.`
      : "No matching jobs in these feeds. Try selecting more specialties or a wider date range.";
    resultsStatus.classList.add("empty");
  }
}

roleInputs.forEach((input) => input.addEventListener("change", () => {
  updateSelectionCount();
  savePreferences();
}));

locationInput.addEventListener("input", () => {
  updateClearButton();
  savePreferences();
});
dateInput.addEventListener("change", savePreferences);

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
  formMessage.hidden = true;
  updateSelectionCount();
  updateClearButton();
  savePreferences();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selectedRoles = roleInputs.filter((input) => input.checked).map((input) => input.value);
  if (selectedRoles.length === 0) {
    formMessage.textContent = "Choose at least one specialty to search.";
    formMessage.hidden = false;
    roleInputs[0].focus();
    return;
  }

  formMessage.hidden = true;
  resultsSection.hidden = false;
  resultsStatus.classList.remove("empty");
  resultsStatus.textContent = "Searching job feeds…";
  resultsCount.textContent = "";
  jobList.replaceChildren();
  savePreferences();
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  const results = await Promise.allSettled(feeds.map(async (feed) => ({
    feed,
    ...(await getFeedJobs(feed))
  })));
  const jobs = [];
  const sourceErrors = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      jobs.push(...result.value.jobs);
      if (result.value.error) sourceErrors.push(result.value.feed.name);
    } else {
      sourceErrors.push(feeds[results.indexOf(result)].name);
      console.error("Could not load a job feed.", result.reason);
    }
  });
  displayJobs(jobs, selectedRoles, dateInput.value, sourceErrors);
});

loadPreferences();
updateSelectionCount();
updateClearButton();
document.querySelector("#year").textContent = new Date().getFullYear();
