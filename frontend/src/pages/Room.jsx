import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import YouTube from "react-youtube";
import { motion, AnimatePresence } from "framer-motion";
import Peer from "simple-peer";
import "../App.css";

function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // ─── STATE ───
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState(location.state?.username || "");
  const [showNameModal, setShowNameModal] = useState(!location.state?.username);
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [urlInput, setUrlInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  
  // Chat State
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [activeTab, setActiveTab] = useState("chat"); // 'chat' or 'users'

  // Mic/WebRTC State
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState(null);
  const [peers, setPeers] = useState({}); // { socketId: Peer }

  // Player Sync State
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const playerRef = useRef(null);
  const suppressEventsUntil = useRef(0);
  const toastId = useRef(0);
  const chatEndRef = useRef(null);
  const isMicOnRef = useRef(isMicOn);
  const streamRef = useRef(stream);
  const peersRef = useRef(peers);
  const hasJoined = useRef(false);

  // Sync refs with state
  useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  useEffect(() => { peersRef.current = peers; }, [peers]);

  // ─── HELPERS ───
  const extractVideoId = (url) => {
    if (!url) return null;
    const patterns = [
      /(?:v=|v\/|vi=|vi\/|embed\/|shorts\/|e\/|watch\?v=|[?&]v=)([^#&?]*).*/,
      /(?:youtu\.be\/)([^#&?]*).*/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m && m[1]) return m[1];
    }
    if (url.length === 11) return url;
    return null;
  };

  const addToast = useCallback((message, type = "info") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ─── WEBRTC LOGIC ───
  const createPeer = useCallback((userIdToSignal, callerId, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("webrtc_signal", {
        to: userIdToSignal,
        from: callerId,
        signal,
      });
    });

    return peer;
  }, []);

  const addPeer = useCallback((incomingSignal, callerId, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("webrtc_signal", {
        to: callerId,
        signal,
      });
    });

    peer.signal(incomingSignal);
    return peer;
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

    // Fallback: if no server response in 8s, clear the loading screen anyway
    const fallbackTimer = setTimeout(() => setIsConnecting(false), 8000);

    // ─── Event Handlers ───
    const onRoomUsers = (updatedUsers) => {
      setIsConnecting(false);
      clearTimeout(fallbackTimer);
      // Clean up peers for users who left
      setPeers((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          if (!updatedUsers.find((u) => u.id === id)) {
            next[id].destroy();
            delete next[id];
          }
        });
        // If mic is on, initiate peers with new users
        if (isMicOnRef.current && streamRef.current) {
          updatedUsers.forEach((u) => {
            if (u.id !== socket.id && !next[u.id]) {
              const peer = createPeer(u.id, socket.id, streamRef.current);
              next[u.id] = peer;
            }
          });
        }
        return next;
      });
      setUsers(updatedUsers);
    };

    const onRoomData = (data) => {
      setIsConnecting(false);
      clearTimeout(fallbackTimer);
      if (data.videoUrl) {
        const id = extractVideoId(data.videoUrl);
        if (id) setCurrentVideoId(id);
      }
      if (data.currentTime && playerRef.current) {
        setTimeout(() => {
          if (playerRef.current && Math.abs(playerRef.current.getCurrentTime() - data.currentTime) > 2) {
            playerRef.current.seekTo(data.currentTime, true);
          }
        }, 1500);
      }
    };

    // video_loaded fires for EVERYONE in the room (including the person who loaded it)
    const onVideoLoaded = (data) => {
      const url = typeof data === "string" ? data : data?.videoUrl;
      const id = extractVideoId(url);
      if (id) {
        setCurrentVideoId(id);
        addToast("New video loaded!", "info");
      }
    };

    const onVideoPlayed = ({ currentTime, username: actingUser }) => {
      suppressEventsUntil.current = Date.now() + 1000;
      if (playerRef.current) {
        if (Math.abs(playerRef.current.getCurrentTime() - currentTime) > 1) {
          playerRef.current.seekTo(currentTime, true);
        }
        playerRef.current.playVideo();
      }
      if (actingUser && actingUser !== username) {
        addToast(`${actingUser} played the video`, "info");
      }
    };

    const onVideoPaused = ({ currentTime, username: actingUser }) => {
      suppressEventsUntil.current = Date.now() + 1000;
      if (playerRef.current) {
        playerRef.current.pauseVideo();
        if (Math.abs(playerRef.current.getCurrentTime() - currentTime) > 1) {
          playerRef.current.seekTo(currentTime, true);
        }
      }
      if (actingUser && actingUser !== username) {
        addToast(`${actingUser} paused the video`, "info");
      }
    };

    const onVideoSeeked = ({ currentTime, username: actingUser }) => {
      suppressEventsUntil.current = Date.now() + 1000;
      if (playerRef.current) {
        playerRef.current.seekTo(currentTime, true);
      }
      if (actingUser && actingUser !== username) {
        addToast(`${actingUser} seeked the video`, "info");
      }
    };

    const onChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onToast = ({ message, type }) => addToast(message, type);
    const onRemoved = () => navigate("/");
    const onDisconnect = () => addToast("Reconnecting...", "warning");

    const onWebrtcSignal = ({ from, signal }) => {
      setPeers((prev) => {
        if (prev[from]) {
          prev[from].signal(signal);
          return prev;
        } else if (streamRef.current) {
          const peer = addPeer(signal, from, streamRef.current);
          return { ...prev, [from]: peer };
        }
        return prev;
      });
    };

    socket.on("room_users", onRoomUsers);
    socket.on("room_data", onRoomData);
    socket.on("video_loaded", onVideoLoaded);
    socket.on("video_played", onVideoPlayed);
    socket.on("video_paused", onVideoPaused);
    socket.on("video_seeked", onVideoSeeked);
    socket.on("chat_message", onChatMessage);
    socket.on("toast", onToast);
    socket.on("removed_from_room", onRemoved);
    socket.on("disconnect", onDisconnect);
    socket.on("webrtc_signal", onWebrtcSignal);

    return () => {
      clearTimeout(fallbackTimer);
      socket.off("room_users", onRoomUsers);
      socket.off("room_data", onRoomData);
      socket.off("video_loaded", onVideoLoaded);
      socket.off("video_played", onVideoPlayed);
      socket.off("video_paused", onVideoPaused);
      socket.off("video_seeked", onVideoSeeked);
      socket.off("chat_message", onChatMessage);
      socket.off("toast", onToast);
      socket.off("removed_from_room", onRemoved);
      socket.off("disconnect", onDisconnect);
      socket.off("webrtc_signal", onWebrtcSignal);
      socket.off("connect", doJoin);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username, showNameModal]);

  // ─── MIC HANDLING ───
  const toggleMic = async () => {
    if (isMicOn) {
      stream?.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsMicOn(false);
    } else {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(audioStream);
        setIsMicOn(true);
        users.forEach((u) => {
          if (u.id !== socket.id) {
            const peer = createPeer(u.id, socket.id, audioStream);
            setPeers((prev) => ({ ...prev, [u.id]: peer }));
          }
        });
      } catch (err) {
        addToast("Could not access microphone", "error");
      }
    }
  };

  // ─── ACTIONS ───
  const handleLoadVideo = (customUrl = null) => {
    const url = customUrl || urlInput;
    const id = extractVideoId(url);
    if (!id) { addToast("Invalid YouTube URL", "error"); return; }
    // Set locally immediately so the person loading also sees the video
    setCurrentVideoId(id);
    socket.emit("load_video", { roomId, videoUrl: url.trim() });
    setUrlInput("");
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit("send_message", { roomId, message: chatInput.trim() });
    setChatInput("");
  };

  const handlePlayerStateChange = (e) => {
    if (!isPlayerReady || Date.now() < suppressEventsUntil.current) return;
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
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 bg-[#09090b]">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="noise-overlay" />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 glass-card-glow p-8 w-full max-w-sm text-white">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">Welcome to YTClub</h2>
            <p className="text-gray-400 text-sm mt-1">Enter your name to join the party</p>
          </div>
          <input type="text" placeholder="Your name..."
            value={username} onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && username.trim() && setShowNameModal(false)}
            autoFocus className="input-premium w-full px-5 py-3.5 rounded-xl outline-none text-[15px] mb-4" />
          <motion.button whileTap={{ scale: 0.98 }}
            onClick={() => username.trim() && setShowNameModal(false)}
            className="btn-primary w-full text-white px-6 py-3.5 rounded-xl font-bold">
            Join Party
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center bg-[#09090b]">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="noise-overlay" />
        <div className="spinner-lg mb-4" />
        <p className="text-gray-400 font-medium">Entering Room...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col lg:flex-row overflow-x-hidden relative w-full lg:h-screen lg:overflow-hidden">
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="noise-overlay" />

      {/* TOASTS */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-xl border ${
                t.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400"
                : t.type === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-white/5 border-white/10 text-gray-300"
              }`}>
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* LEFT SIDEBAR */}
      <aside className="sidebar-left p-4 z-10 shrink-0">
        <div className="flex items-center gap-3 mb-4 lg:mb-8 px-2">
          <span className="text-2xl">🎬</span>
          <span className="text-xl font-bold gradient-text">YTClub</span>
        </div>
        
        <nav className="flex-1 flex lg:flex-col gap-2 overflow-x-auto custom-scrollbar pb-2 lg:pb-0">
          <button className="nav-item active">
            <span className="text-lg">🏠</span> Room
          </button>
          <div className="lg:mt-auto flex lg:flex-col gap-2 ml-auto lg:ml-0 shrink-0">
            <button onClick={toggleMic} className={`nav-item ${isMicOn ? "text-red-400 bg-red-500/10 border-red-500/20" : ""}`}>
              <span className="text-lg">{isMicOn ? "🎙️" : "🔇"}</span> <span className="hidden lg:inline">{isMicOn ? "Mic On" : "Mic Off"}</span>
            </button>
            <button onClick={() => navigate("/")} className="nav-item text-red-400 hover:bg-red-500/10 hover:text-red-400">
              <span className="text-lg">🚪</span> <span className="hidden lg:inline">Leave Room</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* CENTER CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10" onClick={() => setContextMenu(null)}>
        {/* HEADER / URL BAR */}
        <header className="h-auto lg:h-16 border-b border-white/[0.05] flex flex-col lg:flex-row items-center px-4 lg:px-6 py-3 lg:py-0 shrink-0 backdrop-blur-xl bg-black/20 gap-3 lg:gap-0 lg:justify-between w-full">
          <div className="flex-1 w-full lg:max-w-2xl url-bar">
            <input 
              type="text" 
              placeholder="Paste YouTube URL here..." 
              value={urlInput} 
              onChange={(e) => setUrlInput(e.target.value)} 
              onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()} 
              className="w-full"
            />
            <button onClick={() => handleLoadVideo()}>LOAD</button>
          </div>
          <div className="w-full lg:w-auto flex items-center justify-between lg:justify-end ml-0 lg:ml-4">
             <span className="text-xs text-gray-500 font-bold lg:hidden">ROOM CODE:</span>
             <div className="room-code-chip" onClick={() => { navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(()=>setCopied(false), 2000); addToast("Code copied!"); }}>
               <span className="font-mono text-xs text-gray-400 hidden lg:inline">ID:</span>
               <span className="font-bold text-purple-400 tracking-widest">{roomId}</span>
               <span className="text-xs ml-1">{copied ? "✓" : "📋"}</span>
             </div>
          </div>
        </header>

        {/* PLAYER AREA */}
        <div className="flex-1 p-3 lg:p-6 flex flex-col min-h-0 w-full overflow-hidden">
          <div className="glass-card flex-1 overflow-hidden flex flex-col min-h-[250px] lg:min-h-[300px] w-full">
            {currentVideoId ? (
              <div className="player-wrapper flex-1 relative">
                <YouTube
                  videoId={currentVideoId}
                  opts={playerOpts}
                  onReady={(e) => { playerRef.current = e.target; setIsPlayerReady(true); }}
                  onStateChange={handlePlayerStateChange}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-8 text-center h-full">
                <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl lg:text-4xl mb-4 lg:mb-6">🍿</div>
                <h3 className="text-xl lg:text-2xl font-bold text-white mb-2">Start the Watch Party!</h3>
                <p className="text-gray-500 mb-8 max-w-sm">Paste a YouTube link above to sync it with everyone in the room.</p>
              </div>
            )}
          </div>

          {/* CONTROLS */}
          {currentVideoId && (
            <div className="mt-4 p-3 lg:p-4 glass-card flex items-center justify-center gap-4 lg:gap-6 w-full overflow-x-auto shrink-0">
              <button onClick={() => { const t = playerRef.current?.getCurrentTime() || 0; playerRef.current?.seekTo(t - 10, true); socket.emit("seek_video", { roomId, currentTime: t - 10 }); }} className="control-btn w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-lg lg:text-xl shrink-0">⏪</button>
              <button onClick={() => { const s = playerRef.current?.getPlayerState(); if(s === 1) playerRef.current?.pauseVideo(); else playerRef.current?.playVideo(); }} className="control-btn w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xl lg:text-2xl text-purple-400 shadow-[0_0_20px_rgba(139,92,246,0.2)] shrink-0">⏯</button>
              <button onClick={() => { const t = playerRef.current?.getCurrentTime() || 0; playerRef.current?.seekTo(t + 10, true); socket.emit("seek_video", { roomId, currentTime: t + 10 }); }} className="control-btn w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-lg lg:text-xl shrink-0">⏩</button>
            </div>
          )}
        </div>
      </main>

      {/* RIGHT SIDEBAR */}
      <aside className="sidebar-right z-10 shrink-0 flex flex-col h-[500px] lg:h-auto">
        <div className="flex border-b border-white/10 shrink-0 bg-white/5">
          <button onClick={() => setActiveTab("chat")} className={`flex-1 py-5 text-sm font-black uppercase tracking-widest transition-all ${activeTab === "chat" ? "text-purple-400 border-b-2 border-purple-400 bg-purple-500/10 shadow-[inset_0_-2px_10px_rgba(139,92,246,0.1)]" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"}`}>Chat</button>
          <button onClick={() => setActiveTab("users")} className={`flex-1 py-5 text-sm font-black uppercase tracking-widest transition-all ${activeTab === "users" ? "text-purple-400 border-b-2 border-purple-400 bg-purple-500/10 shadow-[inset_0_-2px_10px_rgba(139,92,246,0.1)]" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"}`}>People ({users.length})</button>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === "chat" ? (
              <motion.div key="chat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="absolute inset-0 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.username === username ? "items-end" : "items-start"}`}>
                      <span className="text-[10px] text-gray-500 mb-1 px-1">{m.username}</span>
                      <div className={`max-w-[85%] px-4 py-2.5 text-[13px] leading-relaxed ${m.username === username ? "chat-bubble-self" : "chat-bubble-other"}`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-black/40 shrink-0">
                  <div className="flex gap-3">
                    <input type="text" placeholder="Say something..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} className="chat-input shadow-[0_0_15px_rgba(0,0,0,0.5)]" />
                    <button type="submit" className="w-[50px] h-[50px] shrink-0 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30 hover:bg-purple-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(139,92,246,0.1)] hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                      <span className="text-xl">➔</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div key="users" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="absolute inset-0 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {users.map((u) => (
                  <div key={u.id} className="participant-card">
                    <div className={`avatar ${u.role === "Host" ? "avatar-host" : "avatar-viewer"}`}>
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-200 flex items-center gap-2 truncate">
                        {u.username}
                        {u.id === socket.id && <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 uppercase tracking-wider">You</span>}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mt-0.5">{u.role}</div>
                    </div>
                    {u.isMuted && <span className="text-xs shrink-0">🔇</span>}
                  </div>
                ))}
                
                <div className="mt-6 p-5 rounded-2xl bg-purple-500/5 border border-purple-500/10 text-center">
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-3">Invite Friends</p>
                  <button onClick={() => { navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(()=>setCopied(false), 2000); addToast("Code copied!"); }} className="btn-invite w-full flex items-center justify-center gap-2">
                    <span>{copied ? "✓ Copied!" : "📋 Copy Room Link"}</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
}

export default Room;