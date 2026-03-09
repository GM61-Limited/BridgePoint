import React, { useMemo, useState } from "react";

const SERVICE_DESK_URL = "https://servicedesk.gm61.co.uk/"; // <-- change this
const STATUS_URL = ""; // optional: https://status.yourdomain.com
const USER_GUIDE_URL = ""; // optional: link to docs/pdf

type FaqItem = {
  id: string;
  q: string;
  a: React.ReactNode;
  tags?: string[];
};

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Simple contact form state (optional - currently links to service desk)
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const faqs: FaqItem[] = useMemo(
    () => [
      {
        id: "login",
        q: "I can’t log in — what should I check?",
        a: (
          <>
            <ul className="mb-0">
              <li>Make sure you’re using your correct email and password.</li>
              <li>Try signing out and signing back in.</li>
              <li>If you see “Unauthorized” errors, your session may have expired.</li>
              <li>If you still can’t log in, raise a ticket so we can reset your access.</li>
            </ul>
          </>
        ),
        tags: ["auth", "login", "password"],
      },
      {
        id: "upload",
        q: "How do I upload cycle XML files?",
        a: (
          <>
            <ol className="mb-0">
              <li>Go to <strong>Cycles</strong>.</li>
              <li>Select <strong>Upload</strong>.</li>
              <li>Choose the XML file(s) and submit.</li>
              <li>Once processed, the cycle should appear in the list.</li>
            </ol>
            <div className="mt-2 text-secondary small">
              Tip: If processing fails, include the file name and time of upload when contacting support.
            </div>
          </>
        ),
        tags: ["upload", "xml", "cycles"],
      },
      {
        id: "graphs",
        q: "My graphs are missing / not updating — why?",
        a: (
          <>
            <ul className="mb-0">
              <li>Refresh the page (Ctrl/Cmd + Shift + R) to bypass cache.</li>
              <li>Confirm the cycle finished processing (it can take a moment for large files).</li>
              <li>If you see errors in the UI, include a screenshot in your ticket.</li>
            </ul>
          </>
        ),
        tags: ["graphs", "cache", "refresh"],
      },
      {
        id: "permissions",
        q: "I’m getting a 401/403 error — what does that mean?",
        a: (
          <>
            <p className="mb-2">
              <strong>401</strong> means you are not authenticated (not logged in or session expired).
              <br />
              <strong>403</strong> means you are logged in, but don’t have permission for that action.
            </p>
            <div className="text-secondary small">
              If this seems wrong, raise a ticket and include the page URL and what you were trying to do.
            </div>
          </>
        ),
        tags: ["401", "403", "permissions"],
      },
      {
        id: "files",
        q: "Where are uploaded files stored? Can I download them again?",
        a: (
          <>
            <p className="mb-2">
              Uploaded XML files are stored so they can be re-downloaded later. Use the relevant cycle view to
              download the original file (if enabled for your role).
            </p>
            <div className="text-secondary small">
              If downloads are missing, raise a ticket with the machine/cycle identifier.
            </div>
          </>
        ),
        tags: ["storage", "download", "xml"],
      },
      {
        id: "performance",
        q: "The app feels slow or times out — what can I do?",
        a: (
          <>
            <ul className="mb-0">
              <li>Try reloading the page.</li>
              <li>If it’s only one feature/page, note the steps to reproduce.</li>
              <li>If it’s widespread, check system status (if available) and contact support.</li>
            </ul>
          </>
        ),
        tags: ["slow", "timeout", "performance"],
      },
    ],
    []
  );

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqs;

    return faqs.filter((f) => {
      const hay = `${f.q} ${typeof f.a === "string" ? f.a : ""} ${(f.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [faqs, query]);

  function toggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  function handleFormChange<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openServiceDeskPrefilled() {
    // Basic querystring prefill if your service desk supports it
    // If not, it will still just open the link.
    const subject = encodeURIComponent(form.subject || "BridgePoint support request");
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}\n\n---\nSent from BridgePoint Help page`
    );
    const url = `${SERVICE_DESK_URL}${SERVICE_DESK_URL.includes("?") ? "&" : "?"}subject=${subject}&body=${body}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const canSubmit = form.subject.trim().length > 0 && form.message.trim().length > 0;

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
        <div>
          <h1 className="h3 fw-bold mb-1">Help & Support</h1>
          <div className="text-secondary">
            FAQs, troubleshooting tips, and ways to contact support.
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2">
          <a className="btn btn-primary" href={SERVICE_DESK_URL} target="_blank" rel="noreferrer">
            <i className="bi bi-life-preserver me-2" aria-hidden="true" />
            Open Service Desk
          </a>

          {STATUS_URL ? (
            <a className="btn btn-outline-secondary" href={STATUS_URL} target="_blank" rel="noreferrer">
              <i className="bi bi-activity me-2" aria-hidden="true" />
              System Status
            </a>
          ) : null}

          {USER_GUIDE_URL ? (
            <a className="btn btn-outline-secondary" href={USER_GUIDE_URL} target="_blank" rel="noreferrer">
              <i className="bi bi-file-earmark-text me-2" aria-hidden="true" />
              User Guide
            </a>
          ) : null}

          <a className="btn btn-outline-secondary" href="#contact">
            <i className="bi bi-envelope me-2" aria-hidden="true" />
            Contact
          </a>
        </div>
      </div>

      {/* Search + FAQs */}
      <div className="card border mb-4">
        <div className="card-body">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <div>
              <h2 className="h5 fw-bold mb-1">FAQs</h2>
              <div className="text-secondary small">Search common questions and fixes.</div>
            </div>

            <div className="input-group" style={{ maxWidth: 420 }}>
              <span className="input-group-text">
                <i className="bi bi-search" aria-hidden="true" />
              </span>
              <input
                className="form-control"
                placeholder="Search FAQs…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button className="btn btn-outline-secondary" onClick={() => setQuery("")} type="button">
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="text-secondary">
              No results. Try different keywords, or contact support below.
            </div>
          ) : (
            <div className="accordion" id="helpFaqAccordion">
              {filteredFaqs.map((f) => {
                const isOpen = openId === f.id;
                return (
                  <div className="accordion-item" key={f.id}>
                    <h2 className="accordion-header">
                      <button
                        className={`accordion-button ${isOpen ? "" : "collapsed"}`}
                        type="button"
                        onClick={() => toggle(f.id)}
                      >
                        {f.q}
                      </button>
                    </h2>
                    <div className={`accordion-collapse collapse ${isOpen ? "show" : ""}`}>
                      <div className="accordion-body">{f.a}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Contact / Ticket */}
      <div id="contact" className="card border">
        <div className="card-body">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <div>
              <h2 className="h5 fw-bold mb-1">Contact Support</h2>
              <div className="text-secondary small">
                Raise a ticket with your service desk (recommended), or use the form to prefill details.
              </div>
            </div>

            <a className="btn btn-outline-primary" href={SERVICE_DESK_URL} target="_blank" rel="noreferrer">
              <i className="bi bi-ticket-perforated me-2" aria-hidden="true" />
              Create Ticket
            </a>
          </div>

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label fw-semibold">Name</label>
              <input
                className="form-control"
                value={form.name}
                onChange={(e) => handleFormChange("name", e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold">Email</label>
              <input
                className="form-control"
                value={form.email}
                onChange={(e) => handleFormChange("email", e.target.value)}
                placeholder="you@company.com"
              />
            </div>

            <div className="col-12">
              <label className="form-label fw-semibold">Subject *</label>
              <input
                className="form-control"
                value={form.subject}
                onChange={(e) => handleFormChange("subject", e.target.value)}
                placeholder="Brief summary of the issue"
              />
            </div>

            <div className="col-12">
              <label className="form-label fw-semibold">Message *</label>
              <textarea
                className="form-control"
                value={form.message}
                onChange={(e) => handleFormChange("message", e.target.value)}
                rows={5}
                placeholder="What happened? What were you trying to do? Include machine/cycle IDs and time if possible."
              />
              <div className="form-text">
                Tip: If possible, attach screenshots directly in your service desk ticket.
              </div>
            </div>

            <div className="col-12 d-flex flex-wrap gap-2 justify-content-end">
              <button
                className="btn btn-primary"
                type="button"
                onClick={openServiceDeskPrefilled}
                disabled={!canSubmit}
                title={!canSubmit ? "Please enter a subject and message" : undefined}
              >
                <i className="bi bi-send me-2" aria-hidden="true" />
                Open Service Desk with Details
              </button>

              <a className="btn btn-outline-secondary" href={SERVICE_DESK_URL} target="_blank" rel="noreferrer">
                Open Service Desk
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="text-secondary small mt-3">
        If you’re reporting a bug, please include: page URL, steps to reproduce, and any error message shown.
      </div>
    </div>
  );
}