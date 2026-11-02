/**
 * Name of the cookie (and legacy localStorage key) holding the sidebar's open
 * state. Lives outside the 'use client' context module so the root layout (a
 * Server Component) can import the real string rather than a client reference.
 */
export const SIDEBAR_OPEN_COOKIE = 'sidebarOpen'
