DROP TABLE IF EXISTS feedback;
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT,
  source TEXT,
  sentiment TEXT, -- 'Positive', 'Neutral', 'Negative'
  urgency_score INTEGER, -- 1-10
  urgency_reason TEXT,
  status TEXT DEFAULT 'New', -- 'New', 'Archived', 'Acted On'
  themes TEXT, -- JSON array of strings
  image_key TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- New columns for actionable insights
  severity TEXT DEFAULT 'minor', -- 'blocking', 'major', 'minor', 'enhancement'
  impact_score INTEGER DEFAULT 5, -- 1-10 estimated reach/impact
  roadmap_status TEXT DEFAULT 'none', -- 'none', 'planned', 'in_progress', 'shipped'
  roadmap_link TEXT, -- Optional URL to roadmap item (Jira, Linear, etc.)
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Track when theme first appeared
);
