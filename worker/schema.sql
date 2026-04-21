CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  title TEXT,
  review TEXT,
  pros TEXT,
  cons TEXT,
  testimonials TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);