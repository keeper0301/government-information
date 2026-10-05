import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "verify_wordpress_public.py"
spec = importlib.util.spec_from_file_location("verify_wordpress_public", MODULE_PATH)
assert spec is not None and spec.loader is not None
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)

ORIGIN = "https://info.keeper0301.com"
LINK = ORIGIN + "/test-policy/"
PAYLOAD = {"success": 1, "results": [{"wordpress": {"status": "published", "wpPostId": 18489, "url": LINK}}]}


class VerifyWordPressPublicTests(unittest.TestCase):
    def test_confirms_exact_id_published_status_and_host(self):
        target = verify.extract_target(PAYLOAD, ORIGIN)
        fetch = lambda url, timeout: {"id": 18489, "status": "publish", "link": LINK}
        self.assertEqual(verify.verify_public(target, ORIGIN, fetch, lambda _: None), (True, "verified"))

    def test_rejects_draft_and_wrong_host_as_public_proof(self):
        target = verify.extract_target(PAYLOAD, ORIGIN)
        for returned in [
            {"id": 18489, "status": "draft", "link": LINK},
            {"id": 18489, "status": "publish", "link": "https://evil.example/test/"},
            {"id": 18489, "status": "publish", "link": ORIGIN + "/another-policy/"},
            {"id": 18488, "status": "publish", "link": LINK},
        ]:
            ok, reason = verify.verify_public(target, ORIGIN, lambda url, timeout: returned, lambda _: None)
            self.assertFalse(ok, reason)

    def test_does_not_follow_untrusted_post_links(self):
        for patch in [
            {"url": "http://info.keeper0301.com/test/"},
            {"url": "https://evil.example/test/"},
            {"wpPostId": "18489"},
            {"status": "held_for_review"},
        ]:
            d = {"success": 1, "results": [{"wordpress": {**PAYLOAD["results"][0]["wordpress"], **patch}}]}
            with self.assertRaises(ValueError):
                verify.extract_target(d, ORIGIN)

    def test_transient_timeout_retries_only_get_not_publish(self):
        attempts = []
        def fetch(url, timeout):
            attempts.append(url)
            if len(attempts) == 1:
                raise TimeoutError("slow")
            return {"id": 18489, "status": "publish", "link": LINK}
        self.assertEqual(verify.verify_public(verify.extract_target(PAYLOAD, ORIGIN), ORIGIN, fetch, lambda _: None), (True, "verified"))
        self.assertEqual(len(attempts), 2)
        self.assertTrue(all(url.startswith(ORIGIN + "/wp-json/wp/v2/posts/18489?") for url in attempts))


if __name__ == "__main__":
    unittest.main()
