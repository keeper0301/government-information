#!/usr/bin/env python3
"""Read-only public WordPress REST readback for one Action result (never POST)."""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

DEFAULT_ORIGIN = "https://info.keeper0301.com"


def same_origin(url, origin):
    try:
        parsed = urllib.parse.urlsplit(url)
        expected = urllib.parse.urlsplit(origin)
        return (parsed.scheme == expected.scheme == "https" and
                parsed.netloc == expected.netloc and
                not parsed.username and not parsed.password and
                bool(parsed.path) and not parsed.fragment)
    except ValueError:
        return False


def same_public_link(actual, expected):
    a = urllib.parse.urlsplit(actual)
    b = urllib.parse.urlsplit(expected)
    return (a.scheme, a.netloc, urllib.parse.unquote(a.path).rstrip("/"), a.query) == (
        b.scheme, b.netloc, urllib.parse.unquote(b.path).rstrip("/"), b.query)


def extract_target(response, origin=DEFAULT_ORIGIN):
    results = response.get("results") if isinstance(response, dict) else None
    if not isinstance(results, list) or len(results) != 1 or response.get("success") != 1:
        raise ValueError("invalid_publish_result")
    wp = results[0].get("wordpress") if isinstance(results[0], dict) else None
    if not isinstance(wp, dict) or wp.get("status") != "published":
        raise ValueError("not_reported_published")
    post_id = wp.get("wpPostId")
    link = wp.get("url")
    if isinstance(post_id, bool) or not isinstance(post_id, int) or post_id <= 0:
        raise ValueError("missing_wp_id")
    if not isinstance(link, str) or not same_origin(link, origin):
        raise ValueError("wrong_wp_link_origin")
    return {"id": post_id, "link": link}


def public_get_json(url, timeout):
    req = urllib.request.Request(url, headers={
        "User-Agent": "keepioo-public-readback/1.0",
        "Cache-Control": "no-cache",
        "Accept": "application/json",
    })
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=timeout) as res:
        return json.loads(res.read(20_001))


def verify_public(target, origin=DEFAULT_ORIGIN, fetch=public_get_json, pause=time.sleep):
    url = origin.rstrip("/") + "/wp-json/wp/v2/posts/" + str(target["id"])
    url += "?" + urllib.parse.urlencode({"_fields": "id,status,link", "_": int(time.time())})
    reason = "readback_unavailable"
    for attempt in range(2):
        try:
            response = fetch(url, 18)
            if (isinstance(response, dict) and response.get("id") == target["id"] and
                    response.get("status") == "publish" and
                    isinstance(response.get("link"), str) and
                    same_origin(response["link"], origin) and
                    same_public_link(response["link"], target["link"])):
                return True, "verified"
            reason = "public_status_or_link_mismatch"
        except (OSError, ValueError, json.JSONDecodeError):
            reason = "readback_unavailable"
        if attempt == 0:
            pause(2)
    return False, reason


def main(argv):
    if len(argv) != 2:
        print("usage: verify_wordpress_public.py <publish-response.json>", file=sys.stderr)
        return 2
    origin = os.getenv("WP_PUBLIC_ORIGIN", DEFAULT_ORIGIN)
    if origin != DEFAULT_ORIGIN:
        print("wp_public_readback result=untrusted_origin", file=sys.stderr)
        return 2
    try:
        with open(argv[1], encoding="utf-8") as f:
            target = extract_target(json.load(f), origin)
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print("wp_public_readback result=" + str(e), file=sys.stderr)
        return 1
    ok, reason = verify_public(target, origin)
    print("wp_public_readback id=" + str(target["id"]) + " result=" + reason)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
