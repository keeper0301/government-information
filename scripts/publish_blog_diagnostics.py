"""Bounded, body-free evidence for each publishing call, including lost responses."""
import json
import re
import sys
from pathlib import Path


def label(value):
    return re.sub(r"[^a-zA-Z0-9_-]", "", str(value or "unknown"))[:80] or "unknown"


def describe(path, offset, attempt, http_status):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        rows = data.get("results") or []
        row = rows[0] if rows and isinstance(rows[0], dict) else {}
        wp = row.get("wordpress") or {}
        if not isinstance(wp, dict):
            wp = {}
    except (OSError, ValueError, AttributeError, TypeError):
        row, wp = {}, {}
    wp_http = wp.get("httpStatus")
    if type(wp_http) is not int or not 100 <= wp_http <= 599:
        wp_http = "unknown"
    # A hint is never authority for a retry. The retry endpoint checks the durable log.
    retry = wp.get("retryEligible") is True and wp_http in (401, 403) and not wp.get("wpPostId")
    return (f"offset={int(offset)} attempt={int(attempt)} http={label(http_status)} "
            f"blog_post_id={label(row.get('blogPostId'))} "
            f"wordpress_status={label(wp.get('status'))} wordpress_reason={label(wp.get('reason'))} "
            f"wordpress_http={wp_http} wp_post_id={label(wp.get('wpPostId'))} "
            f"retry_eligible={str(retry).lower()}")


if __name__ == "__main__":
    response, summary, offset, attempt, status = sys.argv[1:]
    evidence = describe(response, offset, attempt, status)
    print(evidence)
    with open(summary, "a", encoding="utf-8") as file:
        file.write(evidence + "\n")
