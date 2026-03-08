-- Clean up memory_sources rows with kinds from removed data sources.
-- Must run before any kind_check constraint migrations.
DELETE FROM memory_sources WHERE kind IN (
  'hf_model', 'arxiv_paper', 'scholar_paper',
  'defi_protocol', 'dex_token', 'trend'
);
