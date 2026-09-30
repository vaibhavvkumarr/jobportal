const form = document.getElementById("jobForm");
const payBtn = document.getElementById("payBtn");
const statusBox = document.getElementById("status");
const resumeInput = document.getElementById("resume");
const fileName = document.getElementById("fileName");
const fileLabel = resumeInput.closest(".file");
const fileNameDefault = fileName.innerHTML;

// Nav firms up once the page is scrolled
const navWrap = document.querySelector(".nav-wrap");
const onScroll = () => navWrap.classList.toggle("scrolled", window.scrollY > 10);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();
document.getElementById("year").textContent = new Date().getFullYear();

// Scroll-in reveal
const revealer = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 })
  : null;
document.querySelectorAll(".reveal").forEach((el, i) => {
  if (!revealer) return el.classList.add("in");
  el.style.transitionDelay = el.parentElement.classList.contains("steps") ? `${(i % 3) * 90}ms` : "";
  revealer.observe(el);
});

// Sample alert cycles through different roles
const samples = [
  ["Data Analyst", [["Data Analyst", "Fintech · Bengaluru"], ["Business Analyst", "SaaS · Remote"], ["Analytics Associate", "E-commerce · Gurugram"], ["Junior Data Analyst", "Consulting · Pune"], ["MIS Analyst", "Retail · Mumbai"]]],
  ["Digital Marketing", [["Digital Marketing Executive", "D2C Brand · Mumbai"], ["Performance Marketer", "Edtech · Remote"], ["SEO Specialist", "Agency · Delhi"], ["Social Media Manager", "Media · Bengaluru"], ["Growth Associate", "Startup · Hyderabad"]]],
  ["Software Engineer", [["Backend Engineer — Java", "Fintech · Pune"], ["Full Stack Developer", "SaaS · Remote"], ["Frontend Engineer — React", "E-commerce · Bengaluru"], ["SDE II", "Product Co. · Hyderabad"], ["Node.js Developer", "Startup · Noida"]]],
  ["HR Recruiter", [["Talent Acquisition Specialist", "IT Services · Noida"], ["HR Executive", "Manufacturing · Chennai"], ["Technical Recruiter", "SaaS · Remote"], ["HR Business Partner", "Retail · Mumbai"], ["Recruitment Associate", "Staffing · Gurugram"]]],
  ["Finance", [["Financial Analyst", "Banking · Mumbai"], ["Accounts Executive", "FMCG · Delhi"], ["Chartered Accountant", "Consulting · Bengaluru"], ["FP&A Associate", "SaaS · Remote"], ["Credit Analyst", "NBFC · Pune"]]],
];
const sampleRole = document.getElementById("sampleRole");
const sampleJobs = document.getElementById("sampleJobs");
let sampleIndex = 0;
function showSample() {
  sampleIndex = (sampleIndex + 1) % samples.length;
  const [role, jobs] = samples[sampleIndex];
  sampleRole.classList.add("fade");
  sampleJobs.classList.add("fade");
  setTimeout(() => {
    sampleRole.textContent = role;
    sampleJobs.replaceChildren(...jobs.map(([title, meta]) => {
      const li = document.createElement("li");
      const b = document.createElement("b");
      const span = document.createElement("span");
      b.textContent = title;
      span.textContent = meta;
      li.append(b, span);
      return li;
    }));
    sampleRole.classList.remove("fade");
    sampleJobs.classList.remove("fade");
  }, 400);
}
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(showSample, 4000);

// Resume picker feedback
function updateFileName() {
  const file = resumeInput.files[0];
  fileLabel.classList.toggle("has-file", !!file);
  if (file) {
    const b = document.createElement("b");
    b.textContent = file.name;
    fileName.replaceChildren(b);
  } else fileName.innerHTML = fileNameDefault;
}
resumeInput.addEventListener("change", updateFileName);
["dragenter", "dragover"].forEach((t) => resumeInput.addEventListener(t, () => fileLabel.classList.add("dragging")));
["dragleave", "drop"].forEach((t) => resumeInput.addEventListener(t, () => fileLabel.classList.remove("dragging")));

// Parses an API response, with a clear message when the page isn't served by the Node server
// (e.g. opened via VS Code Live Server, which returns an HTML "Cannot GET" page).
async function readJson(res) {
  try {
    return await res.json();
  } catch {
    throw new Error("Server not reachable. Start it with \"npm start\" and open http://localhost:3000");
  }
}

function setStatus(text, error=false) {
  statusBox.textContent = text;
  statusBox.style.color = error ? "#ff9d9d" : "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("Submitting your details…");
  payBtn.disabled = true;

  try {
    const res = await fetch("/api/submit-application", { method: "POST", body: new FormData(form) });
    const result = await readJson(res);
    if (!res.ok) throw new Error(result.error || "Submission failed. Please try again.");

    form.reset();
    updateFileName();
    setStatus("✓ Details received! We'll contact you on WhatsApp shortly to complete your payment and activate your alerts.");
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    payBtn.disabled = false;
  }
});
