import { writeFile } from "node:fs/promises";

const userAgent = "FieldnotesJobSearch/1.0";
const dateCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
  return response.json();
};

const htmlToText = (html = "") => String(html)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, " ")
  .trim();

const httpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const timeValue = (value, seconds = false) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const timestamp = seconds && Number.isFinite(numeric) ? numeric * 1000 : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const normalizeHimalayas = (job) => ({
  id: `himalayas:${job.guid}`,
  title: job.title,
  company: job.companyName,
  location: Array.isArray(job.locationRestrictions) && job.locationRestrictions.length
    ? job.locationRestrictions.join(", ")
    : "Worldwide",
  category: [...(job.parentCategories || []), ...(job.categories || [])].join(" · "),
  tags: [...(job.parentCategories || []), ...(job.categories || [])],
  description: job.excerpt || job.description,
  publishedAt: timeValue(job.pubDate, true),
  expiresAt: timeValue(job.expiryDate, true),
  salary: formatSalary(job.minSalary, job.maxSalary, job.currency, job.salaryPeriod),
  employmentType: job.employmentType,
  source: "Himalayas",
  sourceHome: "https://himalayas.app/",
  applyUrl: job.applicationLink
});

const normalizeJobicy = (job) => ({
  id: `jobicy:${job.id}`,
  title: job.jobTitle,
  company: job.companyName,
  location: job.jobGeo || "Location not specified",
  category: Array.isArray(job.jobIndustry) ? job.jobIndustry.join(" · ") : "",
  tags: [],
  description: job.jobExcerpt || job.jobDescription,
  publishedAt: timeValue(job.pubDate),
  salary: formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod),
  employmentType: Array.isArray(job.jobType) ? job.jobType.join(", ") : job.jobType,
  source: "Jobicy",
  sourceHome: "https://jobicy.com/",
  applyUrl: job.url
});

const normalizeRemoteOk = (job) => ({
  id: `remoteok:${job.id}`,
  title: job.position,
  company: job.company,
  location: job.location || "Remote · location not specified",
  category: Array.isArray(job.tags) ? job.tags.slice(0, 3).join(" · ") : "",
  tags: Array.isArray(job.tags) ? job.tags : [],
  description: job.description,
  publishedAt: timeValue(job.date),
  salary: formatSalary(job.salary_min, job.salary_max, job.salary_currency, "year"),
  employmentType: "",
  source: "Remote OK",
  sourceHome: "https://remoteok.com/",
  applyUrl: job.url
});

const normalizeRemotive = (job) => ({
  id: `remotive:${job.id}`,
  title: job.title,
  company: job.company_name,
  location: job.candidate_required_location || "Worldwide",
  category: job.category,
  tags: Array.isArray(job.tags) ? job.tags : [],
  description: job.description,
  publishedAt: timeValue(job.publication_date),
  salary: job.salary,
  employmentType: job.job_type,
  source: "Remotive",
  sourceHome: "https://remotive.com/",
  applyUrl: job.url
});

function formatSalary(minimum, maximum, currency, period) {
  if (!minimum && !maximum) return "";
  const format = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const range = minimum && maximum
    ? `${format.format(minimum)}–${format.format(maximum)}`
    : format.format(minimum || maximum);
  return [currency, range, period].filter(Boolean).join(" ");
}

const sources = [
  {
    name: "Himalayas",
    load: async () => {
      const queries = ["data scientist", "data analyst", "machine learning", "AI engineer", "analytics"];
      const requests = queries.flatMap((query) => [1, 2, 3, 4, 5].map(async (page) => {
        const url = new URL("https://himalayas.app/jobs/api/search");
        url.searchParams.set("country", "IN");
        url.searchParams.set("q", query);
        url.searchParams.set("sort", "recent");
        url.searchParams.set("page", String(page));
        const result = await fetchJson(url);
        return result.jobs || [];
      }));
      const batches = await Promise.allSettled(requests);
      const jobs = batches
        .filter((batch) => batch.status === "fulfilled")
        .flatMap((batch) => batch.value)
        .map(normalizeHimalayas);
      if (!jobs.length) throw new Error("India search returned no data");
      return jobs;
    }
  },
  {
    name: "Jobicy",
    load: async () => {
      const queries = [
        { geo: "apac", industry: "data-science" },
        { geo: "apac", tag: "data" },
        { geo: "apac", tag: "analyst" },
        { geo: "apac", tag: "scientist" },
        { geo: "apac", tag: "machine learning" },
        { geo: "apac", tag: "AI developer" }
      ];
      const batches = await Promise.allSettled(queries.map(async (filters) => {
        const url = new URL("https://jobicy.com/api/jobs");
        url.searchParams.set("count", "100");
        for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
        const result = await fetchJson(url);
        return (result.jobs || []).map(normalizeJobicy);
      }));
      const jobs = batches
        .filter((batch) => batch.status === "fulfilled")
        .flatMap((batch) => batch.value);
      if (!jobs.length) throw new Error("APAC job search returned no data");
      return jobs;
    }
  },
  {
    name: "Remote OK",
    load: async () => {
      const data = await fetchJson("https://remoteok.com/api");
      if (!Array.isArray(data)) throw new Error("unexpected feed response");
      return data.filter((job) => job.position && job.url).map(normalizeRemoteOk);
    }
  },
  {
    name: "Remotive",
    load: async () => {
      const data = await fetchJson("https://remotive.com/api/remote-jobs");
      if (!Array.isArray(data.jobs)) throw new Error("unexpected feed response");
      return data.jobs.map(normalizeRemotive);
    }
  }
];

const settled = await Promise.allSettled(sources.map(async (source) => ({
  source: source.name,
  jobs: await source.load()
})));
const jobs = settled
  .filter((result) => result.status === "fulfilled")
  .flatMap((result) => result.value.jobs)
  .filter((job) => job.title && job.applyUrl && job.sourceHome)
  .filter((job) => {
    const text = `${job.title} ${job.category} ${job.tags.join(" ")}`;
    const roleMatch = /\b(data|analyst|analytics|machine learning|artificial intelligence|ai engineer|ai developer|ml engineer|llm|nlp|computer vision|applied scientist|mlops)\b/i.test(text);
    const locationMatch = /\bindia\b|\bworldwide\b|\banywhere\b|\bglobal\b|\bapac\b/i.test(job.location);
    return roleMatch && locationMatch && (!job.publishedAt || job.publishedAt >= dateCutoff);
  });

const uniqueJobs = [...new Map(jobs.map((job) => [`${job.title.toLowerCase()}|${job.company.toLowerCase()}`, job])).values()]
  .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
const failedSources = settled.flatMap((result, index) => (
  result.status === "rejected" ? [sources[index].name] : []
));

if (!uniqueJobs.length) {
  throw new Error("No matching listings were retrieved; refusing to replace the current job snapshot.");
}

await writeFile("jobs.json", `${JSON.stringify({
  fetchedAt: new Date().toISOString(),
  sources: sources.map((source) => source.name),
  failedSources,
  jobs: uniqueJobs
}, null, 2)}\n`);

console.log(`Saved ${uniqueJobs.length} jobs. Unavailable feeds: ${failedSources.join(", ") || "none"}.`);
