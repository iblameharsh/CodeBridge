import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import CodeEditor from './codeEditor';
import Signup from './pages/Signup';
import 'bootstrap/dist/css/bootstrap.min.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Router>
    <Routes>
      <Route path="/" element={<Signup />} />
      <Route path="/home" element={<App />} />
      <Route path="/session/:id" element={<CodeEditor />} />
    </Routes>
  </Router>
);
