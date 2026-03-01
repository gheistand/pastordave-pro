// auth.js — loaded on every page.
// Initializes Clerk and exposes helpers used by page-specific scripts.

async function initClerk() {
  if (!window.CLERK_PUBLISHABLE_KEY) {
    console.error('CLERK_PUBLISHABLE_KEY is not set.');
    return;
  }

  // Wait for Clerk SDK to be available (loaded async)
  let attempts = 0;
  while (typeof window.Clerk === 'undefined' && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  if (typeof window.Clerk === 'undefined') {
    console.error('Clerk SDK failed to load after 5 seconds.');
    return;
  }

  await window.Clerk.load();
  console.log('Clerk initialized successfully');
}

// Start initialization immediately
const clerkReady = initClerk();

async function getSessionToken() {
  await clerkReady;
  const session = window.Clerk?.session;
  if (!session) return null;
  return await session.getToken();
}

function getCurrentUser() {
  return window.Clerk?.user ?? null;
}

async function requireAuth() {
  await clerkReady;
  if (!window.Clerk.user) {
    window.location.href = '/index.html';
  }
}

function mountSignIn(mountTarget) {
  window.Clerk.mountSignIn(mountTarget, {
    afterSignInUrl: '/app.html',
    afterSignUpUrl: '/app.html',
  });
}

function mountUserButton(mountTarget) {
  window.Clerk.mountUserButton(mountTarget, {
    afterSignOutUrl: '/index.html',
  });
}

window.PastorDaveAuth = {
  clerkReady,
  getSessionToken,
  getCurrentUser,
  requireAuth,
  mountSignIn,
  mountUserButton,
};
