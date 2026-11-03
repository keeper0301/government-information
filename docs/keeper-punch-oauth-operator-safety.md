# Keeper OAuth operator safety addendum

Maintained stdlib helper: `tools/keeper_oauth.py`; offline test: `python3 -m unittest discover -s tools -p test_keeper_oauth.py -v`.

- Persist user-token values only from the strict safe alphabet `[A-Za-z0-9_.-]`; reject pipes, tilde, controls/newlines, and shell syntax BEFORE any provider call or file backup. The existing env is sourced by shell consumers, so identity proof alone is not an env-serialization safety guarantee.
- Transport parses exact host/path/query/method and rejects near-match URLs before opening a connection; no redirects.
- CLI has a90-second absolute SIGALRM deadline, including lock/read/network waits; keep the default CLI path for operation. Imported low-level APIs require the caller's own deadline. It is a Unix/WSL-only operator, not a Windows Python helper.
- The live configured env/config parent ownership, permissions, group membership and symlink chain must pass the private path trust audit before activation. Cooperating lock + digest CAS do not promise defense against a malicious same-UID process.
- Live canary/PostgreSQL CAS and actual Meta bearer/debug/grants responses remain activation gates, not claimed by offline tests. Local build serves only unconfigured503/legacy400 negative checks; it is not a provider success.
- Deployment of the two endpoints and callback dispatch, four dedicated env settings and isolated store canary require current owner approval; none are activated by committing this addendum. Do not re-enable the publication worker as a side effect of credential repair.
