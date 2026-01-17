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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
