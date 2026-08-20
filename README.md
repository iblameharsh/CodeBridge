# CodeBridge

Real-time collaborative code editor. Create or join a session by ID and code together in a shared Monaco editor with live sync over Socket.IO. Email/password auth via Firebase.

Both the **client** (React) and **server** (Express + Socket.IO) live in this single repo so it's easy to run and host as one app.

## Structure

```
CodeBridge/
├── client/          # React frontend (create-react-app)
│   ├── src/
│   │   ├── App.js           # Home page: create / join session
│   │   ├── codeEditor.js    # Monaco editor + Socket.IO sync
│   │   ├── firebase.js      # Firebase auth config
│   │   └── pages/Signup.jsx # Sign up / login
│   └── public/
├── server/
│   └── index.js     # Express + Socket.IO (rooms, code sync)
└── package.json     # Root scripts
```

## Quick start (development)

```bash
npm run install:all   # install server + client deps
npm run dev           # runs server (:5000) and client (:3000) together
```

Or run them separately: `npm run dev:server` and `npm run dev:client`.

- Open http://localhost:3000 and create an account (Firebase) or log in.
- Create a session, share the Room ID, and edit together.

## Run the whole app from one server (production / hosting)

The Express server serves the built client, so a single process hosts everything on the same origin — no CORS or separate frontend host needed.

```bash
npm run install:all
npm run build         # builds the React client into client/build
npm start             # serves the app + Socket.IO on PORT (default 5000)
```

That's the recommended setup for platforms like Render, Railway, or Fly.io: `npm run build && npm start`.

## Configuration

The client auto-detects the Socket.IO URL:

- **Development:** http://localhost:5000
- **Production:** the current origin (same server)

Override it anytime with `REACT_APP_SOCKET_URL` in `client/.env`.

Firebase credentials are read from env vars with built-in defaults. To use your own project, copy `client/.env.example` to `client/.env` and fill in the values.

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run install:all` | Installs deps in `server/` and `client/`   |
| `npm run dev`      | Runs server + client together for development |
| `npm run dev:server` | Runs only the Express/Socket.IO server      |
| `npm run dev:client`  | Runs only the React dev server              |
| `npm run build`    | Builds the client for production               |
| `npm start`        | Serves the built app + Socket.IO (production)  |