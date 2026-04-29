Backend refactor scaffold for the CX assessment API.

Step 1 in the refactor:
- create a clean backend package layout
- centralize database configuration
- define production-oriented SQLAlchemy models
- add a SQL migration script for the current database

The legacy code under `app/` is kept in place for now to avoid a big-bang rewrite.
