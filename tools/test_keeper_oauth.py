"""Offline tests only; never load operator config or canonical env here."""
import tempfile
import unittest
from unittest.mock import patch
import io
import contextlib
from pathlib import Path
import keeper_oauth as k

class HandoffTests(unittest.TestCase):
    def test_blank_config_fails(self):
        with self.assertRaises(k.SafeError):
            k.validate_config({})

    def fixture(self, root):
        p = Path(root) / 'canonical.env'
        raw = b'# untouched\nTHREADS_APP_ID=app\nTHREADS_ACCOUNT_ID=123\nTHREADS_ACCESS_TOKEN=old\nPERMIT=disabled\n'
        p.write_bytes(raw); p.chmod(0o600)
        c = dict(site='https://www.keepioo.com', canonical_env=str(p), control_secret='private-control', expected_user_id='123', expected_username='keeper.punch', app_id='app')
        credential = dict(nonce='a'*64, app_id='app', user_id='123', username='keeper.punch', access_token='new-token', scopes=list(k.SCOPES), expires_at=(k.time.time()+3600)*1000)
        return p, raw, c, credential

    def proof(self, url, headers, body=None):
        self.assertEqual(headers['Authorization'], 'Bearer new-token')
        if '/permissions' in url:
            return {'data': [dict(permission=s, status='granted') for s in k.SCOPES]}
        return dict(id='123', username='keeper.punch')

    def test_persist_proofs_backup_scoped_update_and_private_modes(self):
        with tempfile.TemporaryDirectory() as root:
            p, raw, c, credential = self.fixture(root)
            calls = []
            def request(*args):
                calls.append(args[0]); return self.proof(*args)
            k.persist(c, credential, {'nonce': 'a'*64}, request)
            self.assertEqual(len(calls), 3)
            self.assertIn(b'PERMIT=disabled\n', p.read_bytes())
            self.assertIn(b'# untouched\n', p.read_bytes())
            self.assertIn(b'THREADS_ACCESS_TOKEN=new-token\n', p.read_bytes())
            self.assertEqual(p.stat().st_mode & 0o777, 0o600)
            backups = list(Path(root).glob('*.keeper-backup-*'))
            self.assertEqual(len(backups), 1); self.assertEqual(backups[0].read_bytes(), raw)
            self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)

    def test_failed_proofs_bindings_or_expiry_never_modify_source(self):
        for change in ({'username':'other'}, {'app_id':'other'}, {'user_id':'999'}, {'expires_at':0}, {'nonce':'bad'}, {'scopes': []}):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as root:
                p, raw, c, credential = self.fixture(root); credential.update(change)
                with self.assertRaises(k.SafeError):
                    k.persist(c, credential, {'nonce':'a'*64}, self.proof)
                self.assertEqual(p.read_bytes(), raw)
                self.assertEqual(list(Path(root).glob('*.keeper-backup-*')), [])
        for response in ({'id':'999','username':'keeper.punch'}, {'data':[]}):
            with tempfile.TemporaryDirectory() as root:
                p, raw, c, credential = self.fixture(root)
                with self.assertRaises(k.SafeError):
                    k.persist(c, credential, {'nonce':'a'*64}, lambda *args: response)
                self.assertEqual(p.read_bytes(), raw)

    def test_canonical_binding_source_cas_and_symlinks(self):
        with tempfile.TemporaryDirectory() as root:
            p, raw, c, credential = self.fixture(root)
            c['app_id'] = 'wrong'
            with self.assertRaises(k.SafeError):
                k.persist(c, credential, {'nonce':'a'*64}, self.proof)
            self.assertEqual(p.read_bytes(), raw)
            with self.assertRaises(k.SafeError):
                k.atomic_write(p, b'bad', expected=b'wrong-hash')
            link = Path(root) / 'link'; link.symlink_to(p)
            with self.assertRaises(k.SafeError): k.private_read(link)
            with self.assertRaises(k.SafeError): k.atomic_write(link, b'bad')
            p.chmod(0o644)
            with self.assertRaises(k.SafeError): k.private_read(p)

    def test_prepare_and_handoff_transport_private_and_idempotent(self):
        with tempfile.TemporaryDirectory() as root:
            p, raw, c, credential = self.fixture(root); intent = Path(root) / 'intent.json'
            def request(url, headers, body=None):
                if '/start' in url:
                    self.assertNotIn('private-control', url)
                    self.assertEqual(headers['x-keeper-punch-control'], 'private-control')
                    query = k.urllib.parse.urlencode(dict(client_id='app', redirect_uri=k.CALLBACK, state='keeper-punch-v1.private-state', response_type='code', scope=','.join(k.SCOPES)))
                    return dict(nonce='a'*64, app_id='app', user_id='123', username='keeper.punch', expires_at=(k.time.time()+600)*1000, authorization_url='https://threads.net/oauth/authorize?' + query)
                if '/handoff' in url: return credential
                return self.proof(url, headers, body)
            self.assertEqual(k.operate('prepare', c, intent, request), 'prepared_private')
            self.assertEqual(intent.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(k.SafeError): k.operate('prepare', c, intent, request)
            self.assertEqual(k.operate('status', c, intent, request), 'verified_private')
            for _ in range(2): self.assertEqual(k.operate('handoff', c, intent, request), 'persisted_verified')

    def test_transport_caps_and_cli_error_has_no_secrets(self):
        class FakeResponse:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'x' * limit
        class FakeOpener:
            def open(self, *args, **kwargs): return FakeResponse()
        with patch.object(k.urllib.request, 'build_opener', return_value=FakeOpener()):
            with self.assertRaises(k.SafeError): k.transport('https://graph.threads.net/v1.0/me', {})
        out, err = io.StringIO(), io.StringIO()
        with patch.object(k.sys, 'argv', ['helper', 'status', '--config', '/not-opened', '--intent', '/not-opened']), patch.object(k, 'private_read', side_effect=RuntimeError('provider-secret')), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(k.main(), 1)
        self.assertEqual(out.getvalue(), '')
        self.assertEqual(err.getvalue(), 'keeper_oauth_failed\n')

    def test_proof_race_is_cas_rejected_and_parent_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            p, raw, c, credential = self.fixture(root)
            def race(*args):
                p.write_bytes(raw + b'CONCURRENT=keep\n')
                return self.proof(*args)
            with self.assertRaises(k.SafeError): k.persist(c, credential, {'nonce': 'a'*64}, race)
            self.assertEqual(p.read_bytes(), raw + b'CONCURRENT=keep\n')
            link = Path(root) / 'parent-link'; link.symlink_to(Path(root), target_is_directory=True)
            with self.assertRaises(k.SafeError): k.private_read(link / p.name)

    def test_sourceable_env_rejects_shell_control_tokens(self):
        for unsafe in ('abc|id', '~', 'abc~tail', 'abc;false', 'abc\nBAD=1'):
            with self.subTest(token=unsafe), tempfile.TemporaryDirectory() as root:
                p, raw, c, credential = self.fixture(root)
                credential['access_token'] = unsafe
                calls = []
                def otherwise_valid(url, headers, body=None):
                    calls.append(url)
                    if url.endswith('/permissions'):
                        return {'data': [dict(permission=s, status='granted') for s in k.SCOPES]}
                    return dict(id='123', username='keeper.punch')
                with self.assertRaises(k.SafeError):
                    k.persist(c, credential, {'nonce': 'a'*64}, otherwise_valid)
                self.assertEqual(calls, [])
                self.assertEqual(p.read_bytes(), raw)
                self.assertEqual(list(Path(root).glob('*.keeper-backup-*')), [])

    def test_transport_rejects_near_match_paths_queries_and_methods_before_network(self):
        cases = [
            ('https://graph.threads.net/v1.0/me_unintended', None),
            ('https://graph.threads.net/v1.0/me?access_token=not-a-real-token', None),
            ('https://graph.threads.net/v1.0/me/permissions?extra=1', None),
            ('https://graph.threads.net/v1.0/me', b'{}'),
            ('https://www.keepioo.com/api/threads/keeper-punch/oauth/start-extra', b'{}'),
            ('https://www.keepioo.com/api/threads/keeper-punch/oauth/start', None),
        ]
        for url, body in cases:
            with self.subTest(url=url), patch.object(k.urllib.request, 'build_opener') as connect:
                with self.assertRaises(k.SafeError):
                    k.transport(url, {}, body)
                connect.assert_not_called()

    def test_safe_token_survives_actual_shell_source_unchanged(self):
        import subprocess
        with tempfile.TemporaryDirectory() as root:
            p, raw, c, credential = self.fixture(root)
            credential['access_token'] = 'fixture-token_123.safe'
            def proof(url, headers, body=None):
                if url.endswith('/permissions'):
                    return {'data': [dict(permission=s, status='granted') for s in k.SCOPES]}
                return dict(id='123', username='keeper.punch')
            k.persist(c, credential, {'nonce': 'a'*64}, proof)
            proc = subprocess.run(['bash', '-c', '. "$1"; printf "%s" "$THREADS_ACCESS_TOKEN"', 'fixture', str(p)], capture_output=True, text=True, timeout=3)
            self.assertEqual(proc.returncode, 0)
            self.assertEqual(proc.stdout, 'fixture-token_123.safe')

    def test_cli_has_absolute_deadline_and_private_failure(self):
        import time
        out, err = io.StringIO(), io.StringIO()
        start = time.monotonic()
        with patch.object(k.sys, 'argv', ['helper', 'status', '--config', '/not-opened', '--intent', '/not-opened']), patch.object(k, 'private_read', return_value=b'{}'), patch.object(k, 'operate', side_effect=lambda *args: time.sleep(0.3)), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(k.main(deadline_seconds=0.05), 1)
        self.assertLess(time.monotonic() - start, 0.25)
        self.assertEqual(out.getvalue(), '')
        self.assertEqual(err.getvalue(), 'keeper_oauth_failed\n')

    def test_no_redirect_or_arbitrary_source(self):
        with self.assertRaises(k.SafeError): k.NoRedirect().redirect_request(None, None, None, None, None, None)
        with self.assertRaises(k.SafeError): k.transport('https://attacker.invalid', {})

if __name__ == '__main__':
    unittest.main()
