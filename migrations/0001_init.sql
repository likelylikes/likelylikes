-- The game's state. Everything is per player × set (docs/scoring.md §1); times are integers, ms
-- since the epoch, server clock. The scorer needs only the counts; the round log keeps the screen
-- order, selector and estimator so picks can be audited and re-scored (docs/scoring.md §9).

CREATE TABLE players (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), set_id TEXT NOT NULL,
  started_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
  gain REAL NOT NULL DEFAULT 0, picks INTEGER NOT NULL DEFAULT 0);
CREATE INDEX sessions_player_set ON sessions (player_id, set_id, ends_at);

CREATE TABLE rounds (                       -- what was served
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  player_id TEXT NOT NULL, set_id TEXT NOT NULL, seq INTEGER NOT NULL,
  images TEXT NOT NULL,                     -- JSON array of the 4 image ids in screen order
  selector TEXT NOT NULL, served_at INTEGER NOT NULL,
  UNIQUE (session_id, seq));

CREATE TABLE picks (                        -- what was chosen; at most one per round
  round_id TEXT PRIMARY KEY REFERENCES rounds(id),
  player_id TEXT NOT NULL, set_id TEXT NOT NULL,
  position INTEGER NOT NULL,                -- screen position clicked: logged, never scored
  image TEXT NOT NULL, score REAL NOT NULL, estimator TEXT NOT NULL,
  response_ms INTEGER, picked_at INTEGER NOT NULL);
CREATE INDEX picks_player_set ON picks (player_id, set_id, picked_at);

CREATE TABLE counts (                       -- the N×N win counts per player × set
  player_id TEXT NOT NULL, set_id TEXT NOT NULL, winner TEXT NOT NULL, loser TEXT NOT NULL,
  n INTEGER NOT NULL, PRIMARY KEY (player_id, set_id, winner, loser));

CREATE TABLE standings (
  player_id TEXT NOT NULL, set_id TEXT NOT NULL, llr REAL NOT NULL, picks INTEGER NOT NULL,
  PRIMARY KEY (player_id, set_id));
