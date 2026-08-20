import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Link2, Zap, Languages, Users, ArrowRight } from 'lucide-react';
import Navbar from './components/Navbar';
import { useToast } from './components/Toast';
import './App.css';

const features = [
  { icon: Zap, title: 'Live sync', desc: 'Edits appear instantly for everyone in the room' },
  { icon: Languages, title: '4 languages', desc: 'JavaScript, Python, C++, and Java' },
  { icon: Users, title: 'Easy sharing', desc: 'Just share the room ID or copy the link' },
];

function App() {
  const [inputId, setInputId] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const createNewSession = () => {
    const id = uuidv4();
    toast('Session created! Share the room ID to invite others.');
    navigate(`/session/${id}`);
  };

  const joinSession = (e) => {
    e.preventDefault();
    const room = inputId.trim();
    if (room) {
      navigate(`/session/${room}`);
    }
  };

  return (
    <div className="home-page">
      <Navbar />
      <main className="home-hero">
        <div className="hero-badge">
          <Zap size={14} />
          Real-time collaboration
        </div>
        <h1 className="hero-title">
          Code together, <span className="hero-accent">in real time.</span>
        </h1>
        <p className="hero-subtitle">
          Create a room, share the link, and watch your teammates&apos; code update live.
          No setup, no installs — just paste and start typing.
        </p>

        <div className="hero-card">
          <button className="btn btn-primary btn-lg hero-create" onClick={createNewSession}>
            <Plus size={20} />
            Create New Session
          </button>
          <div className="hero-divider">
            <span>or join with a room ID</span>
          </div>
          <form onSubmit={joinSession} className="join-form">
            <input
              type="text"
              className="input"
              placeholder="Paste room ID here"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
            />
            <button className="btn btn-success" type="submit">
              <Link2 size={18} />
              Join
            </button>
          </form>
        </div>

        <div className="feature-row">
          {features.map(({ icon: Icon, title, desc }) => (
            <div className="feature-card" key={title}>
              <span className="feature-icon">
                <Icon size={18} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
              <ArrowRight className="feature-arrow" size={16} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;