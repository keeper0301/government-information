#!/usr/bin/env python3
"""Private keeper.punch OAuth operator. No publication capability; stdlib only."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CANONICAL = '/home/user/.hermes/workspace/claude/config/keepioo-publisher.env'
CALLBACK = 'https://www.keepioo.com/api/threads/oauth/callback'
SCOPES = ('threads_basic', 'threads_content_publish', 'threads_read_replies', 'threads_manage_replies')
class SafeError(Exception):
    pass

def validate_config(c):
    keys = ('site', 'canonical_env', 'control_secret', 'expected_user_id', 'expected_username', 'app_id')
    if any(not isinstance(c.get(k), str) or not c[k].strip() for k in keys):
        raise SafeError('invalid_config')
    if c['site'] != 'https://www.keepioo.com' or c['expected_username'] != 'keeper.punch':
        raise SafeError('invalid_binding')
    if not Path(c['canonical_env']).is_absolute():
        raise SafeError('invalid_path')
    return c

def safe_path(path):
    p = Path(os.path.abspath(path))
    for q in (p, *p.parents):
        if q.is_symlink():
            raise SafeError('symlink_rejected')
    return p

def private_read(path):
    p = safe_path(path)
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as f:
        s = os.fstat(f.fileno())
        if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_mode & 0o077 or s.st_nlink != 1:
            raise SafeError('private_file_required')
        data = f.read(131073)
        if len(data) > 131072:
            raise SafeError('file_limit')
        return data

@contextlib.contextmanager
def locked(path):
    p = safe_path(str(path) + '.lock')
    fd = os.open(p, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        s = os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_mode & 0o077 or s.st_nlink != 1:
            raise SafeError('private_lock_required')
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)

def atomic_write(path, data, expected=None):
    p = safe_path(path)
    if expected is not None and hashlib.sha256(private_read(p)).digest() != expected:
        raise SafeError('source_changed')
    temp = p.with_name('.' + p.name + '.' + secrets.token_hex(12))
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data); f.flush(); os.fsync(f.fileno())
        safe_path(p)
        if expected is not None and hashlib.sha256(private_read(p)).digest() != expected:
            raise SafeError('source_changed')
        os.replace(temp, p)
        d = os.open(p.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(d)
        finally:
            os.close(d)
    finally:
        if temp.exists():
            temp.unlink()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise SafeError('redirect_rejected')

def transport(url, headers, body=None):
    parsed = urllib.parse.urlsplit(url)
    exact_site = parsed.scheme == 'https' and parsed.netloc == 'www.keepioo.com'
    exact_graph = parsed.scheme == 'https' and parsed.netloc == 'graph.threads.net'
    site_allowed = (exact_site and body is not None and not parsed.query and
                    parsed.path in ('/api/threads/keeper-punch/oauth/start', '/api/threads/keeper-punch/oauth/handoff'))
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    debug_allowed = (parsed.path == '/v1.0/debug_token' and len(query) == 1 and
                     query[0][0] == 'input_token' and re.fullmatch(r'[A-Za-z0-9_.-]{1,8192}', query[0][1]) is not None)
    form = urllib.parse.parse_qsl(body.decode('ascii'), keep_blank_values=True) if exact_graph and isinstance(body, bytes) else []
    app_allowed = (exact_graph and parsed.path == '/oauth/access_token' and not parsed.query and
                   headers.get('Content-Type') == 'application/x-www-form-urlencoded' and len(form) == 3 and
                   sorted(key for key, _ in form) == ['client_id', 'client_secret', 'grant_type'] and
                   all(value and not re.search(r'[\s\x00-\x1f\x7f]', value) for _, value in form) and
                   dict(form).get('grant_type') == 'client_credentials')
    graph_allowed = (exact_graph and body is None and
                     ((parsed.path == '/v1.0/me' and parsed.query in ('', 'fields=id,username')) or
                      debug_allowed))
    if parsed.fragment or not (site_allowed or graph_allowed or app_allowed):
        raise SafeError('transport_target_rejected')
    req = urllib.request.Request(url, data=body, headers=headers, method='POST' if body is not None else 'GET')
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=20) as r:
            raw = r.read(32769)
            if len(raw) > 32768 or r.status != 200:
                raise SafeError('transport_failed')
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        if url == 'https://www.keepioo.com/api/threads/keeper-punch/oauth/handoff' and error.code in (409, 410):
            raw = error.read(1025)
            if len(raw) <= 1024:
                try:
                    status = json.loads(raw).get('status')
                    if status in ('prepared', 'exchanging', 'unknown'):
                        return {'status': status}
                    if error.code == 410:
                        return {'status': 'expired'}
                except Exception:
                    pass
        raise SafeError('transport_failed') from None
    except Exception:
        raise SafeError('transport_failed') from None

def local_env(raw):
    result = {}
    for line in raw.decode('utf8').splitlines():
        m = re.match(r'^(?:export\s+)?([A-Z0-9_]+)=(.*)$', line)
        if m:
            if m[1] in result:
                raise SafeError('duplicate_env_key')
            result[m[1]] = m[2].strip().strip('\"\'')
    return result

def bound_env(raw, c):
    env = local_env(raw)
    ids = [env[k] for k in ('THREADS_ACCOUNT_ID', 'THREADS_USER_ID') if k in env]
    if not ids or any(v != c['expected_user_id'] for v in ids) or env.get('THREADS_APP_ID') != c['app_id']:
        raise SafeError('canonical_binding_mismatch')
    if not env.get('THREADS_APP_SECRET') or env['THREADS_APP_SECRET'] != env['THREADS_APP_SECRET'].strip():
        raise SafeError('canonical_app_secret_required')
    return env

def persist(c, credential, intent, request=transport):
    # Lock source across provider proof and scoped atomic update; re-check digest before replace.
    with locked(c['canonical_env']):
        raw = private_read(c['canonical_env']); env = bound_env(raw, c)
        if (credential.get('nonce') != intent.get('nonce') or credential.get('app_id') != c['app_id'] or
            credential.get('user_id') != c['expected_user_id'] or credential.get('username') != 'keeper.punch' or
            type(credential.get('expires_at')) not in (int, float) or not math.isfinite(credential['expires_at']) or credential['expires_at'] <= time.time() * 1000 or
            not set(SCOPES).issubset(credential.get('scopes', []))):
            raise SafeError('credential_binding_failed')
        token = credential.get('access_token')
        if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,8192}', token):
            raise SafeError('invalid_token')
        headers = {'Authorization': 'Bearer ' + token}
        for _ in range(2):
            me = request('https://graph.threads.net/v1.0/me?fields=id,username', headers)
            if me.get('id') != c['expected_user_id'] or me.get('username') != 'keeper.punch':
                raise SafeError('identity_proof_failed')
        app_token = request('https://graph.threads.net/oauth/access_token', {'Content-Type': 'application/x-www-form-urlencoded'},
                            urllib.parse.urlencode({'client_id': c['app_id'], 'client_secret': env['THREADS_APP_SECRET'], 'grant_type': 'client_credentials'}).encode('ascii'))
        if not isinstance(app_token.get('access_token'), str) or not app_token['access_token']:
            raise SafeError('app_token_failed')
        debug = request('https://graph.threads.net/v1.0/debug_token?' + urllib.parse.urlencode({'input_token': token}),
                        {'Authorization': 'Bearer ' + app_token['access_token']})
        d = debug.get('data')
        if (not isinstance(d, dict) or d.get('is_valid') is not True or d.get('type') != 'USER' or
            d.get('user_id') != c['expected_user_id'] or ('app_id' in d and d['app_id'] != c['app_id']) or
            type(d.get('expires_at')) not in (int, float) or not math.isfinite(d['expires_at']) or
            not math.isfinite(d['expires_at'] * 1000) or d['expires_at'] * 1000 <= time.time() * 1000 or
            not isinstance(d.get('scopes'), list) or not all(s in d['scopes'] for s in SCOPES)):
            raise SafeError('grant_proof_failed')
        expires_at = min(credential['expires_at'], d['expires_at'] * 1000)
        if expires_at <= time.time() * 1000:
            raise SafeError('credential_expired')
        # Only token and token metadata; no permits, timers, app/account ids or publish controls.
        updates = {'THREADS_ACCESS_TOKEN': token, 'THREADS_TOKEN_EXPIRES_AT': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(expires_at / 1000)), 'THREADS_SCOPES': ','.join(SCOPES)}
        lines = raw.decode().splitlines(keepends=True)
        for key, value in updates.items():
            found = False
            for n, line in enumerate(lines):
                if re.match(r'^(?:export\s+)?' + key + '=', line):
                    ending = '\r\n' if line.endswith('\r\n') else '\n'
                    lines[n] = key + '=' + value + ending; found = True
            if not found:
                if lines and not lines[-1].endswith('\n'):
                    lines[-1] += '\n'
                lines.append(key + '=' + value + '\n')
        digest = hashlib.sha256(raw).digest()
        backup = str(c['canonical_env']) + '.keeper-backup-' + secrets.token_hex(12)
        fd = os.open(safe_path(backup), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as f:
            f.write(raw); f.flush(); os.fsync(f.fileno())
        atomic_write(c['canonical_env'], ''.join(lines).encode(), expected=digest)

def operate(action, c, intent_path, request=transport):
    c = validate_config(c)
    auth = {'x-keeper-punch-control': c['control_secret'], 'Content-Type': 'application/json'}
    base = c['site'] + '/api/threads/keeper-punch/oauth/'
    with locked(intent_path):
        if action == 'prepare':
            if Path(intent_path).exists():
                raise SafeError('intent_already_exists')
            # Verify existing account/app before even starting a flow.
            bound_env(private_read(c['canonical_env']), c)
            intent = request(base + 'start', auth, b'{}')
            parsed = urllib.parse.urlparse(intent.get('authorization_url', ''))
            query = urllib.parse.parse_qs(parsed.query)
            if (parsed.scheme != 'https' or parsed.netloc != 'threads.net' or parsed.path != '/oauth/authorize' or
                query.get('client_id') != [c['app_id']] or query.get('redirect_uri') != [CALLBACK] or
                not re.fullmatch('[a-f0-9]{64}', intent.get('nonce', '')) or
                intent.get('user_id') != c['expected_user_id'] or intent.get('app_id') != c['app_id'] or
                intent.get('username') != 'keeper.punch'):
                raise SafeError('intent_binding_failed')
            if intent.get('expires_at', 0) <= time.time() * 1000 or query.get('response_type') != ['code'] or not set(SCOPES).issubset(query.get('scope', [''])[0].split(',')) or not query.get('state', [''])[0].startswith('keeper-punch-v1.'):
                raise SafeError('intent_expired_or_invalid')
            atomic_write(intent_path, json.dumps(intent).encode())
            return 'prepared_private'
        intent = json.loads(private_read(intent_path))
        credential = request(base + 'handoff', auth, json.dumps({'nonce': intent['nonce']}).encode())
        if action == 'status':
            if credential.get('status') in ('prepared', 'exchanging', 'unknown', 'expired'):
                return credential['status']
            return 'verified_private' if (credential.get('nonce') == intent['nonce'] and credential.get('app_id') == c['app_id'] and credential.get('user_id') == c['expected_user_id'] and credential.get('username') == 'keeper.punch' and credential.get('expires_at', 0) > time.time() * 1000) else 'not_verified'
        persist(c, credential, intent, request)
        return 'persisted_verified'

def main(deadline_seconds: float = 90):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'status', 'handoff'))
    parser.add_argument('--config', required=True, help='private JSON file path; never a secret argument')
    parser.add_argument('--intent', required=True, help='private intent file path')
    args = parser.parse_args()
    def deadline_expired(signum, frame):
        raise SafeError('operation_deadline')
    previous_handler = signal.signal(signal.SIGALRM, deadline_expired)
    previous_timer = signal.setitimer(signal.ITIMER_REAL, deadline_seconds)
    try:
        c = json.loads(private_read(args.config))
        print(operate(args.action, c, args.intent))
    except Exception:
        print('keeper_oauth_failed', file=sys.stderr)
        return 1
    finally:
        signal.setitimer(signal.ITIMER_REAL, *previous_timer)
        signal.signal(signal.SIGALRM, previous_handler)
    return 0
if __name__ == '__main__':
    sys.exit(main())
