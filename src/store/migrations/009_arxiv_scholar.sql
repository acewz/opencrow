DO $$ BEGIN
    ALTER TABLE memory_sources DROP CONSTRAINT IF EXISTS memory_sources_kind_check;
    ALTER TABLE memory_sources ADD CONSTRAINT memory_sources_kind_check
      CHECK(kind IN ('conversation','note','document','tweet','article','product','story','reddit_post','hf_model','github_repo'));
  END $$;

CREATE TABLE IF NOT EXISTS arxiv_papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    authors_json TEXT NOT NULL DEFAULT '[]',
    abstract TEXT NOT NULL DEFAULT '',
    categories_json TEXT NOT NULL DEFAULT '[]',
    primary_category TEXT NOT NULL DEFAULT '',
    published_at TEXT NOT NULL DEFAULT '',
    pdf_url TEXT NOT NULL DEFAULT '',
    abs_url TEXT NOT NULL DEFAULT '',
    feed_category TEXT NOT NULL DEFAULT '',
    first_seen_at INT NOT NULL,
    updated_at INT NOT NULL,
    indexed_at INT
  );

CREATE INDEX IF NOT EXISTS idx_arxiv_papers_updated ON arxiv_papers(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_arxiv_papers_category ON arxiv_papers(primary_category, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_arxiv_papers_published ON arxiv_papers(published_at DESC);

CREATE TABLE IF NOT EXISTS scholar_papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    authors_json TEXT NOT NULL DEFAULT '[]',
    abstract TEXT NOT NULL DEFAULT '',
    year INT NOT NULL DEFAULT 0,
    venue TEXT NOT NULL DEFAULT '',
    citation_count INT NOT NULL DEFAULT 0,
    reference_count INT NOT NULL DEFAULT 0,
    publication_date TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    external_ids_json TEXT NOT NULL DEFAULT '{}',
    tldr TEXT NOT NULL DEFAULT '',
    feed_source TEXT NOT NULL DEFAULT '',
    first_seen_at INT NOT NULL,
    updated_at INT NOT NULL,
    indexed_at INT
  );

CREATE INDEX IF NOT EXISTS idx_scholar_papers_updated ON scholar_papers(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_scholar_papers_citations ON scholar_papers(citation_count DESC);

CREATE INDEX IF NOT EXISTS idx_scholar_papers_year ON scholar_papers(year DESC, citation_count DESC);

DO $$ BEGIN
    ALTER TABLE memory_sources DROP CONSTRAINT IF EXISTS memory_sources_kind_check;
    ALTER TABLE memory_sources ADD CONSTRAINT memory_sources_kind_check
      CHECK(kind IN ('conversation','note','document','tweet','article','product','story','reddit_post','hf_model','github_repo','arxiv_paper','scholar_paper','observation'));
  END $$;
