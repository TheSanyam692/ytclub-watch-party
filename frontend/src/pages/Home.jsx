import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import "../App.css";

function Home() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [loading, setLoading] = useState(null); // 'create' | 'join' | null
  const [error, setError] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);

  const createRoom = () => {
    if (!username.trim()) {
      setError("Enter your vibe name first");
      return;
    }
    setError("");
    setLoading("create");
    const roomId = Math.random().toString(36).substring(2, 8);
    setTimeout(() => {
      navigate(`/room/${roomId}`, { state: { username: username.trim() } });
    }, 600);
  };

  const openJoinModal = () => {
    if (!username.trim()) {
      setError("Enter your vibe name first");
      return;
    }
    setError("");
    setShowJoinModal(true);
  };

  const joinRoom = () => {
    if (!roomInput.trim()) {
      setError("Enter a room code");
      return;
    }
    setError("");
    setLoading("join");
    setTimeout(() => {
      navigate(`/room/${roomInput.trim()}`, { state: { username: username.trim() } });
    }, 600);
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-8">
      {/* Floating orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="noise-overlay" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo & Branding */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-purple-500/20 border border-red-500/20 mb-5"
          >
            <span className="text-3xl">🎬</span>
          </motion.div>

          <h1 className="text-6xl sm:text-7xl font-black gradient-text mb-4 tracking-tighter leading-none">
            YTClub
          </h1>

          <p className="gradient-text-subtle text-base sm:text-lg font-light tracking-wide">
            Watch together. Feel together.
          </p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="glass-card-glow p-7 sm:p-9"
        >
          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/15 text-red-400 text-sm text-center overflow-hidden"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Username Input */}
          <div className="mb-7">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2.5 ml-1">
              Your Vibe Name
            </label>
            <input
              id="username-input"
              type="text"
              placeholder="Enter your vibe name..."
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              className="input-premium w-full px-5 py-3.5 rounded-xl outline-none text-white text-[15px] font-medium"
            />
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <motion.button
              id="create-room-btn"
              onClick={createRoom}
              disabled={!!loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="btn-primary w-full text-white px-6 py-4 rounded-xl font-bold text-[15px] tracking-wide disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
            >
              {loading === "create" ? (
                <div className="spinner" />
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create Room
                </>
              )}
            </motion.button>

            <motion.button
              id="join-room-trigger-btn"
              onClick={openJoinModal}
              disabled={!!loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="btn-secondary w-full text-white px-6 py-4 rounded-xl font-bold text-[15px] tracking-wide disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Join Room
            </motion.button>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-center mt-8"
        >
          <div className="flex items-center justify-center gap-6 text-[11px] text-gray-600 font-medium tracking-wide">
            <span className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-green-500/60" />
              No sign-up
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-blue-500/60" />
              Real-time sync
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-purple-500/60" />
              Instant rooms
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* ─── JOIN ROOM MODAL ─── */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-backdrop"
            onClick={(e) => { if (e.target === e.currentTarget) setShowJoinModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-card-glow p-7 w-full max-w-sm relative"
            >
              <button
                onClick={() => setShowJoinModal(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
              >
                ✕
              </button>

              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-3">
                  <span className="text-xl">🚀</span>
                </div>
                <h2 className="text-xl font-bold text-white">Join a Room</h2>
                <p className="text-gray-500 text-sm mt-1">Enter the room code shared by your friend</p>
              </div>

              <input
                id="modal-room-code-input"
                type="text"
                placeholder="Paste room code..."
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                autoFocus
                className="input-premium w-full px-5 py-3.5 rounded-xl outline-none text-white text-center text-lg font-mono tracking-[0.3em] mb-4"
              />

              <motion.button
                id="modal-join-btn"
                onClick={joinRoom}
                disabled={!!loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="btn-primary w-full text-white px-6 py-3.5 rounded-xl font-bold text-[15px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading === "join" ? (
                  <div className="spinner" />
                ) : (
                  "Enter Room"
                )}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Home;