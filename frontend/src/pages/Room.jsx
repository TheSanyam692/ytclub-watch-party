import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import YouTube from "react-youtube";
import { motion, AnimatePresence } from "framer-motion";
import Peer from "simple-peer";
import { Mic, MicOff, LogOut, Copy, Play, Pause, FastForward, Rewind, Check, Send, Crown, User, VolumeX } from "lucide-react";
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

      {/* LEFT SIDEBAR (Top Nav on Mobile) */}
      <aside className="sidebar-left p-4 z-10 shrink-0">
        <div className="flex items-center gap-3 mb-4 lg:mb-8 px-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <Play className="w-5 h-5 text-white ml-1" fill="currentColor" />
          </div>
          <span className="text-xl font-bold text-white tracking-wide">YTClub</span>
        </div>
        
        <nav className="flex-1 flex lg:flex-col gap-3 overflow-x-auto custom-scrollbar pb-2 lg:pb-0">
          <button className="nav-item active flex items-center gap-3">
            <span className="text-purple-400"><Play className="w-5 h-5" /></span> 
            <span className="hidden lg:inline font-semibold">Room</span>
          </button>
          <div className="lg:mt-auto flex lg:flex-col gap-3 ml-auto lg:ml-0 shrink-0">
            <button onClick={toggleMic} className={`nav-item flex items-center gap-3 ${isMicOn ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]"}`}>
              {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />} 
              <span className="hidden lg:inline font-medium">{isMicOn ? "Mic On" : "Muted"}</span>
            </button>
            <button onClick={() => navigate("/")} className="nav-item flex items-center gap-3 text-red-400 hover:bg-red-500/10 hover:text-red-400 transition-all group">
              <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> 
              <span className="hidden lg:inline font-medium">Leave Room</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* CENTER CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10" onClick={() => setContextMenu(null)}>
        {/* HEADER / URL BAR */}
        <header className="h-auto lg:h-20 border-b border-white/[0.05] flex flex-col lg:flex-row items-center px-4 lg:px-8 py-4 lg:py-0 shrink-0 backdrop-blur-xl bg-black/40 gap-4 lg:gap-0 lg:justify-between w-full z-20">
          <div className="flex-1 w-full lg:max-w-2xl url-bar shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="pl-4 text-gray-500"><Play className="w-4 h-4" /></div>
            <input 
              type="text" 
              placeholder="Paste YouTube URL here to sync..." 
              value={urlInput} 
              onChange={(e) => setUrlInput(e.target.value)} 
              onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()} 
              className="w-full text-sm font-medium tracking-wide placeholder:text-gray-600"
            />
            <button onClick={() => handleLoadVideo()} className="font-bold tracking-widest text-[11px] uppercase px-6">Load</button>
          </div>
          
          <div className="w-full lg:w-auto flex items-center justify-between lg:justify-end ml-0 lg:ml-6 gap-4">
             {/* Live Status Badge */}
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[10px] font-bold text-emerald-400 tracking-widest uppercase">Live Synced</span>
             </div>

             <div className="room-code-chip group cursor-pointer" onClick={() => { navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(()=>setCopied(false), 2000); addToast("Code copied!"); }}>
               <span className="text-xs text-gray-500 font-medium group-hover:text-gray-400 transition-colors hidden lg:inline">Room:</span>
               <span className="font-bold text-purple-300 tracking-widest group-hover:text-purple-200 transition-colors">{roomId}</span>
               <div className="ml-1 w-6 h-6 rounded-md bg-white/5 flex items-center justify-center group-hover:bg-purple-500/20 transition-all">
                 {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
               </div>
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
            <div className="mt-6 p-4 glass-card flex items-center justify-center gap-6 lg:gap-8 w-full shrink-0 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
              <button onClick={() => { const t = playerRef.current?.getCurrentTime() || 0; playerRef.current?.seekTo(t - 10, true); socket.emit("seek_video", { roomId, currentTime: t - 10 }); }} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-all hover:-translate-y-0.5 active:scale-95 shrink-0">
                <Rewind className="w-5 h-5" fill="currentColor" />
              </button>
              
              <button onClick={() => { const s = playerRef.current?.getPlayerState(); if(s === 1) playerRef.current?.pauseVideo(); else playerRef.current?.playVideo(); }} className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 border border-purple-400/30 flex items-center justify-center text-white shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-all hover:scale-105 active:scale-95 shrink-0">
                {playerRef.current?.getPlayerState() === 1 ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6 ml-1" fill="currentColor" />}
              </button>
              
              <button onClick={() => { const t = playerRef.current?.getCurrentTime() || 0; playerRef.current?.seekTo(t + 10, true); socket.emit("seek_video", { roomId, currentTime: t + 10 }); }} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-all hover:-translate-y-0.5 active:scale-95 shrink-0">
                <FastForward className="w-5 h-5" fill="currentColor" />
              </button>
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
                <form onSubmit={handleSendMessage} className="p-5 border-t border-white/[0.05] bg-black/40 shrink-0 backdrop-blur-md">
                  <div className="flex gap-3 relative">
                    <input type="text" placeholder="Message the room..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} className="chat-input shadow-inner pr-14" />
                    <button type="submit" className="absolute right-1.5 top-1.5 bottom-1.5 w-[38px] rounded-xl bg-purple-500 text-white flex items-center justify-center hover:bg-purple-400 transition-colors shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div key="users" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="absolute inset-0 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {users.map((u) => (
                  <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={u.id} className="participant-card relative group cursor-default">
                    <div className="relative">
                      <div className={`avatar ${u.role === "Host" ? "bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-[0_0_15px_rgba(139,92,246,0.3)]" : "bg-white/10 border border-white/10"}`}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      {/* Online Indicator Ring */}
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#111114] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    </div>
                    
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="text-[14px] font-bold text-gray-200 flex items-center gap-2 truncate">
                        {u.username}
                        {u.id === socket.id && <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 uppercase tracking-wider font-semibold">You</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {u.role === "Host" ? <Crown className="w-3 h-3 text-purple-400" /> : <User className="w-3 h-3 text-gray-500" />}
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${u.role === "Host" ? "text-purple-400" : "text-gray-500"}`}>{u.role}</span>
                      </div>
                    </div>
                    {u.isMuted && <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0"><VolumeX className="w-4 h-4 text-red-400" /></div>}
                  </motion.div>
                ))}
                
                <div className="mt-8 p-6 rounded-2xl bg-gradient-to-b from-purple-500/10 to-transparent border border-purple-500/20 text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-purple-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  <p className="text-[11px] text-purple-300/70 font-bold uppercase tracking-widest mb-4 relative z-10">Invite Friends</p>
                  <button onClick={() => { navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(()=>setCopied(false), 2000); addToast("Code copied!"); }} className="btn-primary w-full py-3.5 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-2 relative z-10 shadow-[0_4px_20px_rgba(139,92,246,0.3)]">
                    {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Room Link</>}
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