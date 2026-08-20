import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

function App() {
  const [inputId, setInputId] = useState('');
  const navigate = useNavigate();

  const createNewSession = () => {
    const id = uuidv4();
    navigate(`/session/${id}`);
  };

  const joinSession = (e) => {
    e.preventDefault();
    if (inputId.trim() !== '') {
      navigate(`/session/${inputId.trim()}`);
    }
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h1 className="home-title">CodeBridge - Real-Time Code Sharing</h1>
        <button className="create-btn" onClick={createNewSession}>
          ➕ Create New Session
        </button>
        <form onSubmit={joinSession} className="join-section">
          <input
            type="text"
            className="session-input"
            placeholder="Enter Session ID"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
          />
          <button className="join-btn" type="submit">
            🔗 Join
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
