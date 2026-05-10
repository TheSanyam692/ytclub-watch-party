import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  const [roomInput, setRoomInput] = useState("");

  const createRoom = () => {
    const roomId = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${roomId}`);
  };

  const joinRoom = () => {
    if (!roomInput.trim()) return;

    navigate(`/room/${roomInput}`);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">

      <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-red-500 to-purple-500 bg-clip-text text-transparent">
        VibeRoom
      </h1>

      <p className="text-gray-400 text-lg mb-10 text-center max-w-xl">
        Watch YouTube videos together in perfect sync with your friends in real-time.
      </p>

      <div className="flex gap-4 mb-6">
        <button
          onClick={createRoom}
          className="bg-red-500 hover:bg-red-600 px-6 py-3 rounded-xl font-semibold transition"
        >
          Create Room
        </button>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Enter Room Code"
          value={roomInput}
          onChange={(e) => setRoomInput(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 px-4 py-3 rounded-xl outline-none"
        />

        <button
          onClick={joinRoom}
          className="bg-purple-500 hover:bg-purple-600 px-6 py-3 rounded-xl font-semibold transition"
        >
          Join Room
        </button>
      </div>

    </div>
  );
}

export default Home;