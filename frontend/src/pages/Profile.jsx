import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const navigate = useNavigate();
  const user = React.useMemo(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen p-6 bg-[#f9fafb]">
        <h1 className="text-2xl font-bold text-gray-800">Profile</h1>
        <p className="text-gray-600 mt-4">User not logged in.</p>
        <button
          className="mt-4 bg-purple-600 text-white px-4 py-2 rounded"
          onClick={() => navigate('/login')}
        >
          Go to login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-[#f9fafb]">
      <h1 className="text-2xl font-bold text-gray-800">Profile</h1>
      <div className="mt-6 p-6 bg-white rounded-xl shadow">
        <p className="text-lg font-semibold">Name: {user.name || 'N/A'}</p>
        <p className="mt-2 text-gray-600">Email: {user.email || 'N/A'}</p>
        <p className="mt-2 text-gray-600">UserId: {user._id || 'N/A'}</p>
      </div>
    </div>
  );
}
