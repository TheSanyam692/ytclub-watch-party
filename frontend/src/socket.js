import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// Create socket with autoConnect: false so it doesn't connect until we need it.
// This prevents duplicate connections and stale state on hot-reload / StrictMode.
export const socket = io(BACKEND_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});