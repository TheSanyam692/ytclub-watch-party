const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// In-memory room state
const rooms = {};

// Helper: find which room a socket is in
function findUserRoom(socketId) {
  for (const roomId in rooms) {
    const user = rooms[roomId].users.find((u) => u.id === socketId);
    if (user) return { roomId, user };
  }
  return null;
}

// Helper: check if socket is room host
function isHost(socketId, roomId) {
  if (!rooms[roomId]) return false;
  const user = rooms[roomId].users.find((u) => u.id === socketId);
  return user?.role === "Host";
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // ─── JOIN ROOM ───
  socket.on("join_room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        videoUrl: null,
        isPlaying: false,
        currentTime: 0,
        lastUpdateTime: Date.now(),
      };
    }

    const user = {
      id: socket.id,
      username,
      role: rooms[roomId].users.length === 0 ? "Host" : "Viewer",
      isMuted: false,
    };

    rooms[roomId].users.push(user);

    // Calculate estimated current time if video is playing
    let estimatedTime = rooms[roomId].currentTime;
    if (rooms[roomId].isPlaying) {
      const elapsed = (Date.now() - rooms[roomId].lastUpdateTime) / 1000;
      estimatedTime += elapsed;
    }

    // Send full room state to the joining user
    socket.emit("room_data", {
      videoUrl: rooms[roomId].videoUrl,
      users: rooms[roomId].users,
      isPlaying: rooms[roomId].isPlaying,
      currentTime: estimatedTime,
    });

    // Broadcast updated user list to everyone
    io.to(roomId).emit("room_users", rooms[roomId].users);

    // Notify room about new join
    socket.to(roomId).emit("toast", {
      message: `${username} joined the room`,
      type: "info",
    });

    console.log(`${username} joined room ${roomId} as ${user.role}`);
  });

  // ─── LOAD VIDEO ───
  socket.on("load_video", ({ roomId, videoUrl }) => {
    if (!rooms[roomId] || !isHost(socket.id, roomId)) return;

    rooms[roomId].videoUrl = videoUrl;
    rooms[roomId].isPlaying = true;
    rooms[roomId].currentTime = 0;
    rooms[roomId].lastUpdateTime = Date.now();

    io.to(roomId).emit("video_loaded", {
      videoUrl,
      currentTime: 0,
      isPlaying: true,
    });

    console.log(`Video loaded in room ${roomId}: ${videoUrl}`);
  });

  // ─── PLAY VIDEO ───
  socket.on("play_video", ({ roomId, currentTime }) => {
    if (!rooms[roomId] || !isHost(socket.id, roomId)) return;

    rooms[roomId].isPlaying = true;
    rooms[roomId].currentTime = currentTime;
    rooms[roomId].lastUpdateTime = Date.now();

    socket.to(roomId).emit("video_played", { currentTime });
  });

  // ─── PAUSE VIDEO ───
  socket.on("pause_video", ({ roomId, currentTime }) => {
    if (!rooms[roomId] || !isHost(socket.id, roomId)) return;

    rooms[roomId].isPlaying = false;
    rooms[roomId].currentTime = currentTime;
    rooms[roomId].lastUpdateTime = Date.now();

    socket.to(roomId).emit("video_paused", { currentTime });
  });

  // ─── SEEK VIDEO ───
  socket.on("seek_video", ({ roomId, currentTime }) => {
    if (!rooms[roomId] || !isHost(socket.id, roomId)) return;

    rooms[roomId].currentTime = currentTime;
    rooms[roomId].lastUpdateTime = Date.now();

    socket.to(roomId).emit("video_seeked", { currentTime });
  });

  // ─── MUTE USER ───
  socket.on("mute_user", ({ roomId, userId }) => {
    if (!rooms[roomId] || !isHost(socket.id, roomId)) return;

    const target = rooms[roomId].users.find((u) => u.id === userId);
    if (target && target.role !== "Host") {
      target.isMuted = !target.isMuted;
      io.to(roomId).emit("room_users", rooms[roomId].users);
      io.to(userId).emit("toast", {
        message: target.isMuted
          ? "You have been muted by the host"
          : "You have been unmuted by the host",
        type: "warning",
      });
    }
  });

  // ─── REMOVE USER ───
  socket.on("remove_user", ({ roomId, userId }) => {
    if (!rooms[roomId] || !isHost(socket.id, roomId)) return;

    const target = rooms[roomId].users.find((u) => u.id === userId);
    if (target && target.role !== "Host") {
      rooms[roomId].users = rooms[roomId].users.filter((u) => u.id !== userId);

      io.to(userId).emit("removed_from_room");
      io.to(userId).emit("toast", {
        message: "You have been removed from the room",
        type: "error",
      });

      // Force the removed user to leave the socket room
      const targetSocket = io.sockets.sockets.get(userId);
      if (targetSocket) targetSocket.leave(roomId);

      io.to(roomId).emit("room_users", rooms[roomId].users);
      io.to(roomId).emit("toast", {
        message: `${target.username} was removed from the room`,
        type: "warning",
      });
    }
  });

  // ─── TRANSFER HOST ───
  socket.on("transfer_host", ({ roomId, userId }) => {
    if (!rooms[roomId] || !isHost(socket.id, roomId)) return;

    const currentHost = rooms[roomId].users.find((u) => u.id === socket.id);
    const newHost = rooms[roomId].users.find((u) => u.id === userId);

    if (currentHost && newHost) {
      currentHost.role = "Viewer";
      newHost.role = "Host";

      io.to(roomId).emit("room_users", rooms[roomId].users);
      io.to(roomId).emit("toast", {
        message: `${newHost.username} is now the host`,
        type: "info",
      });
    }
  });

  // ─── DISCONNECT ───
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const roomId in rooms) {
      const disconnectedUser = rooms[roomId].users.find(
        (u) => u.id === socket.id
      );

      if (disconnectedUser) {
        rooms[roomId].users = rooms[roomId].users.filter(
          (u) => u.id !== socket.id
        );

        // If host left and there are remaining users, promote first user
        if (
          disconnectedUser.role === "Host" &&
          rooms[roomId].users.length > 0
        ) {
          rooms[roomId].users[0].role = "Host";
          io.to(roomId).emit("toast", {
            message: `${rooms[roomId].users[0].username} is now the host`,
            type: "info",
          });
        }

        io.to(roomId).emit("room_users", rooms[roomId].users);

        if (disconnectedUser) {
          io.to(roomId).emit("toast", {
            message: `${disconnectedUser.username} left the room`,
            type: "info",
          });
        }

        // Clean up empty rooms
        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`YTClub server running on port ${PORT}`);
});