// Backend base URL (works locally and in Docker)
const API_BASE_URL = window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : "http://backend:8000";

// --------- Login Function ---------
async function loginUser(event) {
  if (event) event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    alert("Please enter both username and password.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (response.status === 401) {
      alert("Invalid credentials");
      return;
    }

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    // Store auth token in localStorage
    localStorage.setItem("authToken", data.token);

    // Redirect to SPA
    window.location.href = "app.html";
  } catch (error) {
    alert(`Login failed: ${error.message}`);
  }
}

// --------- Logout Function ---------
function logout() {
  localStorage.removeItem("authToken");
  window.location.href = "index.html";
}

// --------- Require Login ---------
function requireLogin() {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "index.html";
  }
}

// --------- Authenticated Fetch Helper ---------
async function authFetch(url, options = {}) {
  const token = localStorage.getItem("authToken");
  if (!token) {
    alert("Session expired. Please log in again.");
    logout();
    return;
  }

  options.headers = {
    ...options.headers,
    "Authorization": `Bearer ${token}`
  };

  try {
    const response = await fetch(url, options);
    if (response.status === 401) {
      alert("Session expired or unauthorized. Redirecting to login.");
      logout();
      return;
    }
    return response;
  } catch (err) {
    alert(`Request failed: ${err.message}`);
  }
}

// --------- SPA Tab Fetch Example ---------
// Example usage for fetching overview data
async function loadOverviewData() {
  const response = await authFetch(`${API_BASE_URL}/overview`);
  if (response && response.ok) {
    const data = await response.json();
    console.log("Overview data:", data);
    // Populate SPA widgets here
  }
}

// Call requireLogin automatically on SPA pages
if (window.location.pathname.includes("app.html")) {
  requireLogin();
}