-- Atomic move validation and state update script
-- KEYS[1] = game:{id} (hash)
-- KEYS[2] = game:{id}:moves (list)
-- ARGV[1] = playerId
-- ARGV[2] = moveId
-- ARGV[3] = cell (0-8)
-- ARGV[4] = timestamp

local gameKey = KEYS[1]
local movesKey = KEYS[2]
local playerId = ARGV[1]
local moveId = ARGV[2]
local cell = tonumber(ARGV[3])
local timestamp = tonumber(ARGV[4])

-- Check if game exists
if redis.call('EXISTS', gameKey) == 0 then
    return {'err', 'GAME_NOT_FOUND'}
end

-- Get current game state
local gameData = redis.call('HGETALL', gameKey)
local state = {}
for i = 1, #gameData, 2 do
    state[gameData[i]] = gameData[i + 1]
end

-- Check if game is already finished
if state.status ~= 'playing' then
    return {'err', 'GAME_FINISHED'}
end

-- Validate cell range
if cell < 0 or cell > 8 then
    return {'err', 'INVALID_CELL'}
end

-- Check if it's the player's turn
if state.turn ~= playerId then
    return {'err', 'NOT_YOUR_TURN'}
end

-- Parse board (stored as JSON array string)
local boardStr = state.board

-- Log current board state for debugging
redis.log(redis.LOG_DEBUG, string.format('[MOVE_VALIDATOR] Processing move: player=%s, cell=%d, board=%s', 
    playerId, cell, boardStr))

-- Use cjson to properly parse the JSON array
-- This correctly handles empty strings between commas
local board = cjson.decode(boardStr)

-- Ensure we have exactly 9 cells
if #board > 9 then
    redis.log(redis.LOG_WARNING, string.format('[MOVE_VALIDATOR] Board has %d cells, expected 9! Truncating...', #board))
    while #board > 9 do
        table.remove(board)
    end
end

while #board < 9 do
    redis.log(redis.LOG_WARNING, string.format('[MOVE_VALIDATOR] Board has %d cells, expected 9! Padding...', #board))
    table.insert(board, '')
end

-- Convert cjson.null to empty strings and validate cell contents
for i = 1, #board do
    if board[i] == cjson.null or board[i] == nil then
        board[i] = ''
    end
    -- Ensure each cell is either empty or X or O
    if board[i] ~= '' and board[i] ~= 'X' and board[i] ~= 'O' then
        redis.log(redis.LOG_WARNING, string.format('[MOVE_VALIDATOR] Invalid cell value at position %d: %s', i-1, tostring(board[i])))
    end
end

-- Check if cell is empty (Lua arrays are 1-indexed, so cell+1)
if board[cell + 1] ~= '' and board[cell + 1] ~= '""' then
    return {'err', 'CELL_OCCUPIED'}
end

-- Get player symbol from playerSymbols JSON
local playerSymbolsStr = state.playerSymbols
local playerSymbol = 'X' -- default

-- Parse playerSymbols JSON to find this player's symbol
-- playerSymbols format: {"playerId1":"X","playerId2":"O"}
-- Escape special characters in playerId for pattern matching
local escapedPlayerId = string.gsub(playerId, "([%-])", "%%%1")
local pattern = '"' .. escapedPlayerId .. '":"([XO])"'
local match = string.match(playerSymbolsStr, pattern)

if match then
    playerSymbol = match
else
    -- Fallback: if not found, default to X
    playerSymbol = 'X'
end

-- Apply move
board[cell + 1] = playerSymbol

-- Check for winner
local function checkWinner()
    -- Win lines: rows, columns, diagonals (1-indexed)
    local lines = {
        {1, 2, 3}, {4, 5, 6}, {7, 8, 9}, -- rows
        {1, 4, 7}, {2, 5, 8}, {3, 6, 9}, -- columns
        {1, 5, 9}, {3, 5, 7}             -- diagonals
    }
    
    for _, line in ipairs(lines) do
        local cell1 = board[line[1]]
        local cell2 = board[line[2]]
        local cell3 = board[line[3]]
        
        -- Check all cells are non-empty and match
        if cell1 ~= '' and cell1 ~= '""' and cell1 ~= cjson.null and
           cell2 ~= '' and cell2 ~= '""' and cell2 ~= cjson.null and
           cell3 ~= '' and cell3 ~= '""' and cell3 ~= cjson.null and
           cell1 == cell2 and cell2 == cell3 then
            return {
                symbol = cell1,  -- The winning symbol (X or O)
                line = {line[1] - 1, line[2] - 1, line[3] - 1} -- Convert to 0-indexed for frontend
            }
        end
    end
    return nil
end

-- Check for draw (all cells filled, no winner)
local function checkDraw()
    for i = 1, 9 do
        local cell = board[i]
        if cell == '' or cell == '""' or cell == cjson.null or cell == nil then
            return false
        end
    end
    return true
end

-- Check for winner AFTER applying the move
local winResult = checkWinner()
local isDraw = false

-- Only check for draw if there's no winner
if not winResult then
    isDraw = checkDraw()
end

-- Update game state
local newStatus = 'playing'
local result = 'null'
local winnerPlayer = 'null'
local winningLine = 'null'

if winResult then
    -- Game is won!
    newStatus = 'finished'
    result = 'win'
    
    -- The current player just made the winning move, so they are the winner
    winnerPlayer = playerId
    
    -- Format winning line as JSON array with numbers (not strings!)
    winningLine = '[' .. winResult.line[1] .. ',' .. winResult.line[2] .. ',' .. winResult.line[3] .. ']'
    
    -- Log for debugging
    redis.log(redis.LOG_NOTICE, string.format('[MOVE_VALIDATOR] WINNER DETECTED! Player %s won with symbol %s at positions %s', 
        playerId, winResult.symbol, winningLine))
    
elseif isDraw then
    -- Game is a draw!
    newStatus = 'finished'
    result = 'draw'
    
    redis.log(redis.LOG_NOTICE, string.format('[MOVE_VALIDATOR] DRAW! Game %s ended in a draw', state.gameId or ''))
end

-- Determine next turn
local nextTurn = playerId
if newStatus == 'playing' then
    -- Switch to other player
    local playersStr = state.players
    for pid in string.gmatch(playersStr, '"([^"]+)":') do
        if pid ~= playerId then
            nextTurn = pid
            break
        end
    end
end

-- Build new board string
local newBoardStr = '['
for i, val in ipairs(board) do
    if i > 1 then newBoardStr = newBoardStr .. ',' end
    newBoardStr = newBoardStr .. '"' .. val .. '"'
end
newBoardStr = newBoardStr .. ']'

-- Update game state in Redis
redis.call('HSET', gameKey, 
    'board', newBoardStr,
    'status', newStatus,
    'turn', nextTurn,
    'result', result,
    'winner', winnerPlayer,
    'winningLine', winningLine,
    'lastMoveTime', timestamp
)

-- Add move to moves list
local moveData = string.format('{"moveId":"%s","playerId":"%s","cell":%d,"timestamp":%d}', 
    moveId, playerId, cell, timestamp)
redis.call('RPUSH', movesKey, moveData)

-- Log final state for debugging
redis.log(redis.LOG_NOTICE, string.format('[MOVE_VALIDATOR] Move complete: cell=%d, symbol=%s, board=%s, status=%s, result=%s, winner=%s',
    cell, playerSymbol, newBoardStr, newStatus, result, winnerPlayer))

-- Publish event to game channel
local eventChannel = string.format('game:%s:events', state.gameId or string.match(gameKey, 'game:(.+)'))
local eventPayload = string.format(
    '{"type":"move_applied","gameId":"%s","playerId":"%s","cell":%d,"board":%s,"status":"%s","turn":"%s","result":"%s","winner":"%s","winningLine":%s}',
    state.gameId or string.match(gameKey, 'game:(.+)'),
    playerId,
    cell,
    newBoardStr,
    newStatus,
    nextTurn,
    result,
    winnerPlayer,
    winningLine
)
redis.call('PUBLISH', eventChannel, eventPayload)

-- Return success with updated state as Redis map
-- Using array format with string keys for compatibility with Go Redis client
return {
    'ok', 'true',
    'state', cjson.encode({
        board = newBoardStr,
        status = newStatus,
        turn = nextTurn,
        result = result,
        winner = winnerPlayer,
        winningLine = winningLine
    })
}
