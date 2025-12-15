// Initialize the game logic
var game = new Chess();
var board = null;
var $status = $('#status');
var $fen = $('#fen');
var $moveHistory = $('#move-history');
var $thinking = $('#thinking');
var capturedPieces = { w: [], b: [] };
var moveCount = 0;

// Set a random soothing background color on load
function setRandomTheme() {
    var hue = Math.floor(Math.random() * 360);
    // Low saturation and lightness for a soothing dark theme that fits the white text
    var color = 'hsl(' + hue + ', 30%, 30%)';
    document.body.style.backgroundColor = color;
}
setRandomTheme();

// Piece Unicode symbols for captured pieces display
var pieceSymbols = {
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚',
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔'
};

// Check if running locally via file:// protocol
if (window.location.protocol === 'file:') {
    alert('Warning: Stockfish AI may not work when opening the file directly due to browser security restrictions. Please run this on a local server (e.g., using VS Code Live Server or python -m http.server).');
}

// Initialize Stockfish
// We use a web worker to run Stockfish in a separate thread so it doesn't freeze the UI
var stockfish = new Worker('stockfish.js');
var stockfishReady = false;

stockfish.postMessage('uci');
stockfish.postMessage('isready');

stockfish.onmessage = function(event) {
    // console.log(event.data); // Debugging Stockfish output

    if (event.data === 'readyok') {
        stockfishReady = true;
    }

    // Detect the best move found by Stockfish
    if (event.data.startsWith('bestmove')) {
        $thinking.hide();
        var bestMove = event.data.split(' ')[1];
        
        if (bestMove === '(none)' || !bestMove) {
            updateStatus();
            return;
        }
        
        // Make the move on the board
        var moveObj = game.move({
            from: bestMove.substring(0, 2),
            to: bestMove.substring(2, 4),
            promotion: bestMove.length > 4 ? bestMove.substring(4, 5) : 'q'
        });

        if (moveObj) {
            addMoveToHistory(moveObj);
            updateCapturedPieces(moveObj);
        }

        // Update the board position
        board.position(game.fen());
        updateStatus();
    }
};

function onDragStart (source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if (game.game_over()) return false;

    // only pick up pieces for the side to move
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
}

function onDrop (source, target) {
    removeGreySquares();
    
    // see if the move is legal
    var move = game.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    });

    // illegal move
    if (move === null) return 'snapback';

    addMoveToHistory(move);
    updateCapturedPieces(move);
    updateStatus();

    // If the game isn't over, let the AI make a move
    if (!game.game_over()) {
        window.setTimeout(makeAIMove, 250);
    }
}

// update the board position after the piece snap
// for castling, en passant, pawn promotion
function onSnapEnd () {
    board.position(game.fen());
}

function removeGreySquares () {
    $('#myBoard .square-55d63').css('background', '')
}

function greySquare (square) {
    var $square = $('#myBoard .square-' + square)

    var background = '#a9a9a9'
    if ($square.hasClass('black-3c85d')) {
        background = '#696969'
    }

    $square.css('background', background)
}

function onMouseoverSquare (square, piece) {
    // get list of possible moves for this square
    var moves = game.moves({
        square: square,
        verbose: true
    })

    // exit if there are no moves available for this square
    if (moves.length === 0) return

    // highlight the square they moused over
    greySquare(square)

    // highlight the possible squares for this piece
    for (var i = 0; i < moves.length; i++) {
        greySquare(moves[i].to)
    }
}

function onMouseoutSquare (square, piece) {
    removeGreySquares()
}

function makeAIMove() {
    if (!stockfishReady) {
        window.setTimeout(makeAIMove, 100);
        return;
    }
    
    $thinking.show();
    var depth = 10; // Fixed depth since difficulty selector was removed
    
    // Send position to Stockfish
    stockfish.postMessage('position fen ' + game.fen());
    stockfish.postMessage('go depth ' + depth);
}

function addMoveToHistory(move) {
    moveCount++;
    var moveNumber = Math.ceil(moveCount / 2);
    var moveText = move.san;
    
    if (moveCount % 2 === 1) {
        $moveHistory.append('<div class="move-entry">' + moveNumber + '. ' + moveText + '</div>');
    } else {
        var lastEntry = $moveHistory.find('.move-entry:last');
        lastEntry.html(lastEntry.html() + ' ' + moveText);
    }
    
    // Auto-scroll to bottom
    $moveHistory.scrollTop($moveHistory[0].scrollHeight);
}

function updateCapturedPieces(move) {
    if (move.captured) {
        var capturedPiece = move.captured;
        var capturingColor = move.color;
        
        // Add to the capturing player's collection
        capturedPieces[capturingColor].push(capturedPiece);
        
        // Display captured pieces
        displayCapturedPieces();
    }
}

function displayCapturedPieces() {
    var whiteCaptures = capturedPieces.w.map(function(p) {
        return pieceSymbols[p];
    }).join(' ');
    
    var blackCaptures = capturedPieces.b.map(function(p) {
        return pieceSymbols[p.toUpperCase()];
    }).join(' ');
    
    $('#captured-white').html('⚪ ' + whiteCaptures);
    $('#captured-black').html('⚫ ' + blackCaptures);
}

function updateStatus () {
    var status = '';

    var moveColor = 'White';
    if (game.turn() === 'b') {
        moveColor = 'Black';
    }

    // checkmate?
    if (game.in_checkmate()) {
        status = 'Game over, ' + moveColor + ' is in checkmate.';
    }

    // draw?
    else if (game.in_draw()) {
        status = 'Game over, drawn position';
    }

    // game still on
    else {
        status = moveColor + ' to move';

        // check?
        if (game.in_check()) {
            status += ', ' + moveColor + ' is in check';
        }
    }

    $status.html(status);
    $fen.html(game.fen());
}

var config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    onMouseoutSquare: onMouseoutSquare,
    onMouseoverSquare: onMouseoverSquare
};

board = Chessboard('myBoard', config);

// Ensure board is resized correctly on load
setTimeout(function() {
    board.resize();
}, 100);

updateStatus();

// Make board responsive
$(window).resize(function() {
    board.resize();
});

// Event Listeners
$('#resetBtn').on('click', function() {
    game.reset();
    board.start();
    capturedPieces = { w: [], b: [] };
    moveCount = 0;
    $moveHistory.empty();
    displayCapturedPieces();
    $thinking.hide();
    updateStatus();
});

$('#flipBtn').on('click', function() {
    board.flip();
});

$('#undoBtn').on('click', function() {
    // Undo last 2 moves (player + AI)
    if (moveCount >= 2) {
        game.undo();
        game.undo();
        board.position(game.fen());
        
        // Remove last 2 moves from history
        $moveHistory.find('.move-entry:last').remove();
        moveCount -= 2;
        
        // Recalculate captured pieces
        recalculateCapturedPieces();
        updateStatus();
    }
});

function recalculateCapturedPieces() {
    capturedPieces = { w: [], b: [] };
    var moves = game.history({ verbose: true });
    moves.forEach(function(move) {
        if (move.captured) {
            capturedPieces[move.color].push(move.captured);
        }
    });
    displayCapturedPieces();
}
