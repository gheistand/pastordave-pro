// auth.js — loaded on every page.
// Initializes Clerk and exposes helpers used by page-specific scripts.

// CLERK_PUBLISHABLE_KEY is injected at runtime via a <script> tag in each HTML
// page that sets window.CLERK_PUBLISHABLE_KEY before loading this file.

(async function initClerk() {
  if (!window.CLERK_PUBLISHABLE_KEY) {
    console.error('CLERK_PUBLISHABLE_KEY is not set. Check your HTML configuration.');
    return;
  }

  // Clerk's browser SDK is loaded via the <script> tag in each HTML page.
  // Wait for it to be available.
  if (typeof window.Clerk === 'undefined') {
    console.error('Clerk SDK not loaded. Ensure the Clerk <script> tag is present.');
    return;
  }

  await window.Clerk.load();
})();

/**
 * Returns the current Clerk session token, or null if not signed in.
 * Throws if Clerk is not initialized.
 */
async function getSessionToken() {
  if (!window.Clerk) throw new Error('Clerk not initialized');
  const session = window.Clerk.session;
  if (!session) return null;
  return await session.getToken();
}

/**
 * Returns the current Clerk user, or null if not signed in.
 */
function getCurrentUser() {
  if (!window.Clerk) return null;
  return window.Clerk.user ?? null;
}

/**
 * Redirects to index.html if the user is not signed in.
 * Call this at the top of protected pages.
 */
async function requireAuth() {
  await window.Clerk.load();
  if (!window.Clerk.user) {
    window.location.href = '/index.html';
  }
}

/**
 * Renders the Clerk sign-in component into the given DOM element.
 * @param {HTMLElement} mountTarget
 */
function mountSignIn(mountTarget) {
  window.Clerk.mountSignIn(mountTarget, {
    afterSignInUrl: '/app.html',
    afterSignUpUrl: '/app.html',
  });
}

/**
 * Renders the Clerk user button into the given DOM element.
 * @param {HTMLElement} mountTarget
 */
function mountUserButton(mountTarget) {
  window.Clerk.mountUserButton(mountTarget, {
    afterSignOutUrl: '/index.html',
  });
}

// Expose helpers globally so page scripts can use them without a bundler
window.PastorDaveAuth = {
  getSessionToken,
  getCurrentUser,
  requireAuth,
  mountSignIn,
  mountUserButton,
};
