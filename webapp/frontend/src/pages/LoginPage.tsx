
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  // If a protected route sent us here, it stored the original URL in state.from
  const from = (location.state as any)?.from?.pathname || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msUnavailable, setMsUnavailable] = useState(false);

  /** Ensure the background + scoped styles apply while this page is active.
   *  If you already have BodyClassSync in App.tsx doing this globally,
   *  you can delete this effect. Keeping it here is safe and idempotent.
   */
  useEffect(() => {
    document.body.classList.add('login-view');
    return () => {
      document.body.classList.remove('login-view');
    };
  }, []);

  // Redirect after auth flips
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, from, navigate]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const u = username.trim();
    const p = password.trim();
    if (!u || !p) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      await login(u, p);
      // no navigate here; the effect above will handle redirect
    } catch (err: any) {
      const status = err?.response?.status;
      const serverMsg =
        (err?.response?.data &&
          (err.response.data.message ||
           err.response.data.error ||
           err.response.data.detail)) ||
        undefined;

      if (status === 401) {
        setError('Invalid credentials');
      } else if (serverMsg) {
        setError(serverMsg);
      } else if (err?.message?.toLowerCase().includes('network')) {
        setError('Network error: check Nginx proxy (/api) and backend reachability.');
      } else {
        setError(`Login failed: ${err?.message ?? 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleMicrosoftLogin() {
    setError("Sorry, Microsoft sign-in isn't available at this time.");
    setMsUnavailable(true);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo from /public/images */}
        <img
          src="/images/bridgepointAlt.png"
          alt="BridgePoint"
          style={{ display: 'block', margin: '0 auto 20px', maxWidth: 150 }}
        />

        <h1>BridgePoint</h1>

        <form
          id="loginForm"
          onSubmit={handleLogin}
          aria-describedby={error ? 'login-error' : undefined}
        >
          <input
            type="text"
            id="username"
            placeholder="Username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            id="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error && (
            <div
              id="login-error"
              className="error"
              role="alert"
              aria-live="polite"
              style={{ marginTop: 8 }}
            >
              {error}
            </div>
          )}

          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <div className="divider">
          <span>or</span>
        </div>

        <div className="social-buttons">
          <button
            id="microsoftLogin"
            type="button"
            onClick={handleMicrosoftLogin}
            aria-label="Sign in with Microsoft"
            disabled={msUnavailable}
            title={msUnavailable ? "Microsoft sign-in isn't available right now" : undefined}
            style={{
              backgroundColor: '#2F2F2F',
              color: 'white',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              opacity: msUnavailable ? 0.6 : 1,
              cursor: msUnavailable ? 'not-allowed' : 'pointer',
            }}
          >
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
              alt="Microsoft"
              style={{ width: 22, height: 22 }}
            />
            <span>Sign in with Microsoft</span>
          </button>
        </div>

        <img
          src="/images/GM61Alt2.png"
          alt="GM61"
          style={{ display: 'block', margin: '30px auto 20px', maxWidth: 175 }}
        />
      </div>
    </div>
  );
}
