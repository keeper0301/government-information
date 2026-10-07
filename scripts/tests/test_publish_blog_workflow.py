import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/publish-blog.yml'

class PublishWorkflowTests(unittest.TestCase):
    def run_workflow(self, status, payload=None):
        source = WORKFLOW.read_text().split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] for line in source.splitlines())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            curl = path / 'curl'
            curl.write_text('''#!/usr/bin/env python3
import sys,os
from pathlib import Path
args=sys.argv[1:]
with open(os.environ['CALLS'],'a') as f: f.write('call\\n')
Path(args[args.index('-o')+1]).write_text(os.environ['PAYLOAD'])
print(os.environ['STATUS'],end='')
if os.environ['STATUS']=='000': sys.exit(28)
''')
            curl.chmod(0o755)
            sleep = path / 'sleep'
            sleep.write_text('#!/bin/sh\nexit 0\n')
            sleep.chmod(0o755)
            env = {**os.environ, 'PATH': str(path)+':'+os.environ['PATH'], 'CRON_SECRET': 'fixture', 'GITHUB_STEP_SUMMARY': str(path/'summary'), 'CALLS': str(path/'calls'), 'STATUS': status, 'PAYLOAD': json.dumps(payload or {})}
            result = subprocess.run(['bash', '-c', script], cwd=ROOT, env=env, capture_output=True, text=True)
            return result, len((path/'calls').read_text().splitlines()), (path/'summary').read_text()

    def test_unknown_delivery_and_5xx_are_not_retried(self):
        for status in ['000','500','502','200']:
            with self.subTest(status=status):
                result, calls, summary = self.run_workflow(status)
                self.assertEqual(calls, 7)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('offset=0', summary)
                self.assertIn('blog_post_id=unknown', summary)
                self.assertIn('wordpress_reason=unknown', summary)

    def test_definite_auth_denial_can_be_retried(self):
        for status in ['401','403']:
            result, calls, summary = self.run_workflow(status)
            self.assertEqual(calls, 14)
            self.assertNotEqual(result.returncode, 0)

    def test_existing_wordpress_failure_is_logged_without_regeneration(self):
        payload = {'success':1, 'results':[{'blogPostId':'existing-id','slug':'existing-slug','wordpress':{'status':'failed','reason':'api_error','httpStatus':500,'retryEligible':False}}]}
        result, calls, summary = self.run_workflow('200', payload)
        self.assertEqual(calls, 7)
        self.assertNotEqual(result.returncode, 0)
        for expected in ['offset=2','blog_post_id=existing-id','wordpress_reason=api_error','wordpress_http=500','retry_eligible=false']:
            self.assertIn(expected, summary)

if __name__ == '__main__':
    unittest.main()
