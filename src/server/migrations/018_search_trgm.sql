-- Search relevance: trigram + full-text indexes for typo-tolerant search.
-- Applied by `npm run db:migrate`. All search queries stay parameterized;
-- these indexes only accelerate the ILIKE / similarity lookups in catalog.ts.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Products: name / descriptions (trigram) + full-text vector.
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON products USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_tsv
  ON products USING GIN (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(short_description, '') || ' ' || coalesce(description, '')
  )
);

-- Vendors: business name / description (trigram).
CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm
  ON vendors USING GIN (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vendors_description_trgm
  ON vendors USING GIN (description gin_trgm_ops);

-- Categories: name / slug (trigram).
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm
  ON categories USING GIN (name gin_trgm_ops);

-- Catering packages: title / description (trigram).
CREATE INDEX IF NOT EXISTS idx_catering_packages_title_trgm
  ON catering_packages USING GIN (title gin_trgm_ops);
