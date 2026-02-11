/* auth.js — Token management via localStorage */

(function () {
  'use strict';

  const STORAGE_KEY = 'hydro_journal_token';
  const OWNER_KEY = 'hydro_journal_owner';
  const REPO_KEY = 'hydro_journal_repo';

  const Auth = {
    getToken() {
      return localStorage.getItem(STORAGE_KEY) || '';
    },

    setToken(token) {
      localStorage.setItem(STORAGE_KEY, token.trim());
    },

    clearToken() {
      localStorage.removeItem(STORAGE_KEY);
    },

    getOwner() {
      return localStorage.getItem(OWNER_KEY) || '';
    },

    setOwner(owner) {
      localStorage.setItem(OWNER_KEY, owner.trim());
    },

    getRepo() {
      return localStorage.getItem(REPO_KEY) || 'hydro_journal';
    },

    setRepo(repo) {
      localStorage.setItem(REPO_KEY, repo.trim());
    },

    isConfigured() {
      return !!(this.getToken() && this.getOwner());
    },

    async validate() {
      const token = this.getToken();
      if (!token) return { valid: false, error: 'No token configured' };

      try {
        const res = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
          }
        });

        if (!res.ok) {
          return { valid: false, error: `GitHub returned ${res.status}` };
        }

        const user = await res.json();
        return { valid: true, user: user.login };
      } catch (err) {
        return { valid: false, error: err.message };
      }
    }
  };

  window.Auth = Auth;
})();
