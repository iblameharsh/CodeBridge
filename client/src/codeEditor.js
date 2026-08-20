import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Editor, { loader } from '@monaco-editor/react';
import { ArrowLeft, Copy, Check, Languages, LogOut } from 'lucide-react';
import { useToast } from './components/Toast';
import OT from './ot';
import './CodeEditor.css';

// monaco-editor 0.52.x throws during editor.dispose() on React unmount, which
// blanks the app when navigating back from a session. 0.53.0 is the last
// release without the unmount crash (0.54/0.55 regressed again).
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.53.0/min/vs' } });

const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  (process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000');

function getClientId() {
  try {
    let id = localStorage.getItem('cb-client-id');
    if (!id) {
      id =
        (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) ||
        'client-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('cb-client-id', id);
    }
    return id;
  } catch {
    return 'client-' + Math.random().toString(36).slice(2);
  }
}

const clientId = getClientId();
const socket = io(SOCKET_URL, { query: { clientId } });

const languageOptions = {
  javascript: '// Start typing JavaScript code...',
  python: '# Start typing Python code...',
  cpp: '// Start typing C++ code...',
  java: '// Start typing Java code...',
};

const CodeEditor = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [language, setLanguage] = useState('javascript');
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  // OT state (ot.js single-outstanding-op model)
  const docRef = useRef(languageOptions['javascript']);
  const revRef = useRef(0);
  const outstandingRef = useRef(null);
  const bufferRef = useRef(null);
  const seqRef = useRef(0);
  const suppressRef = useRef(false);
  const syncedRef = useRef(false);
  const preSyncEditedRef = useRef(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const pendingSetValueRef = useRef(null);

  const sendEdit = (ops, baseRev) => {
    const opId = `${clientId}-${++seqRef.current}`;
    socket.emit('edit', { roomId, opId, baseRev, ops, clientId });
    outstandingRef.current = ops;
    return opId;
  };

  useEffect(() => {
    const starter = languageOptions['javascript'];
    docRef.current = starter;
    revRef.current = 0;
    outstandingRef.current = null;
    bufferRef.current = null;
    seqRef.current = 0;
    suppressRef.current = false;
    syncedRef.current = false;
    preSyncEditedRef.current = false;
    pendingSetValueRef.current = null;

    if (editorRef.current) {
      suppressRef.current = true;
      editorRef.current.setValue(starter);
      suppressRef.current = false;
    }

    socket.emit('join', { roomId, clientId });

    // Set the Monaco content from OT state. If the editor isn't mounted yet,
    // remember it and apply on mount so docRef and the model never diverge.
    const setEditorValue = (code) => {
      pendingSetValueRef.current = code;
      if (editorRef.current) {
        suppressRef.current = true;
        editorRef.current.setValue(code);
        suppressRef.current = false;
      }
    };

    // Apply a stream op to the Monaco model imperatively. Positions are flat
    // char offsets; Monaco wants line/column, which we resolve per op.
    const applyToMonaco = (op) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      const model = editor.getModel();
      if (!model) return;

      const edits = [];
      for (const p of OT.opToAbsolute(op)) {
        if (p.type === 'insert') {
          const pos = model.getPositionAt(p.pos);
          edits.push({
            range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
            text: p.text,
            forceMoveMarkers: true,
          });
        } else {
          const start = model.getPositionAt(p.pos);
          const end = model.getPositionAt(p.pos + p.len);
          edits.push({
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            text: '',
          });
        }
      }
      edits.sort(
        (a, b) =>
          b.range.startLineNumber - a.range.startLineNumber ||
          b.range.startColumn - a.range.startColumn
      );
      model.applyEdits(edits);
      docRef.current = OT.applyOps(docRef.current, op);
    };

    const handleSnapshot = ({ rev, code: serverCode, language: lang }) => {
      setLanguage(lang);

      // A second snapshot means a resync: hard-reset to the server state.
      if (syncedRef.current) {
        revRef.current = rev;
        outstandingRef.current = null;
        bufferRef.current = null;
        docRef.current = serverCode;
        setEditorValue(serverCode);
        return;
      }

      syncedRef.current = true;
      const cur = docRef.current;

      if (rev === 0) {
        // Fresh room: adopt our local content (starter hint or pre-sync typing).
        revRef.current = 0;
        const ops = OT.diffToOps('', cur, clientId);
        if (!OT.opIsNoop(ops)) sendEdit(ops, 0);
        return;
      }

      // Existing room.
      revRef.current = rev;
      if (!preSyncEditedRef.current) {
        // Editor untouched: adopt the room content.
        docRef.current = serverCode;
        setEditorValue(serverCode);
        return;
      }

      // User typed before the snapshot arrived: push our changes on top.
      const ops = OT.diffToOps(serverCode, cur, clientId);
      if (!OT.opIsNoop(ops)) sendEdit(ops, rev);
    };

    const handleOp = ({ rev, ops }) => {
      if (rev <= revRef.current) return;
      revRef.current = rev;
      if (!ops || OT.opIsNoop(ops)) return;

      // Rebase outstanding/buffer against the incoming op (which the server
      // already transformed against everything we have seen). Applying the
      // transform pair keeps our local doc and future baseRev correct.
      suppressRef.current = true;
      if (outstandingRef.current) {
        const pair1 = OT.opTransform(outstandingRef.current, ops);
        if (bufferRef.current) {
          const pair2 = OT.opTransform(bufferRef.current, pair1[1]);
          applyToMonaco(pair2[1]);
          outstandingRef.current = pair1[0];
          bufferRef.current = pair2[0];
        } else {
          applyToMonaco(pair1[1]);
          outstandingRef.current = pair1[0];
        }
      } else {
        applyToMonaco(ops);
      }
      suppressRef.current = false;
    };

    const handleAck = ({ opId, rev, ops }) => {
      if (!outstandingRef.current || !OT.opEqual(outstandingRef.current, ops)) {
        // Server transformed differently than we expected: resync.
        outstandingRef.current = null;
        bufferRef.current = null;
        socket.emit('request-snapshot', { roomId });
        return;
      }
      outstandingRef.current = null;
      if (rev > revRef.current) revRef.current = rev;
      if (bufferRef.current) {
        const buffered = bufferRef.current;
        bufferRef.current = null;
        sendEdit(buffered, revRef.current);
      }
    };

    const handleResync = () => {
      socket.emit('request-snapshot', { roomId });
    };

    const handleRemoteLanguage = ({ language: lang }) => {
      setLanguage(lang);
    };

    const syncConnected = () => setConnected(socket.connected);

    socket.on('snapshot', handleSnapshot);
    socket.on('op', handleOp);
    socket.on('ack', handleAck);
    socket.on('resync', handleResync);
    socket.on('language-change', handleRemoteLanguage);
    socket.on('connect', syncConnected);
    socket.on('disconnect', syncConnected);
    socket.on('connect_error', syncConnected);

    const handleUnload = () => {
      socket.emit('leave', roomId);
    };
    window.addEventListener('beforeunload', handleUnload);

    const poll = setInterval(syncConnected, 3000);

    return () => {
      socket.off('snapshot', handleSnapshot);
      socket.off('op', handleOp);
      socket.off('ack', handleAck);
      socket.off('resync', handleResync);
      socket.off('language-change', handleRemoteLanguage);
      socket.off('connect', syncConnected);
      socket.off('disconnect', syncConnected);
      socket.off('connect_error', syncConnected);
      window.removeEventListener('beforeunload', handleUnload);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handleLocalChange = (value) => {
    const prev = docRef.current;
    if (value === prev) return;
    docRef.current = value;

    if (!syncedRef.current) {
      preSyncEditedRef.current = true;
      return;
    }

    const ops = OT.diffToOps(prev, value, clientId);
    if (OT.opIsNoop(ops)) return;

    if (outstandingRef.current) {
      // Compose into the buffer; it is sent once the outstanding op is acked.
      bufferRef.current = bufferRef.current ? OT.opCompose(bufferRef.current, ops) : ops;
    } else {
      sendEdit(ops, revRef.current);
    }
  };

  const handleEditorChange = (value) => {
    if (suppressRef.current) return;
    handleLocalChange(value);
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    let newCode = docRef.current;

    if (newCode === languageOptions[language]) {
      newCode = languageOptions[newLang] || '';
    }

    setLanguage(newLang);
    socket.emit('language-change', { roomId, language: newLang });

    if (newCode !== docRef.current) {
      suppressRef.current = true;
      if (editorRef.current) editorRef.current.setValue(newCode);
      suppressRef.current = false;
      handleLocalChange(newCode);
    }
  };

  const handleCopyRoom = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      toast('Room ID copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy room ID', 'error');
    }
  };

  const handleExitSession = () => {
    socket.emit('leave', roomId);
    navigate('/home');
  };

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <button className="icon-btn" onClick={handleExitSession} title="Back to home">
            <ArrowLeft size={18} />
          </button>
          <div className="toolbar-divider" />
          <div className="room-chip">
            <span className="room-label">Room</span>
            <code>{roomId}</code>
            <button className="icon-btn icon-btn-sm" onClick={handleCopyRoom} title="Copy room ID">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <div className={`conn-status ${connected ? 'is-connected' : 'is-disconnected'}`}>
            <span className="conn-dot" />
            {connected ? 'Live' : 'Connecting…'}
          </div>
          <div className="lang-select">
            <Languages size={16} />
            <select value={language} onChange={handleLanguageChange}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
          </div>
          <button className="btn btn-danger btn-sm" onClick={handleExitSession}>
            <LogOut size={15} />
            Exit
          </button>
        </div>
      </div>

      <div className="editor-body">
        <div className="monaco-shell">
          <Editor
            height="100%"
            language={language}
            theme="vs-dark"
            defaultValue={languageOptions['javascript']}
            onChange={handleEditorChange}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
              if (pendingSetValueRef.current != null) {
                suppressRef.current = true;
                editor.setValue(pendingSetValueRef.current);
                suppressRef.current = false;
                pendingSetValueRef.current = null;
              }
            }}
            options={{
              fontSize: 15,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              minimap: { enabled: false },
              wordWrap: 'on',
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;