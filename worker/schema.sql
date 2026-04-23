CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT UNIQUE NOT NULL,
  title TEXT,
  rating REAL,
  total_reviews INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL,
  reviewer_name TEXT,
  rating REAL,
  title TEXT,
  body TEXT,
  ai_body TEXT,
  ai_status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asin) REFERENCES products(asin) ON DELETE CASCADE
);

CREATE INDEX idx_reviews_asin ON reviews(asin);
CREATE INDEX idx_reviews_status ON reviews(ai_status);
CREATE INDEX idx_products_asin ON products(asin);