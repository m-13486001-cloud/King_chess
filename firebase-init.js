/* ============ Firebase (Leaderboard backend) ============
   Uses the Firebase compat SDK (loaded via <script> tags in index.html)
   so this file can stay a plain script — no bundler required for
   GitHub Pages. Only Firestore is used; Analytics is intentionally
   left out to keep this lightweight.

   Firestore data model — collection "players", one doc per player
   (doc id = lowercased name):
     {
       name: "Display Name",
       elo:    { "0": 100, "60": 100, "180": 100, "300": 100 },
       wins:   { "0": 0,   "60": 0,   "180": 0,   "300": 0   },
       losses: { "0": 0,   "60": 0,   "180": 0,   "300": 0   },
       draws:  { "0": 0,   "60": 0,   "180": 0,   "300": 0   },
       gamesPlayed: 0,
       createdAt, updatedAt
     }
   The map keys ("0","60","180","300") are the four time controls in
   seconds-per-player (0 = no timer), so each player has one Elo per
   time control rather than a single blended number.
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDTlON2VFYZCunyQeuhjdO51Bxpt0FUOiE",
  authDomain: "chess-99d58.firebaseapp.com",
  projectId: "chess-99d58",
  storageBucket: "chess-99d58.firebasestorage.app",
  messagingSenderId: "630200658837",
  appId: "1:630200658837:web:6919bfb932f90ba54c649c",
  measurementId: "G-NR0X6SDK77"
};

let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
} catch (err) {
  console.error('Firebase failed to initialize — leaderboard and Elo will be unavailable.', err);
}
