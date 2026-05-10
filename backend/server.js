const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_room", ({ roomId, username }) => {

    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    const user = {
      id: socket.id,
      username,
      role: rooms[roomId].length === 0 ? "Host" : "Participant",
    };

    rooms[roomId].push(user);

    io.to(roomId).emit("room_users", rooms[roomId]);

    console.log(`${username} joined room ${roomId}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(
        (user) => user.id !== socket.id
      );

      io.to(roomId).emit("room_users", rooms[roomId]);
    }
  });
});