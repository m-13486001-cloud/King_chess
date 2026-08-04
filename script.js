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
  difficultyRow.scrollIntoView({ behavior:'smooth', block:'nearest' });
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

document.getElementById('menuBtn').addEventListener('click', backToMenu);
document.getElementById('menuFromOverBtn').addEventListener('click', backToMenu);
document.getElementById('rematchBtn').addEventListener('click', () => { startGame(); });
document.getElementById('undoBtn').addEventListener('click', undoLastTurn);
document.getElementById('resignBtn').addEventListener('click', () => {
  if (gameOver) return;
  const winner = state.turn === 'w' ? 'Black' : 'White';
  endGame('Resignation', `${winner} wins`);
});

function backToMenu(){
  gameScreen.hidden = true;
  modeScreen.hidden = false;
  pickComputerBtn.classList.remove('is-active');
  difficultyRow.hidden = true;
}

function startGame(){
  state = freshState();
  selected = null;
  legalTargets = [];
  pendingPromotion = null;
  aiThinking = false;
  gameOver = false;
  gameOverOverlay.hidden = true;
  promoPicker.hidden = true;
  moveLogEl.innerHTML = '';
  statusLabel.textContent = 'In progress';

  modeLabel.textContent = mode === 'computer'
    ? `Vs. Computer — ${ {1:'Casual',2:'Club',3:'Sharp'}[aiDepth] }`
    : 'Two Players';

  topPlayerName.textContent = mode === 'computer' ? 'Computer' : 'Black';
  bottomPlayerName.textContent = 'White';
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
    sq.classList.remove('is-selected','is-legal','is-check','is-last-move');
    if (selected && selected.r===r && selected.c===c) sq.classList.add('is-selected');
    if (legalTargets.some(m=>m.toR===r && m.toC===c)) sq.classList.add('is-legal');
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
  if (gameOver || pendingPromotion || aiThinking) return;
  const sq = e.currentTarget;
  const r = +sq.dataset.r, c = +sq.dataset.c;

  if (mode==='computer' && state.turn !== (aiColor==='w'?'b':'w')){
    // it's ai's turn conceptually handled elsewhere, but guard anyway
  }
  if (mode==='computer' && state.turn === aiColor) return; // not player's turn

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

function commitMove(move){
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
    endGame('Checkmate', `${mover==='w'?'White':'Black'} wins`);
    return;
  }
  if (oppStatus==='stalemate'){
    endGame('Stalemate', 'Draw');
    return;
  }
  statusLabel.textContent = isCheck ? 'Check!' : 'In progress';

  if (mode==='computer' && state.turn === aiColor && !gameOver){
    aiThinking = true;
    statusLabel.textContent = 'Computer is thinking…';
    setTimeout(runAiMove, 260);
  }
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

function endGame(eyebrow, title){
  gameOver = true;
  statusLabel.textContent = title;
  gameOverEyebrow.textContent = eyebrow;
  gameOverTitle.textContent = title;
  gameOverOverlay.hidden = false;
}

function undoLastTurn(){
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
  renderBoard();
  renderMoveLog();
  renderCaptures();
  updateTurnBanner();
  statusLabel.textContent = 'In progress';
}