import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import YouTube from "react-youtube";
import { motion, AnimatePresence } from "framer-motion";
import "../App.css";

function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState(location.state?.username || "");
  const [showNameModal, setShowNameModal] = useState(!location.state?.username);
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [urlInput, setUrlInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);

  const playerRef = useRef(null);
  const suppressEvents = useRef(false);
  const toastId = useRef(0);
  const hasJoined = useRef(false);
  const isHostRef = useRef(false);

  // ─── HELPERS ───
  const extractVideoId = (url) => {
    if (!url) return null;
    // Robust extraction for all YouTube URL variants
    const patterns = [
      /(?:v=|v\/|vi=|vi\/|embed\/|shorts\/|e\/|watch\?v=|[?&]v=)([^#&?]*).*/,
      /(?:youtu\.be\/)([^#&?]*).*/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m && m[1]) return m[1];
    }
    // Final fallback for raw IDs
    if (url.length === 11) return url;
    return null;
  };

  const addToast = useCallback((message, type = "info") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // ─── SOCKET SETUP ───
  useEffect(() => {
    if (!username || showNameModal) return;
    if (hasJoined.current) return;
    hasJoined.current = true;

    if (!socket.connected) socket.connect();

    const doJoin = () => {
      socket.emit("join_room", { roomId, username });
    };

    if (socket.connected) doJoin();
    else socket.once("connect", doJoin);

    const fallbackTimer = setTimeout(() => setIsConnecting(false), 8000);

    const onRoomUsers = (updatedUsers) => {
      setUsers(updatedUsers);
      setIsConnecting(false);
      clearTimeout(fallbackTimer);
      const me = updatedUsers.find((u) => u.id === socket.id);
      isHostRef.current = me?.role === "Host";
    };

    const onRoomData = (data) => {
      setIsConnecting(false);
      clearTimeout(fallbackTimer);
      if (data.videoUrl) {
        const id = extractVideoId(data.videoUrl);
        if (id) setCurrentVideoId(id);
      }
      if (data.currentTime && playerRef.current) {
        setTimeout(() => playerRef.current?.seekTo(data.currentTime, true), 500);
      }
    };

    const onVideoLoaded = (data) => {
      const url = typeof data === "string" ? data : data?.videoUrl;
      const id = extractVideoId(url);
      if (id) {
        setCurrentVideoId(id);
        addToast("New video loaded!", "info");
      }
    };

    const onVideoPlayed = ({ currentTime }) => {
      suppressEvents.current = true;
      if (playerRef.current) {
        playerRef.current.seekTo(currentTime, true);
        playerRef.current.playVideo();
      }
      setTimeout(() => { suppressEvents.current = false; }, 800);
    };

    const onVideoPaused = ({ currentTime }) => {
      suppressEvents.current = true;
      if (playerRef.current) {
        playerRef.current.seekTo(currentTime, true);
        playerRef.current.pauseVideo();
      }
      setTimeout(() => { suppressEvents.current = false; }, 800);
    };

    const onVideoSeeked = ({ currentTime }) => {
      suppressEvents.current = true;
      if (playerRef.current) playerRef.current.seekTo(currentTime, true);
      setTimeout(() => { suppressEvents.current = false; }, 800);
    };

    const onToast = ({ message, type }) => addToast(message, type);
    const onRemoved = () => navigate("/");
    const onDisconnect = () => addToast("Reconnecting to server...", "warning");

    socket.on("room_users", onRoomUsers);
    socket.on("room_data", onRoomData);
    socket.on("video_loaded", onVideoLoaded);
    socket.on("video_played", onVideoPlayed);
    socket.on("video_paused", onVideoPaused);
    socket.on("video_seeked", onVideoSeeked);
    socket.on("toast", onToast);
    socket.on("removed_from_room", onRemoved);
    socket.on("disconnect", onDisconnect);

    return () => {
      clearTimeout(fallbackTimer);
      hasJoined.current = false;
      socket.off("room_users", onRoomUsers);
      socket.off("room_data", onRoomData);
      socket.off("video_loaded", onVideoLoaded);
      socket.off("video_played", onVideoPlayed);
      socket.off("video_paused", onVideoPaused);
      socket.off("video_seeked", onVideoSeeked);
      socket.off("toast", onToast);
      socket.off("removed_from_room", onRemoved);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", doJoin);
    };
  }, [roomId, username, showNameModal, navigate, addToast]);

  const currentUser = users.find((u) => u.id === socket.id);
  const isHost = currentUser?.role === "Host";
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // ─── ACTIONS ───
  const handleLoadVideo = (customUrl = null) => {
    const url = customUrl || urlInput;
    const id = extractVideoId(url);
    if (!id) { addToast("Invalid YouTube URL or ID", "error"); return; }
    socket.emit("load_video", { roomId, videoUrl: url.trim() });
    setUrlInput("");
    addToast("Loading video...", "info");
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    addToast("Room code copied!", "info");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContextAction = (action, userId) => {
    setContextMenu(null);
    if (action === "remove") socket.emit("remove_user", { roomId, userId });
    else if (action === "mute") socket.emit("mute_user", { roomId, userId });
    else if (action === "transfer") socket.emit("transfer_host", { roomId, userId });
  };

  const handlePlayerStateChange = (e) => {
    if (!isHostRef.current || suppressEvents.current) return;
    const time = playerRef.current?.getCurrentTime() || 0;
    if (e.data === 1) socket.emit("play_video", { roomId, currentTime: time });
    else if (e.data === 2) socket.emit("pause_video", { roomId, currentTime: time });
  };

  const playerOpts = {
    width: "100%",
    height: "100%",
    playerVars: { autoplay: 1, modestbranding: 1, rel: 0, origin: window.location.origin },
  };

  // ─── RENDER MODALS ───
  if (showNameModal) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="noise-overlay" />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 glass-card-glow p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-3">
              <span className="text-xl">👤</span>
            </div>
            <h2 className="text-xl font-bold text-white">Join Room</h2>
            <p className="text-gray-500 text-sm mt-1">Enter your name to continue</p>
          </div>
          <input type="text" placeholder="Your vibe name..."
            value={username} onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && username.trim() && setShowNameModal(false)}
            autoFocus className="input-premium w-full px-5 py-3.5 rounded-xl outline-none text-white text-[15px] font-medium mb-4" />
          <motion.button whileTap={{ scale: 0.98 }}
            onClick={() => username.trim() && setShowNameModal(false)}
            className="btn-primary w-full text-white px-6 py-3.5 rounded-xl font-bold text-[15px]">
            Enter Room
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="noise-overlay" />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 text-center">
          <div className="spinner-lg mx-auto mb-5" />
          <p className="text-gray-400 font-medium">Connecting to room...</p>
          <p className="text-gray-600 text-sm mt-1">Room <code className="text-purple-400 font-mono">{roomId}</code></p>
        </motion.div>
      </div>
    );
  }

  // ─── MAIN ROOM ───
  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col" onClick={() => setContextMenu(null)}>
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" /><div className="noise-overlay" />

      {/* TOASTS */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className={`px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-xl border whitespace-nowrap ${
                t.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400"
                : t.type === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-white/5 border-white/10 text-gray-300"
              }`}>
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* HEADER */}
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="relative z-10 border-b border-white/[0.05] px-4 sm:px-6 py-3 bg-black/20 backdrop-blur-xl shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <span className="text-lg">🎬</span>
            <span className="text-lg font-bold gradient-text">YTClub</span>
          </button>
          <div className="flex items-center gap-2.5">
            <button onClick={handleCopyCode}
              className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.07] px-3.5 py-2 rounded-xl transition-all duration-300 group">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Room</span>
              <code className="text-sm font-mono text-purple-400 tracking-wider">{roomId}</code>
              <span className="text-gray-600 group-hover:text-purple-400 transition-colors text-xs">{copied ? "✓" : "⧉"}</span>
            </button>
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.07] px-3 py-2 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm text-gray-400 font-medium">{users.length}</span>
            </div>
          </div>
        </div>
      </motion.header>

      {/* CONTENT */}
      <div className="relative z-10 flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 overflow-y-auto">
        <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">

          {/* PLAYER SECTION */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }} className="flex-[2] min-w-0 flex flex-col gap-4">

            <div className="glass-card overflow-hidden flex-1 flex flex-col min-h-[300px]">
              {currentVideoId ? (
                <div className="player-wrapper flex-1">
                  <YouTube
                    videoId={currentVideoId}
                    opts={playerOpts}
                    onReady={(e) => { playerRef.current = e.target; }}
                    onStateChange={handlePlayerStateChange}
                    className="absolute inset-0 w-full h-full"
                    iframeClassName="w-full h-full rounded-xl"
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 3, repeat: Infinity }}
                    className="w-20 h-20 rounded-3xl bg-gradient-to-br from-red-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center mb-6">
                    <span className="text-4xl">🍿</span>
                  </motion.div>
                  <h3 className="text-2xl font-bold text-white mb-2">Ready for the Show?</h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-8">
                    {isHost
                      ? "Paste a YouTube link below to start watching with your club."
                      : "Waiting for the host to pick a video. Hang tight!"}
                  </p>

                  {isHost && (
                    <div className="w-full max-w-lg space-y-4">
                      <div className="flex gap-2 p-1.5 bg-white/[0.03] border border-white/10 rounded-2xl focus-within:border-purple-500/50 transition-all">
                        <input
                          type="text"
                          placeholder="Paste YouTube link here..."
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
                          className="flex-1 bg-transparent border-none outline-none px-4 text-white text-sm"
                        />
                        <button
                          onClick={() => handleLoadVideo()}
                          className="btn-primary px-6 py-2.5 rounded-xl text-white font-bold text-sm"
                        >
                          Load Video
                        </button>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        <span className="text-[10px] text-gray-600 uppercase font-bold tracking-widest w-full mb-1">Suggestions</span>
                        <button onClick={() => handleLoadVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-[10px] text-gray-400 hover:bg-white/10 transition-all">Music Video</button>
                        <button onClick={() => handleLoadVideo("https://www.youtube.com/watch?v=lTRiuFIWV54")} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-[10px] text-gray-400 hover:bg-white/10 transition-all">Lo-Fi Beats</button>
                        <a href="https://www.youtube.com" target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/10 text-[10px] text-red-400 hover:bg-red-500/20 transition-all font-bold">Open YouTube ↗</a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Controls */}
            {currentVideoId && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-4 glass-card">
                {isHost ? (
                  <>
                    <button onClick={() => { suppressEvents.current = true; playerRef.current?.playVideo(); socket.emit("play_video", { roomId, currentTime: playerRef.current?.getCurrentTime() || 0 }); setTimeout(() => { suppressEvents.current = false; }, 800); }}
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all">▶</button>
                    <button onClick={() => { suppressEvents.current = true; playerRef.current?.pauseVideo(); socket.emit("pause_video", { roomId, currentTime: playerRef.current?.getCurrentTime() || 0 }); setTimeout(() => { suppressEvents.current = false; }, 800); }}
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all">⏸</button>
                    <button onClick={() => { const t = playerRef.current?.getCurrentTime() || 0; playerRef.current?.seekTo(Math.max(0, t - 10), true); socket.emit("seek_video", { roomId, currentTime: Math.max(0, t - 10) }); }}
                      className="px-3 py-2 rounded-xl bg-white/5 text-xs text-gray-400 hover:text-white transition-all">-10s</button>
                    <button onClick={() => { const t = playerRef.current?.getCurrentTime() || 0; playerRef.current?.seekTo(t + 10, true); socket.emit("seek_video", { roomId, currentTime: t + 10 }); }}
                      className="px-3 py-2 rounded-xl bg-white/5 text-xs text-gray-400 hover:text-white transition-all">+10s</button>
                    <div className="w-[1px] h-6 bg-white/10 mx-2" />
                    <input
                      type="text"
                      placeholder="Load new video..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
                      className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-purple-500/50"
                    />
                  </>
                ) : (
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span>Live Synced with {users.find(u => u.role === 'Host')?.username || 'Host'}</span>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* SIDEBAR */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }} className="w-full lg:w-80 shrink-0">
            <div className="glass-card p-5 sticky top-0">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">The Club</h2>
                <span className="text-[10px] bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full font-black">{users.length}</span>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {users.map((user, i) => (
                  <motion.div key={user.id}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-2 rounded-2xl hover:bg-white/[0.03] transition-all group relative"
                    onContextMenu={(e) => {
                      if (isHost && user.id !== socket.id) {
                        e.preventDefault();
                        setContextMenu({ userId: user.id, x: e.clientX, y: e.clientY, username: user.username });
                      }
                    }}>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 ${user.role === "Host" ? "avatar-host" : "avatar-viewer"}`}>
                      {user.username?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white font-bold truncate block">
                        {user.username}
                        {user.id === socket.id && <span className="text-gray-500 ml-2 font-normal text-[10px] opacity-60">You</span>}
                      </span>
                      <p className="text-[10px] text-gray-500 font-medium">
                        {user.role === "Host" ? "👑 Club Host" : "👤 Member"}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-8 p-6 rounded-3xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.05] text-center">
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mb-4">Invite Others</p>
                <button onClick={handleCopyCode} className="btn-secondary w-full py-3 rounded-2xl text-xs font-bold text-white mb-2">
                  {copied ? "✓ Copied!" : "Copy Room Link"}
                </button>
                <p className="text-[9px] text-gray-600">Share this code with your friends to watch together.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* CONTEXT MENU */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="context-menu fixed z-50 py-2 w-48"
            style={{ top: contextMenu.y, left: Math.min(contextMenu.x, window.innerWidth - 200) }}>
            <div className="px-4 py-2 text-[10px] text-gray-500 font-black uppercase tracking-widest">{contextMenu.username}</div>
            <button onClick={() => handleContextAction("transfer", contextMenu.userId)} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/5 transition-all">Make Host</button>
            <button onClick={() => handleContextAction("mute", contextMenu.userId)} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/5 transition-all">Mute</button>
            <div className="my-1 border-t border-white/5" />
            <button onClick={() => handleContextAction("remove", contextMenu.userId)} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-all">Remove</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Room;