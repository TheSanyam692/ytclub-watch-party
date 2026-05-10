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
  const [isPlaying, setIsPlaying] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const playerRef = useRef(null);
  const suppressEvents = useRef(false);
  const toastId = useRef(0);

  const extractVideoId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
      /(?:youtu\.be\/)([^?\s]+)/,
      /(?:youtube\.com\/embed\/)([^?\s]+)/,
      /(?:youtube\.com\/shorts\/)([^?\s]+)/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const addToast = useCallback((message, type = "info") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // Socket setup
  useEffect(() => {
    if (!username || showNameModal) return;

    socket.emit("join_room", { roomId, username });

    const onRoomUsers = (u) => { setUsers(u); setIsConnecting(false); };
    const onRoomData = (data) => {
      if (data.videoUrl) {
        const id = extractVideoId(data.videoUrl);
        if (id) setCurrentVideoId(id);
      }
      setIsPlaying(data.isPlaying || false);
      if (data.currentTime && playerRef.current) {
        playerRef.current.seekTo(data.currentTime, true);
      }
    };
    const onVideoLoaded = (data) => {
      const id = extractVideoId(data.videoUrl);
      if (id) setCurrentVideoId(id);
      setIsPlaying(true);
    };
    const onVideoPlayed = ({ currentTime }) => {
      suppressEvents.current = true;
      if (playerRef.current) {
        playerRef.current.seekTo(currentTime, true);
        playerRef.current.playVideo();
      }
      setIsPlaying(true);
      setTimeout(() => { suppressEvents.current = false; }, 500);
    };
    const onVideoPaused = ({ currentTime }) => {
      suppressEvents.current = true;
      if (playerRef.current) {
        playerRef.current.seekTo(currentTime, true);
        playerRef.current.pauseVideo();
      }
      setIsPlaying(false);
      setTimeout(() => { suppressEvents.current = false; }, 500);
    };
    const onVideoSeeked = ({ currentTime }) => {
      suppressEvents.current = true;
      if (playerRef.current) playerRef.current.seekTo(currentTime, true);
      setTimeout(() => { suppressEvents.current = false; }, 500);
    };
    const onToast = ({ message, type }) => addToast(message, type);
    const onRemoved = () => {
      navigate("/");
    };

    socket.on("room_users", onRoomUsers);
    socket.on("room_data", onRoomData);
    socket.on("video_loaded", onVideoLoaded);
    socket.on("video_played", onVideoPlayed);
    socket.on("video_paused", onVideoPaused);
    socket.on("video_seeked", onVideoSeeked);
    socket.on("toast", onToast);
    socket.on("removed_from_room", onRemoved);

    return () => {
      socket.off("room_users", onRoomUsers);
      socket.off("room_data", onRoomData);
      socket.off("video_loaded", onVideoLoaded);
      socket.off("video_played", onVideoPlayed);
      socket.off("video_paused", onVideoPaused);
      socket.off("video_seeked", onVideoSeeked);
      socket.off("toast", onToast);
      socket.off("removed_from_room", onRemoved);
    };
  }, [roomId, username, showNameModal, navigate, addToast]);

  const currentUser = users.find((u) => u.id === socket.id);
  const isHost = currentUser?.role === "Host";

  const handleLoadVideo = () => {
    const id = extractVideoId(urlInput);
    if (!id) { addToast("Invalid YouTube URL", "error"); return; }
    socket.emit("load_video", { roomId, videoUrl: urlInput.trim() });
    setUrlInput("");
  };

  const handlePlay = () => {
    if (!isHost || suppressEvents.current) return;
    const time = playerRef.current?.getCurrentTime() || 0;
    socket.emit("play_video", { roomId, currentTime: time });
  };

  const handlePause = () => {
    if (!isHost || suppressEvents.current) return;
    const time = playerRef.current?.getCurrentTime() || 0;
    socket.emit("pause_video", { roomId, currentTime: time });
  };

  const handleSeek = () => {
    if (!isHost || suppressEvents.current) return;
    const time = playerRef.current?.getCurrentTime() || 0;
    socket.emit("seek_video", { roomId, currentTime: time });
  };

  const handlePlayerStateChange = (e) => {
    if (suppressEvents.current) return;
    const state = e.data;
    if (state === 1) handlePlay();
    else if (state === 2) handlePause();
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

  const playerOpts = {
    width: "100%",
    height: "100%",
    playerVars: { autoplay: 1, modestbranding: 1, rel: 0 },
  };

  // ─── NAME MODAL ───
  if (showNameModal) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="noise-overlay" />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 glass-card-glow p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-3"><span className="text-xl">👤</span></div>
            <h2 className="text-xl font-bold text-white">Join Room</h2>
            <p className="text-gray-500 text-sm mt-1">Enter your name to continue</p>
          </div>
          <input id="modal-username-input" type="text" placeholder="Your vibe name..." value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && username.trim() && setShowNameModal(false)}
            autoFocus className="input-premium w-full px-5 py-3.5 rounded-xl outline-none text-white text-[15px] font-medium mb-4" />
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => username.trim() && setShowNameModal(false)}
            className="btn-primary w-full text-white px-6 py-3.5 rounded-xl font-bold text-[15px]">Enter Room</motion.button>
          <button onClick={() => navigate("/")} className="w-full mt-3 text-gray-600 hover:text-gray-400 text-sm transition-colors">← Back to Home</button>
        </motion.div>
      </div>
    );
  }

  // ─── LOADING ───
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
      <div className="fixed top-4 left-1/2 z-[60] flex flex-col gap-2 items-center">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: -16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}
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
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 border-b border-white/[0.05] px-4 sm:px-6 py-3 bg-black/20 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5 group">
            <span className="text-lg">🎬</span>
            <span className="text-lg font-bold gradient-text">YTClub</span>
          </button>
          <div className="flex items-center gap-2.5">
            <button id="copy-room-code-btn" onClick={handleCopyCode}
              className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.07] px-3.5 py-2 rounded-xl transition-all duration-300 group">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Room</span>
              <code className="text-sm font-mono text-purple-400 tracking-wider">{roomId}</code>
              <span className="text-gray-600 group-hover:text-purple-400 transition-colors text-xs ml-0.5">{copied ? "✓" : "⧉"}</span>
            </button>
            {currentVideoId && (
              <div className="hidden sm:flex items-center gap-2 bg-red-500/8 border border-red-500/15 px-3 py-2 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-red-500" style={{ animation: "live-pulse 2s infinite" }} />
                <span className="text-[10px] text-red-400 uppercase tracking-widest font-bold">Live Synced</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.07] px-3 py-2 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm text-gray-400 font-medium">{users.length}</span>
            </div>
          </div>
        </div>
      </motion.header>

      {/* CONTENT */}
      <div className="relative z-10 flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row gap-5 h-full">

          {/* PLAYER */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex-1 min-w-0 flex flex-col">
            {isHost && (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input id="video-url-input" type="text" placeholder="Paste YouTube URL to load for everyone..."
                    value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
                    className="input-premium flex-1 px-4 py-3 rounded-xl outline-none text-white text-sm" />
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleLoadVideo}
                    className="btn-primary text-white px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg>
                    Load
                  </motion.button>
                </div>
              </div>
            )}

            <div className="glass-card overflow-hidden flex-1">
              {currentVideoId ? (
                <div className="player-wrapper">
                  <YouTube videoId={currentVideoId} opts={playerOpts}
                    onReady={(e) => { playerRef.current = e.target; if (!isHost) { e.target.seekTo(0, true); } }}
                    onStateChange={handlePlayerStateChange}
                    className="absolute inset-0 w-full h-full" iframeClassName="w-full h-full rounded-xl" />
                </div>
              ) : (
                <div className="aspect-video flex flex-col items-center justify-center text-center p-8">
                  <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 3, repeat: Infinity }}
                    className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/10 to-purple-500/10 border border-white/[0.05] flex items-center justify-center mb-5">
                    <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </motion.div>
                  <h3 className="text-base font-semibold text-gray-400 mb-1">No Video Playing</h3>
                  <p className="text-sm text-gray-600 max-w-xs">
                    {isHost ? "Paste a YouTube URL above to start the session" : "Waiting for the host to load a video..."}
                  </p>
                </div>
              )}
            </div>

            {/* HOST CONTROLS */}
            {isHost && currentVideoId && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2">
                <button onClick={() => { if (playerRef.current) { playerRef.current.playVideo(); }}} className="control-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 bg-white/[0.03] border border-white/[0.06]">▶ Play</button>
                <button onClick={() => { if (playerRef.current) { playerRef.current.pauseVideo(); }}} className="control-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 bg-white/[0.03] border border-white/[0.06]">⏸ Pause</button>
                <button onClick={() => { if (playerRef.current) { const t = playerRef.current.getCurrentTime(); playerRef.current.seekTo(Math.max(0, t - 10), true); handleSeek(); }}}
                  className="control-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 bg-white/[0.03] border border-white/[0.06]">-10s</button>
                <button onClick={() => { if (playerRef.current) { const t = playerRef.current.getCurrentTime(); playerRef.current.seekTo(t + 10, true); handleSeek(); }}}
                  className="control-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 bg-white/[0.03] border border-white/[0.06]">+10s</button>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5 text-[10px] text-gray-600 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Synced · {users.length} viewer{users.length !== 1 ? "s" : ""}
                </div>
              </motion.div>
            )}
            {!isHost && currentVideoId && (
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>Synced with host · Playback controlled by host</span>
              </div>
            )}
          </motion.div>

          {/* SIDEBAR */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="w-full lg:w-72 xl:w-80 shrink-0 flex flex-col gap-4">
            <div className="glass-card p-5 flex-1">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em]">Participants</h2>
                <span className="text-[10px] bg-white/[0.05] text-gray-500 px-2.5 py-1 rounded-full font-bold">{users.length}</span>
              </div>
              <div className="space-y-1">
                {users.map((user, i) => (
                  <motion.div key={user.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="participant-item flex items-center gap-3 px-3 py-2.5 cursor-default relative"
                    onContextMenu={(e) => { if (isHost && user.id !== socket.id) { e.preventDefault(); setContextMenu({ userId: user.id, x: e.clientX, y: e.clientY, username: user.username }); } }}>
                    <div className={`online-dot w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${user.role === "Host" ? "avatar-host" : "avatar-viewer"}`}>
                      {user.username?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white font-medium truncate block">
                        {user.username}
                        {user.id === socket.id && <span className="text-gray-600 ml-1.5 text-[10px] font-normal">(you)</span>}
                      </span>
                      {user.isMuted && <span className="text-[10px] text-amber-500">🔇 Muted</span>}
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full shrink-0 ${user.role === "Host" ? "badge-host" : "badge-viewer"}`}>
                      {user.role === "Host" ? "👑 Host" : "👤 Viewer"}
                    </span>
                  </motion.div>
                ))}
              </div>
              {users.length === 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="mt-5 p-4 rounded-xl bg-white/[0.02] border border-dashed border-white/[0.06] text-center">
                  <p className="text-xs text-gray-600 mb-2">Invite friends to this room</p>
                  <button onClick={handleCopyCode} className="text-xs text-purple-400 hover:text-purple-300 transition-colors font-semibold">Copy Room Code →</button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* CONTEXT MENU */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="context-menu fixed z-50 py-2 w-48" style={{ top: contextMenu.y, left: Math.min(contextMenu.x, window.innerWidth - 200) }}>
            <div className="px-3 py-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-wider">{contextMenu.username}</div>
            <button onClick={() => handleContextAction("transfer", contextMenu.userId)} className="context-menu-item w-full text-left px-3 py-2 text-sm text-gray-300 flex items-center gap-2">
              <span>👑</span> Make Host
            </button>
            <button onClick={() => handleContextAction("mute", contextMenu.userId)} className="context-menu-item w-full text-left px-3 py-2 text-sm text-gray-300 flex items-center gap-2">
              <span>🔇</span> Toggle Mute
            </button>
            <div className="my-1 border-t border-white/[0.06]" />
            <button onClick={() => handleContextAction("remove", contextMenu.userId)} className="context-menu-item w-full text-left px-3 py-2 text-sm text-red-400 flex items-center gap-2">
              <span>🚫</span> Remove
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Room;