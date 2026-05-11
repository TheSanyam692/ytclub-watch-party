import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import "../App.css";

function Home() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);

  const createRoom = () => {
    if (!username.trim()) { setError("Enter your name first"); return; }
    setError("");
    setLoading("create");
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTimeout(() => {
      navigate(`/room/${roomId}`, { state: { username: username.trim() } });
    }, 600);
  };

  const openJoinModal = () => {
    if (!username.trim()) { setError("Enter your name first"); return; }
    setError("");
    setShowJoinModal(true);
  };

  const joinRoom = () => {
    if (!roomInput.trim()) { setError("Enter a room code"); return; }
    setError("");
    setLoading("join");
    setTimeout(() => {
      navigate(`/room/${roomInput.trim()}`, { state: { username: username.trim() } });
    }, 600);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      {/* Subtle glow blobs */}
      <div style={{ position: "fixed", top: "-100px", left: "-100px", width: "500px", height: "500px", background: "radial-gradient(circle, rgba(109,40,217,0.07) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "-100px", right: "-100px", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "420px" }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg, #7c3aed, #a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
              🎬
            </div>
            <span style={{ fontSize: "24px", fontWeight: 800, background: "linear-gradient(135deg, #a78bfa, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              YTClub
            </span>
          </div>
          <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: "10px" }}>
            Watch Together.<br />
            <span style={{ background: "linear-gradient(135deg, #a78bfa, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Feel Together.
            </span>
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px" }}>
            Create a room, share the code, sync YouTube with friends.
          </p>
        </div>

        {/* Card */}
        <div style={{ background: "#16161d", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "18px", padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "10px 16px", color: "#f87171", fontSize: "13px", marginBottom: "16px", textAlign: "center", overflow: "hidden" }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Name input */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
              Your Display Name
            </label>
            <input
              id="username-input"
              type="text"
              placeholder="Enter your name..."
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
              className="input-premium"
              style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", fontSize: "14px" }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <motion.button
              id="create-room-btn"
              onClick={createRoom}
              disabled={!!loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="btn-primary"
              style={{ width: "100%", padding: "14px", borderRadius: "12px", color: "#fff", fontWeight: 700, fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", opacity: loading ? 0.5 : 1 }}
            >
              {loading === "create" ? (
                <div className="spinner" />
              ) : (
                <>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
              className="btn-secondary"
              style={{ width: "100%", padding: "14px", borderRadius: "12px", color: "#a78bfa", fontWeight: 700, fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", opacity: loading ? 0.5 : 1 }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Join Room
            </motion.button>
          </div>

          {/* Features row */}
          <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {[{ dot: "#10b981", label: "No sign-up" }, { dot: "#818cf8", label: "Real-time sync" }, { dot: "#a78bfa", label: "Instant rooms" }].map(f => (
              <span key={f.label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#6b7280", fontWeight: 500 }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: f.dot, flexShrink: 0 }} />
                {f.label}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Join Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowJoinModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              style={{ background: "#16161d", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "18px", padding: "32px", width: "100%", maxWidth: "360px", position: "relative", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
            >
              <button
                onClick={() => setShowJoinModal(false)}
                style={{ position: "absolute", top: "14px", right: "14px", width: "30px", height: "30px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#9ca3af", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}
              >✕</button>

              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>🚀</div>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>Join a Room</h2>
                <p style={{ color: "#6b7280", fontSize: "13px" }}>Enter the room code shared by your friend</p>
              </div>

              <input
                id="modal-room-code-input"
                type="text"
                placeholder="ROOM CODE"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                autoFocus
                className="input-premium"
                style={{ width: "100%", padding: "14px 16px", borderRadius: "10px", fontSize: "18px", fontFamily: "monospace", letterSpacing: "0.25em", textAlign: "center", marginBottom: "14px" }}
              />

              <motion.button
                id="modal-join-btn"
                onClick={joinRoom}
                disabled={!!loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="btn-primary"
                style={{ width: "100%", padding: "13px", borderRadius: "12px", color: "#fff", fontWeight: 700, fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", opacity: loading ? 0.5 : 1 }}
              >
                {loading === "join" ? <div className="spinner" /> : "Enter Room →"}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Home;