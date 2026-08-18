/* =========================================================
   Endgame — a self-contained chess engine + UI
   Board convention: row 0 = rank 8 (black back rank)
                      row 7 = rank 1 (white back rank)
                      col 0 = file a ... col 7 = file h
   ========================================================= */

const PIECE_UNICODE = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};

const FILES = ['a','b','c','d','e','f','g','h'];

// Simple material + piece-square tables for the AI evaluation
const MATERIAL = { P:100, N:320, B:330, R:500, Q:900, K:0 };

const PST_PAWN = [
  0,  0,  0,  0,  0,  0,  0,  0,
 50, 50, 50, 50, 50, 50, 50, 50,
 10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];
const PST_KNIGHT = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50
];
const PST_BISHOP = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20
];
const PST_ROOK = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5, 10, 10, 10, 10, 10, 10,  5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
  0,  0,  0,  5,  5,  0,  0,  0
];
const PST_QUEEN = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20
];
const PST_KING = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20
];
const PST = { P: PST_PAWN, N: PST_KNIGHT, B: PST_BISHOP, R: PST_ROOK, Q: PST_QUEEN, K: PST_KING };

/* ============ Game State ============ */

let state = null;       // current game state
let mode = null;        // 'computer' | 'twoplayer'
let aiDepth = 2;
let aiColor = 'b';      // computer always plays black
let selected = null;    // {r,c}
let legalTargets = [];  // legal destinations for selected piece
let pendingPromotion = null; // {fromR,fromC,toR,toC}
let aiThinking = false;
let gameOver = false;

function freshState(){
  const board = Array.from({length:8}, ()=>Array(8).fill(null));
  const backRank = ['R','N','B','Q','K','B','N','R'];
  for (let c=0;c<8;c++){
    board[0][c] = { type: backRank[c], color:'b' };
    board[1][c] = { type:'P', color:'b' };
    board[6][c] = { type:'P', color:'w' };
    board[7][c] = { type: backRank[c], color:'w' };
  }
  return {
    board,
    turn: 'w',
    castling: { wK:true, wQ:true, bK:true, bQ:true },
    epTarget: null,          // {r,c} square a pawn can capture into en passant
    history: [],             // for undo
    moveLog: [],             // display strings
    kingPos: { w:{r:7,c:4}, b:{r:0,c:4} }
  };
}

function cloneBoard(board){
  return board.map(row => row.map(cell => cell ? { type:cell.type, color:cell.color } : null));
}

/* ============ Move Generation ============ */

const DIRS_ROOK = [[1,0],[-1,0],[0,1],[0,-1]];
const DIRS_BISHOP = [[1,1],[1,-1],[-1,1],[-1,-1]];
const DIRS_KNIGHT = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const DIRS_KING = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }

// Returns pseudo-legal moves (doesn't check for self-check) for the piece at r,c
function pseudoMovesFor(st, r, c){
  const board = st.board;
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const color = piece.color;
  const enemy = color === 'w' ? 'b' : 'w';

  const addSlide = (dirs) => {
    for (const [dr,dc] of dirs){
      let nr=r+dr, nc=c+dc;
      while (inBounds(nr,nc)){
        const target = board[nr][nc];
        if (!target){
          moves.push({ fromR:r, fromC:c, toR:nr, toC:nc });
        } else {
          if (target.color === enemy) moves.push({ fromR:r, fromC:c, toR:nr, toC:nc, capture:true });
          break;
        }
        nr+=dr; nc+=dc;
      }
    }
  };

  switch (piece.type){
    case 'R': addSlide(DIRS_ROOK); break;
    case 'B': addSlide(DIRS_BISHOP); break;
    case 'Q': addSlide(DIRS_ROOK.concat(DIRS_BISHOP)); break;
    case 'N': {
      for (const [dr,dc] of DIRS_KNIGHT){
        const nr=r+dr, nc=c+dc;
        if (!inBounds(nr,nc)) continue;
        const target = board[nr][nc];
        if (!target || target.color===enemy) moves.push({ fromR:r, fromC:c, toR:nr, toC:nc, capture: !!target });
      }
      break;
    }
    case 'K': {
      for (const [dr,dc] of DIRS_KING){
        const nr=r+dr, nc=c+dc;
        if (!inBounds(nr,nc)) continue;
        const target = board[nr][nc];
        if (!target || target.color===enemy) moves.push({ fromR:r, fromC:c, toR:nr, toC:nc, capture: !!target });
      }
      // Castling
      const rights = st.castling;
      const homeRow = color === 'w' ? 7 : 0;
      if (r === homeRow && c === 4 && !isInCheck(st, color)){
        // King side
        const kFlag = color === 'w' ? rights.wK : rights.bK;
        if (kFlag && !board[homeRow][5] && !board[homeRow][6]
            && board[homeRow][7] && board[homeRow][7].type==='R' && board[homeRow][7].color===color
            && !isSquareAttacked(st, homeRow, 5, enemy) && !isSquareAttacked(st, homeRow, 6, enemy)){
          moves.push({ fromR:r, fromC:c, toR:homeRow, toC:6, castle:'K' });
        }
        // Queen side
        const qFlag = color === 'w' ? rights.wQ : rights.bQ;
        if (qFlag && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3]
            && board[homeRow][0] && board[homeRow][0].type==='R' && board[homeRow][0].color===color
            && !isSquareAttacked(st, homeRow, 3, enemy) && !isSquareAttacked(st, homeRow, 2, enemy)){
          moves.push({ fromR:r, fromC:c, toR:homeRow, toC:2, castle:'Q' });
        }
      }
      break;
    }
    case 'P': {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promoRow = color === 'w' ? 0 : 7;
      const oneR = r+dir;
      if (inBounds(oneR,c) && !board[oneR][c]){
        if (oneR === promoRow){
          for (const p of ['Q','R','B','N']) moves.push({ fromR:r, fromC:c, toR:oneR, toC:c, promotion:p });
        } else {
          moves.push({ fromR:r, fromC:c, toR:oneR, toC:c });
          const twoR = r+dir*2;
          if (r === startRow && !board[twoR][c]) moves.push({ fromR:r, fromC:c, toR:twoR, toC:c, doubleStep:true });
        }
      }
      for (const dc of [-1,1]){
        const nr=r+dir, nc=c+dc;
        if (!inBounds(nr,nc)) continue;
        const target = board[nr][nc];
        if (target && target.color===enemy){
          if (nr === promoRow){
            for (const p of ['Q','R','B','N']) moves.push({ fromR:r, fromC:c, toR:nr, toC:nc, capture:true, promotion:p });
          } else {
            moves.push({ fromR:r, fromC:c, toR:nr, toC:nc, capture:true });
          }
        } else if (st.epTarget && st.epTarget.r===nr && st.epTarget.c===nc){
          moves.push({ fromR:r, fromC:c, toR:nr, toC:nc, capture:true, enPassant:true });
        }
      }
      break;
    }
  }
  return moves;
}

function isSquareAttacked(st, r, c, byColor){
  const board = st.board;
  // Pawn attacks
  const pawnDir = byColor === 'w' ? 1 : -1; // white pawn attacks from row+1 towards target (since white moves -1)
  for (const dc of [-1,1]){
    const pr = r+pawnDir, pc = c+dc;
    if (inBounds(pr,pc)){
      const p = board[pr][pc];
      if (p && p.type==='P' && p.color===byColor) return true;
    }
  }
  // Knight attacks
  for (const [dr,dc] of DIRS_KNIGHT){
    const nr=r+dr, nc=c+dc;
    if (!inBounds(nr,nc)) continue;
    const p = board[nr][nc];
    if (p && p.type==='N' && p.color===byColor) return true;
  }
  // King attacks
  for (const [dr,dc] of DIRS_KING){
    const nr=r+dr, nc=c+dc;
    if (!inBounds(nr,nc)) continue;
    const p = board[nr][nc];
    if (p && p.type==='K' && p.color===byColor) return true;
  }
  // Sliding: rook/queen
  for (const [dr,dc] of DIRS_ROOK){
    let nr=r+dr, nc=c+dc;
    while (inBounds(nr,nc)){
      const p = board[nr][nc];
      if (p){
        if (p.color===byColor && (p.type==='R' || p.type==='Q')) return true;
        break;
      }
      nr+=dr; nc+=dc;
    }
  }
  // Sliding: bishop/queen
  for (const [dr,dc] of DIRS_BISHOP){
    let nr=r+dr, nc=c+dc;
    while (inBounds(nr,nc)){
      const p = board[nr][nc];
      if (p){
        if (p.color===byColor && (p.type==='B' || p.type==='Q')) return true;
        break;
      }
      nr+=dr; nc+=dc;
    }
  }
  return false;
}

function isInCheck(st, color){
  const kp = st.kingPos[color];
  const enemy = color==='w' ? 'b' : 'w';
  return isSquareAttacked(st, kp.r, kp.c, enemy);
}

// Apply a move to state IN PLACE, returns an undo record
function applyMove(st, move){
  const board = st.board;
  const piece = board[move.fromR][move.fromC];
  const color = piece.color;
  const undo = {
    move,
    capturedPiece: board[move.toR][move.toC],
    prevEpTarget: st.epTarget,
    prevCastling: { ...st.castling },
    prevKingPos: { w:{...st.kingPos.w}, b:{...st.kingPos.b} },
    epCapturedPiece: null,
    epCapturedPos: null,
    rookMove: null
  };

  // En passant capture removes a pawn NOT on the destination square
  if (move.enPassant){
    const capR = color==='w' ? move.toR+1 : move.toR-1;
    undo.epCapturedPiece = board[capR][move.toC];
    undo.epCapturedPos = { r:capR, c:move.toC };
    board[capR][move.toC] = null;
  }

  // Move the piece
  board[move.toR][move.toC] = piece;
  board[move.fromR][move.fromC] = null;

  // Promotion
  if (move.promotion){
    board[move.toR][move.toC] = { type: move.promotion, color };
  }

  // Castling: move the rook too
  if (move.castle){
    const homeRow = move.fromR;
    if (move.castle === 'K'){
      board[homeRow][5] = board[homeRow][7];
      board[homeRow][7] = null;
      undo.rookMove = { fromR:homeRow, fromC:7, toR:homeRow, toC:5 };
    } else {
      board[homeRow][3] = board[homeRow][0];
      board[homeRow][0] = null;
      undo.rookMove = { fromR:homeRow, fromC:0, toR:homeRow, toC:3 };
    }
  }

  // Update king position
  if (piece.type === 'K'){
    st.kingPos[color] = { r: move.toR, c: move.toC };
  }

  // Update castling rights
  if (piece.type === 'K'){
    if (color==='w'){ st.castling.wK=false; st.castling.wQ=false; }
    else { st.castling.bK=false; st.castling.bQ=false; }
  }
  const clearRookRight = (r,c) => {
    if (r===7 && c===0) st.castling.wQ=false;
    if (r===7 && c===7) st.castling.wK=false;
    if (r===0 && c===0) st.castling.bQ=false;
    if (r===0 && c===7) st.castling.bK=false;
  };
  if (piece.type==='R') clearRookRight(move.fromR, move.fromC);
  if (undo.capturedPiece && undo.capturedPiece.type==='R') clearRookRight(move.toR, move.toC);

  // Update en passant target
  if (move.doubleStep){
    st.epTarget = { r: (move.fromR+move.toR)/2, c: move.fromC };
  } else {
    st.epTarget = null;
  }

  return undo;
}

function undoMove(st, undo){
  const board = st.board;
  const move = undo.move;
  const piece = board[move.toR][move.toC];
  const color = piece.color;

  // Undo promotion: piece becomes pawn again
  const restoredPiece = move.promotion ? { type:'P', color } : piece;

  board[move.fromR][move.fromC] = restoredPiece;
  board[move.toR][move.toC] = undo.capturedPiece || null;

  if (move.enPassant){
    board[undo.epCapturedPos.r][undo.epCapturedPos.c] = undo.epCapturedPiece;
  }

  if (undo.rookMove){
    const rm = undo.rookMove;
    board[rm.fromR][rm.fromC] = board[rm.toR][rm.toC];
    board[rm.toR][rm.toC] = null;
  }

  st.epTarget = undo.prevEpTarget;
  st.castling = undo.prevCastling;
  st.kingPos = undo.prevKingPos;
}

// Legal moves for one square (filters out moves that leave own king in check)
function legalMovesFor(st, r, c){
  const piece = st.board[r][c];
  if (!piece) return [];
  const pseudo = pseudoMovesFor(st, r, c);
  const legal = [];
  for (const m of pseudo){
    const undo = applyMove(st, m);
    if (!isInCheck(st, piece.color)) legal.push(m);
    undoMove(st, undo);
  }
  return legal;
}

// All legal moves for a color
function allLegalMoves(st, color){
  const moves = [];
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const p = st.board[r][c];
      if (p && p.color===color){
        moves.push(...legalMovesFor(st, r, c));
      }
    }
  }
  return moves;
}

function gameStatus(st, color){
  const moves = allLegalMoves(st, color);
  const inCheck = isInCheck(st, color);
  if (moves.length===0){
    return inCheck ? 'checkmate' : 'stalemate';
  }
  return inCheck ? 'check' : 'normal';
}

/* ============ AI ============ */

function evaluateBoard(st){
  let score = 0;
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const p = st.board[r][c];
      if (!p) continue;
      const table = PST[p.type];
      const idx = p.color==='w' ? r*8+c : (7-r)*8+c;
      const val = MATERIAL[p.type] + (table ? table[idx] : 0);
      score += p.color==='w' ? val : -val;
    }
  }
  return score; // positive favors white
}

function orderMoves(moves){
  // Captures and promotions first for better alpha-beta pruning
  return moves.slice().sort((a,b)=>{
    const av = (a.capture?10:0) + (a.promotion?9:0);
    const bv = (b.capture?10:0) + (b.promotion?9:0);
    return bv-av;
  });
}

function negamax(st, depth, alpha, beta, colorSign){
  if (depth===0){
    return colorSign * evaluateBoard(st);
  }
  const color = colorSign===1 ? 'w' : 'b';
  const moves = orderMoves(allLegalMoves(st, color));
  if (moves.length===0){
    if (isInCheck(st, color)) return -100000 - depth; // checkmated: very bad
    return 0; // stalemate
  }
  let best = -Infinity;
  for (const m of moves){
    const undo = applyMove(st, m);
    const val = -negamax(st, depth-1, -beta, -alpha, -colorSign);
    undoMove(st, undo);
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function pickAiMove(st, depth){
  const moves = orderMoves(allLegalMoves(st, aiColor));
  if (moves.length===0) return null;
  const colorSign = aiColor==='w' ? 1 : -1;
  let best = -Infinity;
  let bestMoves = [];
  let alpha = -Infinity, beta = Infinity;
  for (const m of moves){
    const undo = applyMove(st, m);
    const val = -negamax(st, depth-1, -beta, -alpha, -colorSign);
    undoMove(st, undo);
    if (val > best + 0.0001){
      best = val;
      bestMoves = [m];
    } else if (Math.abs(val-best) < 0.0001){
      bestMoves.push(m);
    }
    if (best > alpha) alpha = best;
  }
  // Casual difficulty: occasionally pick a slightly weaker move for texture
  if (depth<=1 && bestMoves.length>0 && Math.random()<0.35 && moves.length>1){
    const alt = moves[Math.floor(Math.random()*moves.length)];
    return alt;
  }
  return bestMoves[Math.floor(Math.random()*bestMoves.length)];
}

/* ============ UI ============ */

const boardEl = document.getElementById('board');
const modeScreen = document.getElementById('modeScreen');
const gameScreen = document.getElementById('gameScreen');
const difficultyRow = document.getElementById('difficultyRow');
const difficultyOptions = document.getElementById('difficultyOptions');
const pickComputerBtn = document.getElementById('pickComputer');
const pickTwoPlayerBtn = document.getElementById('pickTwoPlayer');
const startComputerGameBtn = document.getElementById('startComputerGame');
const pickOnlineBtn = document.getElementById('pickOnline');
const onlineRow = document.getElementById('onlineRow');
const roomCodeInput = document.getElementById('roomCodeInput');
const generateCodeBtn = document.getElementById('generateCodeBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const onlineStatusText = document.getElementById('onlineStatusText');
const onlineWaitPanel = document.getElementById('onlineWaitPanel');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const cancelOnlineBtn = document.getElementById('cancelOnlineBtn');
const onlineWaitStatus = document.getElementById('onlineWaitStatus');
const roomPanelBlock = document.getElementById('roomPanelBlock');
const roomCodeLabel = document.getElementById('roomCodeLabel');
const connectionStatusLabel = document.getElementById('connectionStatusLabel');
const undoBtn = document.getElementById('undoBtn');
const premoveBanner = document.getElementById('premoveBanner');
const topPlayerClock = document.getElementById('topPlayerClock');
const bottomPlayerClock = document.getElementById('bottomPlayerClock');
const timeControlOptions = document.getElementById('timeControlOptions');
const playerNameInput = document.getElementById('playerNameInput');
const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');
const leaderboardScreen = document.getElementById('leaderboardScreen');
const leaderboardTabs = document.getElementById('leaderboardTabs');
const leaderboardList = document.getElementById('leaderboardList');
const leaderboardStatus = document.getElementById('leaderboardStatus');
const leaderboardBackBtn = document.getElementById('leaderboardBackBtn');
const gameOverEloText = document.getElementById('gameOverEloText');
const turnText = document.getElementById('turnText');
const turnDot = document.getElementById('turnDot');
const moveLogEl = document.getElementById('moveLog');
const statusLabel = document.getElementById('statusLabel');
const modeLabel = document.getElementById('modeLabel');
const promoPicker = document.getElementById('promoPicker');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const gameOverEyebrow = document.getElementById('gameOverEyebrow');
const gameOverTitle = document.getElementById('gameOverTitle');
const topPlayerName = document.getElementById('topPlayerName');
const bottomPlayerName = document.getElementById('bottomPlayerName');
const topCaptures = document.getElementById('topCaptures');
const bottomCaptures = document.getElementById('bottomCaptures');

pickComputerBtn.addEventListener('click', () => {
  pickComputerBtn.classList.add('is-active');
  difficultyRow.hidden = false;
  onlineRow.hidden = true;
  onlineWaitPanel.hidden = true;
  difficultyRow.scrollIntoView({ behavior:'smooth', block:'nearest' });
});

pickOnlineBtn.addEventListener('click', () => {
  pickComputerBtn.classList.remove('is-active');
  difficultyRow.hidden = true;
  onlineRow.hidden = false;
  onlineStatusText.textContent = '';
  try{
    const savedName = localStorage.getItem('endgame-player-name');
    if (savedName && !playerNameInput.value) playerNameInput.value = savedName;
  } catch(e){ /* localStorage unavailable — name just won't be pre-filled */ }
  onlineRow.scrollIntoView({ behavior:'smooth', block:'nearest' });
});

viewLeaderboardBtn.addEventListener('click', () => {
  modeScreen.hidden = true;
  leaderboardScreen.hidden = false;
  loadLeaderboard(selectedLeaderboardSeconds);
});

leaderboardBackBtn.addEventListener('click', () => {
  leaderboardScreen.hidden = true;
  modeScreen.hidden = false;
});

leaderboardTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.diff-btn');
  if (!btn) return;
  [...leaderboardTabs.children].forEach(b=>b.classList.remove('is-active'));
  btn.classList.add('is-active');
  selectedLeaderboardSeconds = parseInt(btn.dataset.seconds, 10) || 0;
  loadLeaderboard(selectedLeaderboardSeconds);
});

generateCodeBtn.addEventListener('click', () => {
  roomCodeInput.value = randomRoomCode();
});

timeControlOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.diff-btn');
  if (!btn) return;
  [...timeControlOptions.children].forEach(b=>b.classList.remove('is-active'));
  btn.classList.add('is-active');
  selectedTimeControl = parseInt(btn.dataset.seconds, 10) || 0;
});

roomCodeInput.addEventListener('input', () => {
  const caret = roomCodeInput.selectionStart;
  roomCodeInput.value = sanitizeRoomCode(roomCodeInput.value);
  roomCodeInput.setSelectionRange(caret, caret);
});

createRoomBtn.addEventListener('click', async () => {
  const name = sanitizePlayerName(playerNameInput.value);
  if (!name){
    onlineStatusText.textContent = 'Enter your name first — it\u2019s how your rating is tracked.';
    return;
  }
  const code = sanitizeRoomCode(roomCodeInput.value) || randomRoomCode();
  roomCodeInput.value = code;
  createRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
  onlineStatusText.textContent = 'Loading your profile…';
  const loaded = await loadPlayerProfile(name);
  createRoomBtn.disabled = false;
  joinRoomBtn.disabled = false;
  if (!loaded){
    onlineStatusText.textContent = "Couldn't reach the leaderboard — check your connection and try again.";
    return;
  }
  onlineStatusText.textContent = '';
  hostRoom(code);
});

joinRoomBtn.addEventListener('click', async () => {
  const name = sanitizePlayerName(playerNameInput.value);
  if (!name){
    onlineStatusText.textContent = 'Enter your name first — it\u2019s how your rating is tracked.';
    return;
  }
  const code = sanitizeRoomCode(roomCodeInput.value);
  if (!code){
    onlineStatusText.textContent = 'Enter a room code first.';
    return;
  }
  createRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
  onlineStatusText.textContent = 'Loading your profile…';
  const loaded = await loadPlayerProfile(name);
  createRoomBtn.disabled = false;
  joinRoomBtn.disabled = false;
  if (!loaded){
    onlineStatusText.textContent = "Couldn't reach the leaderboard — check your connection and try again.";
    return;
  }
  onlineStatusText.textContent = 'Connecting…';
  joinRoom(code);
});

cancelOnlineBtn.addEventListener('click', () => {
  teardownConnection();
  onlineWaitPanel.hidden = true;
  onlineRow.hidden = false;
});

copyLinkBtn.addEventListener('click', () => {
  const url = new URL(window.location.href);
  url.searchParams.set('code', onlineRoomCode);
  const linkText = url.toString();
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(linkText)
      .then(() => { onlineWaitStatus.textContent = 'Link copied! Send it to your opponent.'; })
      .catch(() => { onlineWaitStatus.textContent = `Share this link: ${linkText}`; });
  } else {
    onlineWaitStatus.textContent = `Share this link: ${linkText}`;
  }
});

difficultyOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.diff-btn');
  if (!btn) return;
  [...difficultyOptions.children].forEach(b=>b.classList.remove('is-active'));
  btn.classList.add('is-active');
  aiDepth = parseInt(btn.dataset.depth, 10);
});

startComputerGameBtn.addEventListener('click', () => {
  mode = 'computer';
  startGame();
});

pickTwoPlayerBtn.addEventListener('click', () => {
  mode = 'twoplayer';
  startGame();
});

function leaveOnlineGameIfNeeded(){
  if (mode === 'online'){
    sendData({ type:'leave' });
    teardownConnection();
  }
}

document.getElementById('menuBtn').addEventListener('click', () => { leaveOnlineGameIfNeeded(); backToMenu(); });
document.getElementById('menuFromOverBtn').addEventListener('click', () => { leaveOnlineGameIfNeeded(); backToMenu(); });
document.getElementById('rematchBtn').addEventListener('click', () => {
  if (mode === 'online'){
    if (!isOnlineHost || !onlineConnected) return; // only the host restarts online games
    sendData({ type:'restart' });
  }
  startGame();
});
document.getElementById('undoBtn').addEventListener('click', undoLastTurn);
document.getElementById('resignBtn').addEventListener('click', () => {
  if (gameOver) return;
  if (mode === 'online' && !onlineConnected) return;
  const winner = state.turn === 'w' ? 'Black' : 'White';
  if (mode === 'online') sendData({ type:'resign' });
  endGame('Resignation', `${winner} wins`, 0);
});

function backToMenu(){
  gameScreen.hidden = true;
  modeScreen.hidden = false;
  pickComputerBtn.classList.remove('is-active');
  difficultyRow.hidden = true;
  onlineRow.hidden = true;
  onlineWaitPanel.hidden = true;
  roomPanelBlock.hidden = true;
}

function startGame(){
  state = freshState();
  selected = null;
  legalTargets = [];
  pendingPromotion = null;
  premoveQueue = [];
  premoveSelected = null;
  premoveTargets = [];
  pendingPremovePromotion = null;
  premoveBanner.hidden = true;
  aiThinking = false;
  gameOver = false;
  gameOverOverlay.hidden = true;
  gameOverEloText.hidden = true;
  promoPicker.hidden = true;
  moveLogEl.innerHTML = '';
  statusLabel.textContent = 'In progress';

  if (mode === 'online'){
    const timeLabel = onlineTimeControl > 0 ? `${onlineTimeControl/60} min` : 'No timer';
    modeLabel.textContent = `Online — Room ${onlineRoomCode} · ${timeLabel}`;
    const oppLabel = opponentName ? `${opponentName} (${opponentElo ?? 100})` : (onlineColor === 'w' ? 'Opponent (Black)' : 'Opponent (White)');
    const meLabel = myName ? `${myName} (${getMyEloFor(onlineTimeControl)})` : (onlineColor === 'w' ? 'You (White)' : 'You (Black)');
    topPlayerName.textContent = oppLabel;
    bottomPlayerName.textContent = meLabel;
    roomPanelBlock.hidden = false;
    roomCodeLabel.textContent = onlineRoomCode;
    connectionStatusLabel.textContent = 'Connected';
    undoBtn.hidden = true;
    if (onlineTimeControl > 0){
      startClock();
    } else {
      stopClock();
      topPlayerClock.hidden = true;
      bottomPlayerClock.hidden = true;
    }
  } else {
    modeLabel.textContent = mode === 'computer'
      ? `Vs. Computer — ${ {1:'Casual',2:'Club',3:'Sharp'}[aiDepth] }`
      : 'Two Players';
    topPlayerName.textContent = mode === 'computer' ? 'Computer' : 'Black';
    bottomPlayerName.textContent = 'White';
    roomPanelBlock.hidden = true;
    undoBtn.hidden = false;
    stopClock();
    topPlayerClock.hidden = true;
    bottomPlayerClock.hidden = true;
  }
  topCaptures.textContent = '';
  bottomCaptures.textContent = '';

  modeScreen.hidden = true;
  gameScreen.hidden = false;

  renderBoard();
  updateTurnBanner();
}

function squareId(r,c){ return `${FILES[c]}${8-r}`; }

function renderBoard(){
  boardEl.innerHTML = '';
  boardEl.classList.toggle('is-flipped', mode === 'online' && onlineColor === 'b');
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r+c)%2===0 ? 'light' : 'dark');
      sq.dataset.r = r;
      sq.dataset.c = c;

      if (c===0){
        const rankLabel = document.createElement('span');
        rankLabel.className = 'coord rank';
        rankLabel.textContent = 8-r;
        sq.appendChild(rankLabel);
      }
      if (r===7){
        const fileLabel = document.createElement('span');
        fileLabel.className = 'coord file';
        fileLabel.textContent = FILES[c];
        sq.appendChild(fileLabel);
      }

      const piece = state.board[r][c];
      if (piece){
        const span = document.createElement('span');
        span.className = 'piece ' + (piece.color==='w' ? 'white' : 'black');
        span.textContent = PIECE_UNICODE[piece.color+piece.type];
        sq.appendChild(span);
        sq.classList.add('has-piece');
      }

      sq.addEventListener('click', onSquareClick);
      boardEl.appendChild(sq);
    }
  }
  applyHighlights();
}

function applyHighlights(){
  const lastMove = state.history[state.history.length-1]?.move;
  [...boardEl.children].forEach(sq=>{
    const r = +sq.dataset.r, c = +sq.dataset.c;
    sq.classList.remove('is-selected','is-legal','is-check','is-last-move','is-premove-selected','is-premove-target','is-premove-queued');
    if (selected && selected.r===r && selected.c===c) sq.classList.add('is-selected');
    if (legalTargets.some(m=>m.toR===r && m.toC===c)) sq.classList.add('is-legal');
    if (premoveSelected && premoveSelected.r===r && premoveSelected.c===c) sq.classList.add('is-premove-selected');
    if (premoveTargets.some(m=>m.toR===r && m.toC===c)) sq.classList.add('is-premove-target');
    if (premoveQueue.some(m => (m.fromR===r && m.fromC===c) || (m.toR===r && m.toC===c))) sq.classList.add('is-premove-queued');
    if (lastMove && ((lastMove.fromR===r && lastMove.fromC===c) || (lastMove.toR===r && lastMove.toC===c))){
      sq.classList.add('is-last-move');
    }
  });
  if (isInCheck(state, state.turn)){
    const kp = state.kingPos[state.turn];
    const idx = kp.r*8+kp.c;
    boardEl.children[idx]?.classList.add('is-check');
  }
}

function onSquareClick(e){
  if (gameOver || pendingPromotion || pendingPremovePromotion || aiThinking) return;
  const sq = e.currentTarget;
  const r = +sq.dataset.r, c = +sq.dataset.c;

  if (mode==='computer' && state.turn === aiColor){
    handlePremoveClick(r,c);
    return;
  }
  if (mode==='online'){
    if (!onlineConnected) return;
    if (state.turn !== onlineColor){
      handlePremoveClick(r,c);
      return;
    }
  }

  const piece = state.board[r][c];

  if (selected){
    const move = legalTargets.find(m=>m.toR===r && m.toC===c);
    if (move){
      if (move.promotion && !pendingPromotion){
        // gather all promotion options for this from/to and ask user
        openPromotionPicker(selected.r, selected.c, r, c);
        return;
      }
      commitMove(move);
      return;
    }
    // clicking another own piece re-selects
    if (piece && piece.color===state.turn){
      selectSquare(r,c);
    } else {
      clearSelection();
    }
  } else if (piece && piece.color===state.turn){
    selectSquare(r,c);
  }
}

function selectSquare(r,c){
  clearPremoveQueue();
  selected = { r, c };
  legalTargets = legalMovesFor(state, r, c);
  applyHighlights();
}

function clearSelection(){
  selected = null;
  legalTargets = [];
  applyHighlights();
}

function openPromotionPicker(fromR, fromC, toR, toC){
  pendingPromotion = { fromR, fromC, toR, toC };
  promoPicker.innerHTML = '';
  promoPicker.hidden = false;
  const color = state.board[fromR][fromC].color;
  for (const type of ['Q','R','B','N']){
    const btn = document.createElement('button');
    btn.className = 'promo-choice';
    btn.textContent = PIECE_UNICODE[color+type];
    btn.addEventListener('click', () => {
      const move = legalTargets.find(m=>m.toR===toR && m.toC===toC && m.promotion===type);
      promoPicker.hidden = true;
      pendingPromotion = null;
      commitMove(move);
    });
    promoPicker.appendChild(btn);
  }
}

function openPremoPromotionPicker(color){
  promoPicker.innerHTML = '';
  promoPicker.hidden = false;
  for (const type of ['Q','R','B','N']){
    const btn = document.createElement('button');
    btn.className = 'promo-choice';
    btn.textContent = PIECE_UNICODE[color+type];
    btn.addEventListener('click', () => {
      promoPicker.hidden = true;
      const { fromR, fromC, toR, toC } = pendingPremovePromotion;
      pendingPremovePromotion = null;
      setPremove({ fromR, fromC, toR, toC, promotion: type });
    });
    promoPicker.appendChild(btn);
  }
}

function pieceLetter(type){
  return type==='N' ? 'N' : type; // standard algebraic uses N for knight
}

function moveToAlgebraic(st, move, pieceType, isCheck, isMate){
  const destFile = FILES[move.toC];
  const destRank = 8-move.toR;
  if (move.castle==='K') return isMate ? 'O-O#' : (isCheck ? 'O-O+' : 'O-O');
  if (move.castle==='Q') return isMate ? 'O-O-O#' : (isCheck ? 'O-O-O+' : 'O-O-O');

  let s = '';
  if (pieceType !== 'P'){
    s += pieceLetter(pieceType);
    s += (FILES[move.fromC]) + (8-move.fromR); // disambiguation kept simple: include origin square
  } else if (move.capture){
    s += FILES[move.fromC];
  }
  s += (move.capture ? 'x' : '') + destFile + destRank;
  if (move.promotion) s += '=' + move.promotion;
  if (isMate) s += '#';
  else if (isCheck) s += '+';
  return s;
}

function commitMove(move, fromRemote){
  if (mode === 'online' && !fromRemote){
    sendData({ type:'move', move: { fromR:move.fromR, fromC:move.fromC, toR:move.toR, toC:move.toC, promotion: move.promotion || null } });
  }
  const piece = state.board[move.fromR][move.fromC];
  const pieceType = piece.type;
  const mover = piece.color;

  const undo = applyMove(state, move);
  state.history.push(undo);

  const opponent = mover==='w' ? 'b' : 'w';
  const oppStatus = gameStatus(state, opponent);
  const isCheck = oppStatus==='check' || oppStatus==='checkmate';
  const isMate = oppStatus==='checkmate';

  const notation = moveToAlgebraic(state, move, pieceType, isCheck, isMate);
  state.moveLog.push({ color: mover, notation, captured: undo.capturedPiece || undo.epCapturedPiece });

  state.turn = opponent;
  selected = null;
  legalTargets = [];

  renderBoard();
  renderMoveLog();
  renderCaptures();
  updateTurnBanner();

  if (oppStatus==='checkmate'){
    endGame('Checkmate', `${mover==='w'?'White':'Black'} wins`, mover===onlineColor ? 1 : 0);
    return;
  }
  if (oppStatus==='stalemate'){
    endGame('Stalemate', 'Draw', 0.5);
    return;
  }
  statusLabel.textContent = isCheck ? 'Check!' : 'In progress';

  if (mode === 'online' && onlineTimeControl > 0) resumeClockForTurn();

  if (mode==='computer' && state.turn === aiColor && !gameOver){
    aiThinking = true;
    statusLabel.textContent = 'Computer is thinking…';
    setTimeout(runAiMove, 260);
  }

  maybeExecutePremove();
}

function runAiMove(){
  const move = pickAiMove(state, aiDepth);
  aiThinking = false;
  if (!move){ return; }
  commitMove(move);
}

function renderMoveLog(){
  moveLogEl.innerHTML = '';
  const log = state.moveLog;
  for (let i=0;i<log.length;i+=2){
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'mv-num';
    num.textContent = (i/2+1) + '.';
    li.appendChild(num);
    const white = document.createElement('span');
    white.textContent = log[i] ? log[i].notation : '';
    li.appendChild(white);
    if (log[i+1]){
      const black = document.createElement('span');
      black.textContent = log[i+1].notation;
      li.appendChild(black);
    }
    moveLogEl.appendChild(li);
  }
  moveLogEl.scrollTop = moveLogEl.scrollHeight;
}

function renderCaptures(){
  const capturedByWhite = state.moveLog.filter(m=>m.color==='w' && m.captured).map(m=>m.captured);
  const capturedByBlack = state.moveLog.filter(m=>m.color==='b' && m.captured).map(m=>m.captured);
  bottomCaptures.textContent = capturedByWhite.map(p=>PIECE_UNICODE['b'+p.type]).join(' ');
  topCaptures.textContent = capturedByBlack.map(p=>PIECE_UNICODE['w'+p.type]).join(' ');
}

function updateTurnBanner(){
  turnText.textContent = (state.turn==='w' ? 'White' : 'Black') + ' to move';
  turnDot.classList.toggle('is-black', state.turn==='b');
}

function endGame(eyebrow, title, resultForMe){
  gameOver = true;
  stopClock();
  clearPremoveQueue();
  statusLabel.textContent = title;
  gameOverEyebrow.textContent = eyebrow;
  gameOverTitle.textContent = title;
  gameOverOverlay.hidden = false;

  const rematchBtn = document.getElementById('rematchBtn');
  if (mode === 'online' && !isOnlineHost){
    rematchBtn.disabled = true;
    rematchBtn.textContent = 'Waiting for host…';
  } else {
    rematchBtn.disabled = false;
    rematchBtn.textContent = 'Rematch';
  }

  if (mode === 'online' && typeof resultForMe === 'number' && myName){
    recordOnlineResult(resultForMe);
  } else {
    gameOverEloText.hidden = true;
  }
}

function undoLastTurn(){
  if (mode === 'online') return; // undo isn't supported in online games
  if (aiThinking) return;
  // In computer mode, undo both the AI's move and the player's move so it's the player's turn again
  const stepsToUndo = (mode==='computer' && state.history.length>=2) ? 2 : (state.history.length>=1 ? 1 : 0);
  if (stepsToUndo===0) return;
  for (let i=0;i<stepsToUndo;i++){
    const undo = state.history.pop();
    if (!undo) break;
    undoMove(state, undo);
    state.moveLog.pop();
    state.turn = state.turn==='w' ? 'b' : 'w';
  }
  gameOver = false;
  gameOverOverlay.hidden = true;
  selected = null;
  legalTargets = [];
  clearPremoveQueue();
  renderBoard();
  renderMoveLog();
  renderCaptures();
  updateTurnBanner();
  statusLabel.textContent = 'In progress';
}

/* ============ Online Multiplayer (WebRTC via PeerJS) ============
   Two devices "pair" by both using the same room code. The code is turned
   into a PeerJS peer id; whoever creates the room becomes that peer id and
   plays White, and whoever joins connects directly to it and plays Black.
   Once the peer-to-peer data channel is open, moves are sent as small JSON
   messages and applied locally on each side — no server ever sees the game.
   ================================================================= */

const PEER_ID_PREFIX = 'endgame-chess-room-';

let peer = null;
let conn = null;
let onlineColor = null;      // 'w' or 'b' — which side the local player is on
let isOnlineHost = false;
let onlineRoomCode = null;
let onlineConnected = false;
let selectedTimeControl = 0; // seconds per player, as chosen on the setup panel (host only)
let onlineTimeControl = 0;   // seconds per player actually in effect for the current game

function sanitizeRoomCode(raw){
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function randomRoomCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I for readability
  let out = '';
  for (let i=0;i<5;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function teardownConnection(){
  if (conn){ try{ conn.close(); }catch(e){} conn = null; }
  if (peer){ try{ peer.destroy(); }catch(e){} peer = null; }
  onlineConnected = false;
}

function hostRoom(code){
  teardownConnection();
  onlineRoomCode = code;
  isOnlineHost = true;
  onlineColor = 'w';
  onlineTimeControl = selectedTimeControl;
  onlineRow.hidden = true;
  onlineWaitPanel.hidden = false;
  roomCodeDisplay.textContent = code;
  onlineWaitStatus.textContent = 'Share this code or link with your opponent.';

  try{
    history.replaceState(null, '', '?code=' + code);
  } catch(e){ /* ignore */ }

  peer = new Peer(PEER_ID_PREFIX + code);

  peer.on('connection', (c) => {
    if (conn){ c.close(); return; } // room already has an opponent
    conn = c;
    conn.on('open', () => wireConnection());
  });

  peer.on('error', (err) => {
    if (err && err.type === 'unavailable-id'){
      onlineWaitStatus.textContent = 'That code is taken right now — try Generate for a new one.';
    } else {
      onlineWaitStatus.textContent = 'Connection error (' + (err && err.type ? err.type : 'unknown') + '). Try again.';
    }
  });
}

function joinRoom(code){
  teardownConnection();
  onlineRoomCode = code;
  isOnlineHost = false;
  onlineColor = 'b';
  onlineStatusText.textContent = 'Connecting…';

  peer = new Peer();

  peer.on('open', () => {
    conn = peer.connect(PEER_ID_PREFIX + code, { reliable: true });
    conn.on('open', () => wireConnection());
    conn.on('error', () => {
      onlineStatusText.textContent = "Couldn't reach that room. Check the code and try again.";
    });
  });

  peer.on('error', (err) => {
    onlineStatusText.textContent = 'Connection error (' + (err && err.type ? err.type : 'unknown') + '). Try again.';
  });
}

function wireConnection(){
  onlineConnected = true;
  onlineRow.hidden = true;
  onlineWaitPanel.hidden = true;

  conn.on('data', handleRemoteData);
  conn.on('close', () => {
    onlineConnected = false;
    if (mode === 'online' && !gameOver){
      stopClock();
      connectionStatusLabel && (connectionStatusLabel.textContent = 'Opponent disconnected');
      endGame('Disconnected', 'Opponent left the game');
    }
  });

  if (isOnlineHost){
    mode = 'online';
    myElo = getMyEloFor(onlineTimeControl);
    startGame();
    sendData({ type: 'start', timeControlSeconds: onlineTimeControl, hostName: myName, hostElo: myElo });
  }
  // the guest waits for the host's 'start' message so both sides begin together
}

function sendData(payload){
  if (conn && conn.open) conn.send(payload);
}

function handleRemoteData(payload){
  if (!payload || typeof payload !== 'object') return;
  switch (payload.type){
    case 'start':
      mode = 'online';
      onlineTimeControl = payload.timeControlSeconds > 0 ? payload.timeControlSeconds : 0;
      opponentName = payload.hostName || 'Opponent';
      opponentElo = typeof payload.hostElo === 'number' ? payload.hostElo : 100;
      myElo = getMyEloFor(onlineTimeControl);
      startGame();
      sendData({ type:'players-ready', guestName: myName, guestElo: myElo });
      break;
    case 'players-ready':
      opponentName = payload.guestName || 'Opponent';
      opponentElo = typeof payload.guestElo === 'number' ? payload.guestElo : 100;
      topPlayerName.textContent = `${opponentName} (${opponentElo})`;
      break;
    case 'move':
      applyRemoteMove(payload.move);
      break;
    case 'resign': {
      if (!gameOver){
        const winner = onlineColor === 'w' ? 'White' : 'Black';
        endGame('Resignation', `${winner} wins`, 1);
      }
      break;
    }
    case 'timeout': {
      if (!gameOver){
        const winner = payload.loser === 'w' ? 'Black' : 'White';
        endGame('Time', `${winner} wins on time`, payload.loser === onlineColor ? 0 : 1);
      }
      break;
    }
    case 'restart':
      startGame();
      break;
    case 'leave':
      if (!gameOver){
        statusLabel.textContent = 'Opponent left the game';
        connectionStatusLabel && (connectionStatusLabel.textContent = 'Opponent left');
      }
      teardownConnection();
      break;
  }
}

function applyRemoteMove(move){
  if (!move || !state) return;
  // Re-derive the matching legal move locally so flags (capture, castle,
  // en passant, promotion) line up exactly with this client's own state.
  const localMoves = legalMovesFor(state, move.fromR, move.fromC);
  const matched = localMoves.find(m =>
    m.toR === move.toR && m.toC === move.toC &&
    (m.promotion || null) === (move.promotion || null)
  );
  if (!matched) return; // out-of-sync safety net, silently ignore
  commitMove(matched, true);
}

/* ============ Premove Queue ============
   Lets a player queue up multiple moves in a row while it's the opponent's
   turn (vs. computer or online) — tap piece, tap destination, tap the next
   piece, and so on. Each queued move fires one at a time, only once it's
   actually the player's turn, and is validated fresh against the real board
   right before it fires. If a queued move turns out illegal (the opponent
   did something that invalidates it), the rest of the chain is dropped too,
   since it was planned assuming that move would go through. Only meaningful
   in 'computer' and 'online' modes, since in 'twoplayer' it's always
   someone's actual turn to click.
   ================================================================= */

let premoveQueue = [];              // [{fromR,fromC,toR,toC,promotion}, ...] in fire order
let premoveSelected = null;         // {r,c} — piece chosen for the next queued move
let premoveTargets = [];            // candidate destinations for premoveSelected
let pendingPremovePromotion = null; // {fromR,fromC,toR,toC} awaiting a promotion choice

function localHumanColor(){
  if (mode === 'computer') return aiColor === 'w' ? 'b' : 'w';
  if (mode === 'online') return onlineColor;
  return null; // twoplayer: no single "local" side, premove is disabled
}

// A lightweight clone carrying just what move generation needs, so we can
// simulate "the board after all currently-queued moves" without touching
// the real game state.
function cloneSimState(st){
  return {
    board: cloneBoard(st.board),
    turn: st.turn,
    castling: { ...st.castling },
    epTarget: st.epTarget ? { ...st.epTarget } : null,
    kingPos: { w:{...st.kingPos.w}, b:{...st.kingPos.b} }
  };
}

function premoveSimState(){
  const sim = cloneSimState(state);
  for (const mv of premoveQueue){
    applyMove(sim, mv);
    sim.turn = sim.turn === 'w' ? 'b' : 'w';
  }
  return sim;
}

function selectPremoveSquare(r,c){
  const sim = premoveSimState();
  const piece = sim.board[r][c];
  if (!piece || piece.color !== localHumanColor()) return;
  premoveSelected = { r, c };
  premoveTargets = legalMovesFor(sim, r, c);
  applyHighlights();
  updatePremoveStatus();
}

function clearPremoveSelection(){
  premoveSelected = null;
  premoveTargets = [];
  applyHighlights();
}

function clearPremoveQueue(){
  premoveQueue = [];
  premoveSelected = null;
  premoveTargets = [];
  pendingPremovePromotion = null;
  if (!pendingPromotion) promoPicker.hidden = true;
  updatePremoveStatus();
  if (boardEl.children.length) applyHighlights();
}

function pushPremove(move){
  premoveQueue.push({ fromR: move.fromR, fromC: move.fromC, toR: move.toR, toC: move.toC, promotion: move.promotion || null });
  premoveSelected = null;
  premoveTargets = [];
  applyHighlights();
  updatePremoveStatus();
}

function updatePremoveStatus(){
  if (premoveQueue.length === 0){
    premoveBanner.hidden = true;
    return;
  }
  premoveBanner.hidden = false;
  premoveBanner.textContent = premoveQueue.length === 1
    ? 'Premove queued — tap either square to cancel'
    : `${premoveQueue.length} premoves queued — tap a queued square to cancel from there`;
}

function handlePremoveClick(r,c){
  const color = localHumanColor();
  if (!color) return;

  // Tapping a square used by an already-queued move cancels it and every
  // move queued after it (those were planned assuming it would happen).
  if (!premoveSelected){
    const queuedIdx = premoveQueue.findIndex(m => (m.fromR===r&&m.fromC===c) || (m.toR===r&&m.toC===c));
    if (queuedIdx !== -1){
      premoveQueue = premoveQueue.slice(0, queuedIdx);
      applyHighlights();
      updatePremoveStatus();
      return;
    }
  }

  const sim = premoveSimState();
  const piece = sim.board[r][c];

  if (premoveSelected){
    if (premoveSelected.r===r && premoveSelected.c===c){
      clearPremoveSelection();
      return;
    }
    const target = premoveTargets.find(m=>m.toR===r && m.toC===c);
    if (target){
      if (target.promotion){
        pendingPremovePromotion = { fromR: premoveSelected.r, fromC: premoveSelected.c, toR: r, toC: c };
        premoveSelected = null;
        premoveTargets = [];
        openPremoPromotionPicker(color);
        return;
      }
      pushPremove(target);
      return;
    }
    if (piece && piece.color===color){
      selectPremoveSquare(r,c);
    } else {
      clearPremoveSelection();
    }
    return;
  }

  if (piece && piece.color===color){
    selectPremoveSquare(r,c);
  }
}

function maybeExecutePremove(){
  if (gameOver || premoveQueue.length === 0) return;
  const color = localHumanColor();
  if (!color || state.turn !== color) return;

  const queued = premoveQueue.shift();
  updatePremoveStatus();
  applyHighlights();

  const candidates = legalMovesFor(state, queued.fromR, queued.fromC);
  const match = candidates.find(m =>
    m.toR === queued.toR && m.toC === queued.toC &&
    (m.promotion || null) === (queued.promotion || null)
  );

  if (!match){
    // The rest of the chain was planned assuming this move would land —
    // it no longer applies, so drop it rather than fire moves out of context.
    premoveQueue = [];
    updatePremoveStatus();
    applyHighlights();
    return;
  }

  setTimeout(() => {
    if (!gameOver && state.turn === color) commitMove(match);
  }, 120);
}

/* ============ Online Chess Clock ============
   Each device keeps its own countdown for both players, driven by the same
   move stream, so the two clocks stay in close sync without needing a
   server. Whichever side notices a flag fall first announces it to the
   other over the data channel.
   ================================================================= */

let clockWhite = 0;
let clockBlack = 0;
let clockInterval = null;

function formatClock(totalSeconds){
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2,'0')}`;
}

function renderClocks(){
  if (mode !== 'online' || !onlineTimeControl){
    topPlayerClock.hidden = true;
    bottomPlayerClock.hidden = true;
    return;
  }
  const topColor = onlineColor === 'w' ? 'b' : 'w';
  const bottomColor = onlineColor;
  const topSeconds = topColor === 'w' ? clockWhite : clockBlack;
  const bottomSeconds = bottomColor === 'w' ? clockWhite : clockBlack;

  topPlayerClock.hidden = false;
  bottomPlayerClock.hidden = false;
  topPlayerClock.textContent = formatClock(topSeconds);
  bottomPlayerClock.textContent = formatClock(bottomSeconds);
  topPlayerClock.classList.toggle('is-low', topSeconds <= 20);
  bottomPlayerClock.classList.toggle('is-low', bottomSeconds <= 20);
}

function startClock(){
  stopClock();
  if (mode !== 'online' || !onlineTimeControl){
    topPlayerClock.hidden = true;
    bottomPlayerClock.hidden = true;
    return;
  }
  clockWhite = onlineTimeControl;
  clockBlack = onlineTimeControl;
  renderClocks();
  resumeClockForTurn();
}

function stopClock(){
  if (clockInterval){ clearInterval(clockInterval); clockInterval = null; }
}

function resumeClockForTurn(){
  stopClock();
  if (mode !== 'online' || !onlineTimeControl || gameOver) return;
  clockInterval = setInterval(() => {
    if (gameOver){ stopClock(); return; }
    if (state.turn === 'w') clockWhite = Math.max(0, clockWhite - 1);
    else clockBlack = Math.max(0, clockBlack - 1);
    renderClocks();
    const flagFallen = (state.turn === 'w' && clockWhite <= 0) || (state.turn === 'b' && clockBlack <= 0);
    if (flagFallen){
      stopClock();
      const loser = state.turn;
      const winner = loser === 'w' ? 'Black' : 'White';
      sendData({ type: 'timeout', loser });
      endGame('Time', `${winner} wins on time`, loser === onlineColor ? 0 : 1);
    }
  }, 1000);
}

/* ============ Ratings & Leaderboard (Firestore) ============
   Applies only to Online games with a real matched opponent — vs. Computer
   and same-device Two Players never touch a player's rating. Each player
   gets one Elo rating per time control (see firebase-init.js for the data
   shape), starting at 100. Because there's no server refereeing the match,
   both connected devices independently compute the same result (they see
   identical checkmate/stalemate conditions, or an explicit resign/timeout
   message) and each device writes only its own player's document — so
   there's nothing to reconcile between them.
   ================================================================= */

// K-factor per time control (seconds per player): faster games swing
// ratings a bit more per game since each one carries less signal.
const K_FACTOR_BY_TIME = { 0: 16, 60: 24, 180: 20, 300: 18 };
const ELO_BUCKETS = ['0','60','180','300'];

let myName = null;
let myEloMap = null;    // { "0":100, "60":100, "180":100, "300":100 }
let myElo = 100;        // this game's bucket, resolved once the time control is known
let opponentName = null;
let opponentElo = null;
let selectedLeaderboardSeconds = 0;

function sanitizePlayerName(raw){
  return (raw || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}

function normalizeNameForId(name){
  return name.trim().toLowerCase().replace(/[\/#\[\]]/g, '_').slice(0, 60) || 'player';
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function defaultEloMap(){
  const m = {};
  ELO_BUCKETS.forEach(k => m[k] = 100);
  return m;
}

// Loads (or creates) this player's Firestore profile and stashes their
// per-time-control Elo map in myName/myEloMap. Returns true on success.
async function loadPlayerProfile(name){
  if (!db){
    // No Firestore available (e.g. blocked or offline) — still let the
    // player play online, just without rating tracking for this session.
    myName = name;
    myEloMap = defaultEloMap();
    try{ localStorage.setItem('endgame-player-name', name); }catch(e){}
    return true;
  }
  try{
    const ref = db.collection('players').doc(normalizeNameForId(name));
    const snap = await ref.get();
    if (snap.exists){
      const data = snap.data();
      myName = data.name || name;
      myEloMap = Object.assign(defaultEloMap(), data.elo || {});
    } else {
      myName = name;
      myEloMap = defaultEloMap();
      await ref.set({
        name,
        elo: myEloMap,
        wins: { "0":0, "60":0, "180":0, "300":0 },
        losses: { "0":0, "60":0, "180":0, "300":0 },
        draws: { "0":0, "60":0, "180":0, "300":0 },
        gamesPlayed: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    try{ localStorage.setItem('endgame-player-name', name); }catch(e){}
    return true;
  } catch(err){
    console.error('Failed to load player profile', err);
    return false;
  }
}

function getMyEloFor(seconds){
  if (!myEloMap) return 100;
  return myEloMap[String(seconds)] ?? 100;
}

function eloDelta(myRating, theirRating, resultForMe, timeControlSeconds){
  const k = K_FACTOR_BY_TIME[timeControlSeconds] ?? 20;
  const expected = 1 / (1 + Math.pow(10, (theirRating - myRating) / 400));
  return Math.round(k * (resultForMe - expected));
}

// Computes my new rating for this game and writes it to Firestore. Purely
// local to this device — the opponent's own client does the mirror update
// for their own document independently.
async function recordOnlineResult(resultForMe){
  if (!myName || opponentElo === null || typeof opponentElo === 'undefined'){
    gameOverEloText.hidden = true;
    return;
  }
  const bucket = String(onlineTimeControl);
  const before = getMyEloFor(onlineTimeControl);
  const delta = eloDelta(before, opponentElo, resultForMe, onlineTimeControl);
  const after = before + delta;

  if (myEloMap) myEloMap[bucket] = after;

  gameOverEloText.hidden = false;
  gameOverEloText.classList.remove('is-up','is-down');
  const sign = delta > 0 ? '+' : '';
  gameOverEloText.textContent = `Rating: ${before} → ${after} (${sign}${delta})`;
  if (delta > 0) gameOverEloText.classList.add('is-up');
  if (delta < 0) gameOverEloText.classList.add('is-down');

  if (!db) return;
  try{
    const ref = db.collection('players').doc(normalizeNameForId(myName));
    const resultField = resultForMe === 1 ? 'wins' : resultForMe === 0 ? 'losses' : 'draws';
    await ref.set({
      name: myName,
      elo: { [bucket]: after },
      [resultField]: { [bucket]: firebase.firestore.FieldValue.increment(1) },
      gamesPlayed: firebase.firestore.FieldValue.increment(1),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch(err){
    console.error('Failed to save rating update', err);
  }
}

async function loadLeaderboard(seconds){
  leaderboardList.innerHTML = '';
  if (!db){
    leaderboardStatus.textContent = 'Leaderboard is unavailable right now.';
    return;
  }
  leaderboardStatus.textContent = 'Loading…';
  try{
    const snap = await db.collection('players').orderBy(`elo.${seconds}`, 'desc').limit(20).get();
    if (snap.empty){
      leaderboardStatus.textContent = 'No games recorded for this time control yet.';
      return;
    }
    leaderboardStatus.textContent = '';
    let rank = 1;
    snap.forEach(doc => {
      const d = doc.data();
      const key = String(seconds);
      const elo = d.elo?.[key] ?? 100;
      const w = d.wins?.[key] ?? 0;
      const l = d.losses?.[key] ?? 0;
      const dr = d.draws?.[key] ?? 0;
      const li = document.createElement('li');
      li.innerHTML = `<span class="lb-rank">${rank++}</span><span class="lb-name">${escapeHtml(d.name || doc.id)}</span><span class="lb-elo">${elo}</span><span class="lb-record">${w}-${l}-${dr}</span>`;
      leaderboardList.appendChild(li);
    });
  } catch(err){
    console.error('Failed to load leaderboard', err);
    leaderboardStatus.textContent = "Couldn't load the leaderboard right now.";
  }
}

// Prefill and surface the room-code field when arriving via an invite link.
(function initOnlineFromUrl(){
  try{
    const params = new URLSearchParams(window.location.search);
    const codeParam = sanitizeRoomCode(params.get('code'));
    if (codeParam){
      roomCodeInput.value = codeParam;
      onlineRow.hidden = false;
      onlineStatusText.textContent = 'Room code filled in — tap Join room to connect.';
    }
  } catch(e){ /* ignore malformed URLs */ }
})();