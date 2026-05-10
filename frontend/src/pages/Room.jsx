import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../socket";

function Room() {
  const { roomId } = useParams();

  const [users, setUsers] = useState([]);

  useEffect(() => {
    const username = prompt("Enter your name");

    socket.emit("join_room", {
      roomId,
      username,
    });

    socket.on("room_users", (users) => {
      setUsers(users);
    });

    return () => {
      socket.off("room_users");
    };
  }, [roomId]);

  return (
    <div className="min-h-screen bg-black text-white p-8">

      <h1 className="text-4xl font-bold mb-6">
        Room: {roomId}
      </h1>

      <div className="bg-zinc-900 p-4 rounded-xl max-w-md">
        <h2 className="text-2xl mb-4">Participants</h2>

        {users.map((user) => (
          <div
            key={user.id}
            className="flex justify-between border-b border-zinc-700 py-2"
          >
            <span>{user.username}</span>
            <span className="text-purple-400">
              {user.role}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}

export default Room;