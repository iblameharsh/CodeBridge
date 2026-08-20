import React, { useEffect, useState } from 'react';
import { useParams,useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import './CodeEditor.css';

const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  (process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000');

const socket = io(SOCKET_URL);

const languageOptions = {
  javascript: '// Start typing JavaScript code...',
  python: '# Start typing Python code...',
  cpp: '// Start typing C++ code...',
  java: '// Start typing Java code...',
};

const CodeEditor = () => {
  const { id: roomId } = useParams();
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState(languageOptions['javascript']);

useEffect(() => {
  socket.emit('join', roomId);

  const handleCodeChange = ({ code: newCode, language: lang }) => {
    setCode(newCode);
    setLanguage(lang);
  };

  socket.on('code-change', handleCodeChange);

  const handleUnload = () => {
    socket.emit('leave', roomId);
    socket.disconnect();
  };
  window.addEventListener('beforeunload', handleUnload);

  return () => {
    socket.off('code-change', handleCodeChange);
    window.removeEventListener('beforeunload', handleUnload);
  };
}, [roomId]);


  const handleEditorChange = (value) => {
  setCode(value);
  socket.emit('code-change', { roomId, code: value, language });
};

const handleLanguageChange = (e) => {
  const newLang = e.target.value;
  let starterCode=code;

  if(starterCode === languageOptions[language]) {
    starterCode = languageOptions[newLang] || '';
  }

  setLanguage(newLang);
  setCode(starterCode);
  socket.emit('code-change', { roomId, code: starterCode, language: newLang });
};

const navigate = useNavigate();
const handleExitSession = () => {
  socket.emit('leave', roomId); 
  navigate('/home'); 
};


  return (
    <div className="editor-wrapper">
      <header className="editor-header">
        <div className="editor-title">
           CodeBridge — Collaborative Editor
        </div>
        <div>
          <button className="exit-button" onClick={handleExitSession}>Exit Session</button>
        </div>
        <div className="room-id">
          Room ID: <code>{roomId}</code>
        <button
            onClick={() => navigator.clipboard.writeText(roomId)}
            className='copy-btn'>
            Copy
        </button>
        </div>
      </header>

      <div className="editor-controls">
        <label htmlFor="language-select">Language:</label>
        <select id="language-select" value={language} onChange={handleLanguageChange}>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="cpp">C++</option>
          <option value="java">Java</option>
        </select>
      </div>

      <div className="monaco-editor-container">
        <Editor
          height="80vh"
          language={language}
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          options={{
            fontSize: 16,
            minimap: { enabled: false },
            wordWrap: "on",
            padding: { top: 16 },
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
