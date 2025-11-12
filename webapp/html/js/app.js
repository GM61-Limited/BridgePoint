console.log("app.js loaded");

const API_BASE_URL = window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : "http://backend:8000";

document.addEventListener('DOMContentLoaded', function() {
  console.log("DOMContentLoaded event fired");

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

      localStorage.setItem("authToken", data.token);

      window.location.href = "app.html";
    } catch (error) {
      alert(`Login failed: ${error.message}`);
    }
  }

  function logout() {
    console.log('Logout button clicked');
    localStorage.removeItem("authToken");
    window.location.href = "index.html";
  }

  function requireLogin() {
    const token = localStorage.getItem("authToken");
    if (!token) {
      window.location.href = "index.html";
    }
  }

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

  async function loadOverviewData() {
    const response = await authFetch(`${API_BASE_URL}/overview`);
    if (response && response.ok) {
      const data = await response.json();
      console.log("Overview data:", data);
    }
  }

  if (window.location.pathname.includes("app.html")) {
    requireLogin();

    const token = localStorage.getItem("authToken");

    function parseJwt(token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
      } catch (e) {
        return null;
      }
    }

    const payload = parseJwt(token);
    if (payload && payload.sub) {
      const usernameElem = document.getElementById('usernameDisplay');
      if (usernameElem) {
        usernameElem.textContent = payload.sub;
      }
    }

    const mainContent = document.getElementById('mainContent');
    const tabs = document.querySelectorAll('.sidebar-tab');
    const logoutButton = document.getElementById('logoutBtn');

    async function loadPage(page) {
      if (!mainContent) return;
      try {
        console.log(`Loading page fragment: ${page}`);
        const response = await fetch(page);
        if (response && response.ok) {
          const html = await response.text();
          mainContent.innerHTML = html;
          console.log(`Successfully loaded page fragment: ${page}`);
        } else {
          mainContent.innerHTML = `<p>Failed to load ${page}</p>`;
          console.log(`Failed to load page fragment: ${page}`);
        }
      } catch (err) {
        mainContent.innerHTML = `<p>Error loading ${page}: ${err.message}</p>`;
        console.log(`Error loading page fragment: ${page}: ${err.message}`);
      }
    }

    const pageMap = {
      homeTab: 'home.html',
      overviewTab: 'overview.html',
      dataTab: 'data.html',
      invoiceTab: 'invoice.html',
      settingsTab: 'settings.html'
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', async function() {
        console.log(`Sidebar tab clicked: ${tab.id}`);
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const page = pageMap[tab.id];
        if (page) {
          await loadPage(page);
        }
      });
    });

    if (logoutButton) {
      logoutButton.addEventListener('click', logout);
    }

    if (tabs.length > 0) {
      tabs.forEach(t => t.classList.remove('active'));
      const homeTab = document.getElementById('homeTab');
      if (homeTab) {
        homeTab.classList.add('active');
      }
      loadPage('home.html').then(() => {
        console.log("Default page (home.html) loaded");
      });
    }
  }

});