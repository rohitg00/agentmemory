import importlib.util
from contextlib import contextmanager
from contextvars import ContextVar, copy_context
import json
import os
import sys
import types
from pathlib import Path
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
import unittest
from unittest.mock import patch

PLUGIN = Path(__file__).resolve().parents[1] / 'integrations/hermes/__init__.py'


class ProviderContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        (self.home / '.agentmemory').mkdir()
        self.env = patch.dict(os.environ, {'HOME': str(self.home), 'HERMES_HOME': str(self.home / '.hermes')}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.temp.cleanup)
        scope = types.ModuleType('agent.secret_scope')
        scope.get_secret = os.environ.get
        scope.current_secret_scope = lambda: None
        scope.current_secret_scope_home = lambda: None
        scope.serves_routed_profile = lambda: False
        agent = types.ModuleType('agent')
        agent.secret_scope = scope
        modules = patch.dict(sys.modules, {'agent': agent, 'agent.secret_scope': scope})
        modules.start()
        self.addCleanup(modules.stop)


    def load(self):
        spec = importlib.util.spec_from_file_location('hermes_contract', PLUGIN)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.module = module
        return module

    def test_missing_scoped_accessor_never_falls_back_to_environment_or_files(self):
        os.environ['AGENTMEMORY_SECRET'] = 'process-secret-must-not-be-used'
        (self.home / '.agentmemory/secret').write_text('file-secret-must-not-be-used')
        module = self.load()
        with patch.dict(sys.modules, {'agent.secret_scope': None}):
            self.assertFalse(module.AgentMemoryProvider().is_available())
            self.assertIn('scoped credential access is unavailable', module.AgentMemoryProvider().unavailable_reason())
            with self.assertRaises(RuntimeError):
                module._environment_value('AGENTMEMORY_SECRET')

    def test_provider_never_reads_credential_files(self):
        (self.home / '.agentmemory/secret').write_text('other-application-secret')
        (self.home / '.agentmemory/.env').write_text('AGENTMEMORY_URL=https://other.invalid\nAGENTMEMORY_SECRET=other-secret\n')
        module = self.load()
        original = Path.read_text
        def read(path, *args, **kwargs):
            self.assertNotIn(path.name, ('.env', 'secret'))
            return original(path, *args, **kwargs)
        with patch.object(Path, 'read_text', read):
            self.assertEqual(module._configuration(), (module.DEFAULT_BASE_URL, ''))
        self.assertNotIn('AGENTMEMORY_SECRET', os.environ)

    @contextmanager
    def scoped_runtime(self):
        active_home = ContextVar('test_home', default=Path(os.environ['HERMES_HOME']))
        values = ContextVar('test_secrets', default=None)
        provenance = ContextVar('test_scope_home', default=None)
        agent = types.ModuleType('agent')
        scope = types.ModuleType('agent.secret_scope')
        constants = types.ModuleType('hermes_constants')
        scope.current_secret_scope = values.get
        scope.current_secret_scope_home = provenance.get
        scope.serves_routed_profile = lambda: True
        def get_secret(name):
            if values.get() is None:
                raise RuntimeError('missing profile scope')
            return values.get().get(name)
        scope.get_secret = get_secret
        agent.secret_scope = scope
        constants.get_hermes_home = active_home.get
        @contextmanager
        def bound(home, secrets, stamped_home=None):
            tokens = (active_home.set(home), values.set(secrets), provenance.set(stamped_home or home))
            try:
                yield
            finally:
                active_home.reset(tokens[0])
                values.reset(tokens[1])
                provenance.reset(tokens[2])
        with patch.dict(sys.modules, {'agent': agent, 'agent.secret_scope': scope, 'hermes_constants': constants}):
            yield bound

    def provider(self, **kwargs):
        module = self.load()
        self.calls = []
        def request(base, path, body=None, **options):
            self.calls.append((base, path, body, options))
            return {"session": {"id": body["sessionId"]}} if path == "session/start" else {"success": True}
        module._api = request
        provider = module.AgentMemoryProvider()
        provider.initialize('old-session', cwd=str(self.home), **kwargs)
        return provider

    def test_config_precedence_and_no_saved_credential_on_url_override(self):
        profile = self.home / 'profile'
        profile.mkdir()
        (profile / 'agentmemory.json').write_text(json.dumps({'url': 'https://configured.invalid/', 'secret': 'synthetic-config-secret'}))
        os.environ['HERMES_HOME'] = str(profile)
        module = self.load()
        self.assertEqual(module._configuration(), ('https://configured.invalid', ''))
        self.assertTrue(module.AgentMemoryProvider().is_available())
        os.environ['AGENTMEMORY_URL'] = 'https://override.invalid'
        self.assertEqual(module._configuration(), ('https://override.invalid', ''))
        os.environ['AGENTMEMORY_SECRET'] = 'synthetic-explicit-secret'
        self.assertEqual(module._configuration(), ('https://override.invalid', 'synthetic-explicit-secret'))

    def test_config_respects_initialize_home_and_does_not_save_secrets(self):
        provider = self.provider()
        profile = self.home / 'profile'
        provider.save_config({'url': 'http://127.0.0.1:9999', 'secret': 'must-not-be-saved'}, str(profile))
        self.assertEqual(json.loads((profile / 'agentmemory.json').read_text()), {'url': 'http://127.0.0.1:9999'})
        with self.assertRaises(ValueError):
            provider.save_config({'url': 'https://user:secret@example.invalid'}, str(profile))
        self.assertEqual(json.loads((profile / 'agentmemory.json').read_text()), {'url': 'http://127.0.0.1:9999'})
        os.environ['HERMES_HOME'] = str(profile)
        provider.initialize('profile-session', cwd=str(self.home), hermes_home=str(profile))
        self.assertEqual(self.calls[-1][0], 'http://127.0.0.1:9999')

    def test_malformed_config_falls_back_and_invalid_explicit_url_is_unavailable(self):
        profile = self.home / '.hermes'
        profile.mkdir()
        (profile / 'agentmemory.json').write_text('{')
        module = self.load()
        self.assertEqual(module._configuration()[0], module.DEFAULT_BASE_URL)
        for value in ['[]', '{"url": false}', '{"url": 123}']:
            (profile / 'agentmemory.json').write_text(value)
            self.assertEqual(module._configuration()[0], module.DEFAULT_BASE_URL)
        os.environ['AGENTMEMORY_URL'] = 'file:///tmp/memory'
        self.assertFalse(module.AgentMemoryProvider().is_available())

    def test_url_delimiters_fail_closed_without_rejecting_encoded_paths(self):
        module = self.load()
        module.urlopen = lambda *a, **k: self.fail('invalid endpoint reached the network')
        for suffix in ['?', '#', '?query', '#fragment']:
            endpoint = 'http://localhost:3111/base' + suffix
            self.assertFalse(module._validate_url(endpoint), endpoint)
            self.assertEqual(module._api(endpoint, 'search')['errorCode'], 'invalid_url')
        for suffix in ['%3F', '%23']:
            self.assertTrue(module._validate_url('http://localhost:3111/base' + suffix))

    def test_plaintext_guard_uses_same_numeric_loopback_boundary(self):
        module = self.load()
        os.environ['AGENTMEMORY_REQUIRE_HTTPS'] = '1'
        for url in ['http://127.2.3.4', 'http://[::1]', 'http://localhost']:
            module._check_plaintext_bearer_guard(url, 'synthetic')
        with self.assertRaises(RuntimeError):
            module._check_plaintext_bearer_guard('http://127.example.invalid', 'synthetic')

    def test_authentication_offline_and_invalid_responses_are_distinguishable(self):
        module = self.load()
        for error, code in [(HTTPError('http://localhost', 401, 'private details', None, None), 'authentication'), (URLError('private address'), 'unavailable')]:
            module.urlopen = lambda *a, error=error, **k: (_ for _ in ()).throw(error)
            result = module._api('http://localhost', 'search', {'query': 'test'})
            self.assertFalse(result['success'])
            self.assertEqual(result['errorCode'], code)
            self.assertNotIn('private', result['error'])
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'[]'
        module.urlopen = lambda *a, **k: Response()
        self.assertEqual(module._api('http://localhost', 'search')['errorCode'], 'invalid_response')

    def test_endpoint_change_does_not_receive_a_different_endpoints_credentials(self):
        module = self.load()
        os.environ['AGENTMEMORY_URL'] = 'https://remote.invalid'
        seen = []
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'{"success":true}'
        def intercept(request, **kwargs):
            seen.append(request.get_header('Authorization'))
            return Response()
        module.urlopen = intercept
        provider = module.AgentMemoryProvider()
        provider.initialize('session', cwd=str(self.home))
        os.environ['AGENTMEMORY_SECRET'] = 'different-profile-secret'
        os.environ['AGENTMEMORY_URL'] = 'https://different.invalid'
        provider.handle_tool_call('memory_save', {'content': 'test'})
        self.assertEqual(seen, [None])

    def test_credentials_rotate_for_the_same_endpoint(self):
        module = self.load()
        os.environ['AGENTMEMORY_SECRET'] = 'synthetic-first'
        calls = []
        module._api = lambda *a, **k: calls.append(k['secret']) or {'success': True}
        provider = module.AgentMemoryProvider()
        provider.initialize('session', cwd=str(self.home))
        os.environ['AGENTMEMORY_SECRET'] = 'synthetic-second'
        provider.handle_tool_call('memory_save', {'content': 'test'})
        os.environ['AGENTMEMORY_SECRET'] = 'synthetic-third'
        provider.handle_tool_call('memory_save', {'content': 'test'})
        self.assertEqual(calls, ['synthetic-first', 'synthetic-second', 'synthetic-third'])

    def test_routed_scope_never_falls_back_to_process_secrets_or_unscoped_profile(self):
        module = self.load()
        os.environ['AGENTMEMORY_SECRET'] = 'other-profile-secret'
        with self.scoped_runtime() as bound:
            self.assertFalse(module.AgentMemoryProvider().is_available())
            with bound(self.home / '.hermes', {}):
                self.assertEqual(module._configuration(), (module.DEFAULT_BASE_URL, ''))
            with bound(self.home / '.hermes', {}, self.home / 'other'):
                self.assertFalse(module.AgentMemoryProvider().is_available())

    def test_replacement_evolves_only_exact_owned_previous_content(self):
        provider = self.provider()
        next_id = [0]
        evolved = []
        def request(base, path, body, **kwargs):
            if path == 'evolve':
                evolved.append(body['memoryId'])
            self.assertIn(path, ['remember', 'evolve'])
            next_id[0] += 1
            return {'success': True, 'memory': {'id': f'mem_{next_id[0]}', 'content': body.get('content', body.get('newContent')), 'project': provider._project, 'agentId': provider._agent_id}}
        self.module._api = request
        provider.on_memory_write('add', 'memory', 'old unrelated fact')
        provider.on_memory_write('replace', 'memory', 'completely different replacement', {'previous_content': 'old unrelated fact'})
        self.assertEqual(evolved, ['mem_1'])
        provider.on_memory_write('replace', 'memory', 'other', {'previous_content': 'old'})
        provider.on_memory_write('replace', 'user', 'other', {'previous_content': 'completely different replacement'})
        self.assertEqual(evolved, ['mem_1'])
        self.assertNotIn('old unrelated fact', (provider._hermes_home / 'agentmemory-mirrors.json').read_text())

    def test_mirror_ownership_survives_restart_and_failed_evolve_keeps_old_mapping(self):
        provider = self.provider()
        next_id = [0]
        evolved = []
        fail = [True]
        def request(base, path, body, **kwargs):
            if path == 'evolve':
                evolved.append(body['memoryId'])
                if fail[0]:
                    return {'success': False, 'errorCode': 'unavailable'}
            if path in ['remember', 'evolve']:
                next_id[0] += 1
                return {'success': True, 'memory': {'id': f'mem_{next_id[0]}', 'content': body.get('content', body.get('newContent')), 'project': provider._project, 'agentId': provider._agent_id}}
            return {'success': True}
        self.module._api = request
        provider.on_memory_write('add', 'memory', 'old')
        another = self.module.AgentMemoryProvider()
        another.initialize('restarted', cwd=str(self.home))
        another.on_memory_write('replace', 'memory', 'new', {'previous_content': 'old'})
        fail[0] = False
        another.on_memory_write('replace', 'memory', 'new', {'previous_content': 'old'})
        self.assertEqual(evolved, ['mem_1', 'mem_1'])
        records = json.loads((provider._hermes_home / 'agentmemory-mirrors.json').read_text())
        self.assertNotIn(provider._mirror_key('memory', 'old'), records)

    def test_external_evolution_conflict_never_deletes_or_creates_a_competing_record(self):
        provider = self.provider()
        self.module._api = lambda *a, **k: {'success': True, 'memory': {'id': 'mem_old', 'content': 'old', 'project': provider._project, 'agentId': provider._agent_id}}
        provider.on_memory_write('add', 'memory', 'old')
        calls = []
        self.module._api = lambda base, path, body, **k: calls.append((path, body)) or {'success': False, 'code': 'not_latest'}
        provider.on_memory_write('replace', 'memory', 'new', {'previous_content': 'old'})
        self.assertEqual(calls, [('evolve', {'memoryId': 'mem_old', 'newContent': 'new'})])
        self.assertEqual(json.loads((provider._hermes_home / 'agentmemory-mirrors.json').read_text())[provider._mirror_key('memory', 'old')], 'mem_old')

    def test_foreign_identity_response_does_not_establish_mirror_ownership(self):
        provider = self.provider()
        self.module._api = lambda *a, **k: {'success': True, 'memory': {'id': 'mem_foreign', 'content': 'new', 'project': provider._project, 'agentId': 'someone-else'}}
        provider.on_memory_write('add', 'memory', 'new')
        self.assertFalse((provider._hermes_home / 'agentmemory-mirrors.json').exists())

    def test_same_returned_id_is_never_deleted(self):
        provider = self.provider()
        deleted = []
        def request(base, path, body, **kwargs):
            if path in ('remember', 'evolve'):
                return {'success': True, 'memory': {'id': 'mem_same', 'content': body.get('content', body.get('newContent')), 'project': provider._project, 'agentId': provider._agent_id}}
            deleted.append(path)
            return {'success': True}
        self.module._api = request
        provider.on_memory_write('add', 'memory', 'old')
        provider.on_memory_write('replace', 'memory', 'new', {'previous_content': 'old'})
        self.assertEqual(deleted, [])

    def test_redirects_refuse_to_forward_credentials(self):
        module = self.load()
        request = module.Request('http://localhost:3111', headers={'Authorization': 'Bearer synthetic'})
        with self.assertRaises(HTTPError):
            module._NoRedirect().redirect_request(request, None, 302, 'redirect', {}, 'https://remote.invalid')

    def test_native_save_preserves_metadata_and_search_preserves_result_identity(self):
        provider = self.provider()
        result = json.loads(provider.handle_tool_call('memory_save', {'content': 'remember this', 'concepts': 'one, two,one', 'files': ['a.py', 'b.py'], 'agentId': 'agent-a'}))
        self.assertTrue(result['success'])
        payload = self.calls[-1][2]
        self.assertEqual(payload['concepts'], ['one', 'two'])
        self.assertEqual(payload['files'], ['a.py', 'b.py'])
        self.assertEqual(payload['agentId'], 'agent-a')
        self.assertEqual(payload['project'], self.home.name)
        expected = {'results': [{'observation': {'id': 'mem_one', 'concepts': ['one'], 'files': ['a.py']}, 'score': 0.8}]}
        self.module._api = lambda *a, **k: expected
        self.assertEqual(json.loads(provider.handle_tool_call('memory_recall', {'query': 'remember'})), expected)

    def test_prefetch_expands_scoped_compact_hits_and_keeps_beyond_title_evidence(self):
        provider = self.provider()
        calls = []
        def request(base, path, body, **kwargs):
            calls.append(body)
            if 'query' in body:
                return {'results': [{'obsId': 'mem_long', 'sessionId': 'memory', 'title': 'truncated title'}]}
            return {'results': [{'observation': {'id': 'mem_long', 'title': 'truncated title', 'narrative': 'prefix ' * 40 + 'BEYOND_TITLE_EVIDENCE'}}]}
        self.module._api = request
        context = provider.prefetch('query')
        self.assertIn('BEYOND_TITLE_EVIDENCE', context)
        self.assertEqual(calls[1], {'expandIds': [{'obsId': 'mem_long', 'sessionId': 'memory'}], 'project': provider._project, 'agentId': provider._agent_id})
        self.assertEqual(calls[0]['agentId'], provider._agent_id)
        self.assertFalse(calls[0]['includeLessons'])
        self.module._api = lambda *a, **k: {'results': None}
        self.assertEqual(provider.prefetch('query'), '')
        self.module._api = lambda *a, **k: {'results': [{'obsId': 7}, None, {'title': 'unknown'}]}
        self.assertEqual(provider.prefetch('query'), '')
        self.module._api = lambda base, path, body, **k: {'results': [{'obsId': 'mem_missing'}]} if 'query' in body else {'success': False, 'errorCode': 'authentication'}
        self.assertEqual(provider.prefetch('query'), '')

    def test_prefetch_cache_is_scoped_one_shot_and_invalidated_by_writes(self):
        provider = self.provider()
        calls = []
        self.module._api = lambda *a, **k: calls.append(a) or {'results': [{'observation': {'title': 'known', 'narrative': 'details'}}]}
        provider.queue_prefetch('query')
        self.assertEqual(len(calls), 1)
        self.assertIn('details', provider.prefetch('query'))
        self.assertEqual(len(calls), 1)
        provider.prefetch('query')
        self.assertEqual(len(calls), 2)
        provider.queue_prefetch('query')
        provider.sync_turn('user', 'answer')
        count = len(calls)
        provider.prefetch('query')
        self.assertEqual(len(calls), count + 1)

    def test_invalid_tool_arguments_never_reach_network(self):
        provider = self.provider()
        before = len(self.calls)
        for name, args in [('memory_save', {}), ('memory_save', {'content': 'x', 'files': [2]}), ('memory_save', {'content': 'x', 'project': ''}), ('memory_recall', {'query': 'x', 'limit': True}), ('memory_recall', {'query': 'x', 'limit': 0}), ('memory_search', {'query': 'x', 'targetLayer': 'private'}), ('memory_save', [])]:
            self.assertFalse(json.loads(provider.handle_tool_call(name, args))['success'], (name, args))
        self.assertEqual(len(self.calls), before)

    def test_search_failure_does_not_become_empty_success(self):
        provider = self.provider()
        self.module._api = lambda *a, **k: {'success': False, 'errorCode': 'authentication', 'error': 'Check AGENTMEMORY_SECRET.'}
        for name in ['memory_recall', 'memory_search', 'memory_save']:
            result = json.loads(provider.handle_tool_call(name, {'query': 'query', 'content': 'content'}))
            self.assertEqual(result['errorCode'], 'authentication')
            self.assertNotIn('results', result)

    def test_switch_orders_end_start_turn_and_end_uses_new_session(self):
        provider = self.provider()
        provider.sync_turn('first', 'response')
        provider.on_session_switch('new-session', reset=True)
        provider.sync_turn('second', 'response', session_id='')
        provider.on_session_end([])
        provider.on_session_end([])
        self.assertEqual([(path, body['sessionId']) for _, path, body, _ in self.calls], [(path, provider._scoped_session_id(raw)) for path, raw in [('session/start', 'old-session'), ('observe', 'old-session'), ('session/end', 'old-session'), ('session/start', 'new-session'), ('observe', 'new-session'), ('session/end', 'new-session')]])

    def test_native_session_start_shape_is_tracked_and_closed(self):
        provider = self.provider()
        scoped_id = provider._scoped_session_id()
        self.assertEqual(provider._sessions, {scoped_id: 'old-session'})
        provider.on_session_end([])
        self.assertEqual(self.calls[-1][1:], ('session/end', {'sessionId': scoped_id}, {'secret': ''}))
        self.assertIn(scoped_id, provider._ended)
        for malformed in [{'success': True}, {'session': None}, {'session': {'id': 'foreign'}}]:
            self.module._api = lambda *a, **k: malformed
            another = self.module.AgentMemoryProvider()
            another.initialize('unconfirmed', cwd=str(self.home))
            self.assertEqual(another._sessions, {})

    def test_failed_end_remains_retryable_and_same_session_rewind_does_not_restart(self):
        provider = self.provider()
        provider.on_session_switch('old-session', rewound=True)
        self.assertEqual(len(self.calls), 1)
        original = self.module._api
        self.module._api = lambda *a, **k: {'success': False}
        provider.on_session_end([])
        self.assertNotIn(provider._scoped_session_id('old-session'), provider._ended)
        self.module._api = original
        provider.on_session_end([])
        self.assertIn(provider._scoped_session_id('old-session'), provider._ended)

    def test_precompress_returns_bounded_context_without_mutating_transcript(self):
        provider = self.provider()
        self.module._api = lambda *a, **k: {'results': [{'observation': {'title': 'title', 'narrative': 'c' * 10000}}]}
        messages = [{'role': 'user', 'content': 'original'}]
        self.assertEqual(provider.on_pre_compress(messages), '- title: ' + 'c' * 1000)
        self.assertEqual(messages, [{'role': 'user', 'content': 'original'}])
        self.module._api = lambda *a, **k: {'success': False}
        self.assertEqual(provider.on_pre_compress(messages), '')

    def test_native_replace_is_mirrored_and_remove_never_guesses_shared_record_ids(self):
        provider = self.provider()
        provider.on_memory_write('add', 'memory', 'old')
        provider.on_memory_write('replace', 'memory', 'new', {'previous_content': 'old'})
        provider.on_memory_write('remove', 'memory', 'new')
        self.assertEqual([body['content'] for _, path, body, _ in self.calls if path == 'remember'], ['old', 'new'])

    def test_sync_waits_for_wire_completion_and_shutdown_waits_for_inflight_write(self):
        provider = self.provider()
        entered, release, completed = threading.Event(), threading.Event(), threading.Event()
        def request(*args, **kwargs):
            entered.set()
            release.wait(2)
            completed.set()
            return {'success': True}
        self.module._api = request
        writer = threading.Thread(target=provider.sync_turn, args=('user', 'assistant'))
        writer.start()
        self.assertTrue(entered.wait(1))
        shutdown = threading.Thread(target=provider.shutdown)
        shutdown.start()
        time.sleep(0.02)
        self.assertTrue(shutdown.is_alive())
        release.set()
        writer.join(1)
        shutdown.join(1)
        self.assertTrue(completed.is_set())
        self.assertFalse(shutdown.is_alive())

    def test_shutdown_is_bounded_and_late_writes_are_rejected(self):
        provider = self.provider()
        self.module.TIMEOUT = 0.02
        entered, release = threading.Event(), threading.Event()
        def hold():
            with provider._write_lock:
                entered.set()
                release.wait(1)
        holder = threading.Thread(target=hold)
        holder.start()
        self.assertTrue(entered.wait(1))
        start = time.monotonic()
        provider.shutdown()
        self.assertLess(time.monotonic() - start, 0.3)
        release.set()
        holder.join(1)
        before = len(self.calls)
        provider.sync_turn('late', 'write')
        self.assertEqual(len(self.calls), before)

    def test_same_workspace_and_session_are_isolated_by_profile_and_survive_restart(self):
        module = self.load()
        calls = []
        module._api = lambda base, path, body, **kwargs: calls.append((path, body)) or ({'session': {'id': body['sessionId']}} if path == 'session/start' else {'success': True})
        identities = []
        sessions = []
        with self.scoped_runtime() as bound:
            for profile in ['a', 'b', 'a']:
                with bound(self.home / profile, {}):
                    provider = module.AgentMemoryProvider()
                    provider.initialize('same-session', cwd=str(self.home))
                    provider.sync_turn('shared input', 'captured answer')
                    provider.prefetch('shared input')
                    identities.append(provider._agent_id)
                    sessions.append(provider._scoped_session_id())
        self.assertEqual(identities[0], identities[2])
        self.assertNotEqual(identities[0], identities[1])
        self.assertEqual(sessions[0], sessions[2])
        self.assertNotEqual(sessions[0], sessions[1])
        self.assertTrue(all(body['project'] == self.home.name for _, body in calls))
        self.assertTrue(all(body['agentId'] in identities for _, body in calls))

    def test_concurrent_profiles_keep_endpoints_credentials_and_identity_bound(self):
        module = self.load()
        seen, errors = [], []
        barrier = threading.Barrier(2)
        def request(base, path, body, **kwargs):
            seen.append((base, path, body, kwargs['secret']))
            return {'session': {'id': body['sessionId']}} if path == 'session/start' else {'success': True}
        module._api = request
        with self.scoped_runtime() as bound:
            def work(profile):
                try:
                    with bound(self.home / profile, {'AGENTMEMORY_URL': f'https://{profile}.invalid', 'AGENTMEMORY_SECRET': f'{profile}-secret', 'AGENTMEMORY_PROJECT_NAME': 'shared-project'}):
                        provider = module.AgentMemoryProvider()
                        provider.initialize('same', cwd=str(self.home))
                        barrier.wait(2)
                        provider.sync_turn(profile, 'answer')
                        provider.handle_tool_call('memory_recall', {'query': 'query'})
                except BaseException as error:
                    errors.append(error)
            threads = [threading.Thread(target=work, args=(profile,)) for profile in ('a', 'b')]
            for thread in threads: thread.start()
            for thread in threads: thread.join(3)
        self.assertFalse(errors, errors)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(len(seen), 6)
        for profile in ('a', 'b'):
            own = [call for call in seen if call[0] == f'https://{profile}.invalid']
            self.assertEqual(len(own), 3)
            self.assertTrue(all(call[3] == f'{profile}-secret' for call in own))
            self.assertEqual(len({call[2]['agentId'] for call in own}), 1)
        self.assertEqual(len({call[2]['agentId'] for call in seen}), 2)

    def test_cross_profile_provider_and_cache_fail_closed_even_with_same_endpoint(self):
        module = self.load()
        calls = []
        module._api = lambda *args, **kwargs: calls.append(args) or {'success': True, 'results': [{'observation': {'title': 'private', 'narrative': 'profile-a-only'}}]}
        with self.scoped_runtime() as bound:
            with bound(self.home / 'a', {}):
                provider = module.AgentMemoryProvider()
                provider.initialize('same', cwd=str(self.home))
                provider.queue_prefetch('query')
            count = len(calls)
            with bound(self.home / 'b', {}):
                self.assertEqual(provider.prefetch('query'), '')
                result = json.loads(provider.handle_tool_call('memory_save', {'content': 'must not cross profiles'}))
                self.assertEqual(result['errorCode'], 'configuration_changed')
            self.assertEqual(len(calls), count)
            result = json.loads(provider.handle_tool_call('memory_recall', {'query': 'unbound'}))
            self.assertEqual(result['errorCode'], 'configuration_changed')
            self.assertEqual(len(calls), count)

    def test_cache_refuses_endpoint_or_identity_changes(self):
        provider = self.provider()
        self.module._api = lambda *a, **k: {'results': [{'observation': {'title': 'private', 'narrative': 'cached'}}]}
        provider.queue_prefetch('query')
        os.environ['AGENTMEMORY_URL'] = 'https://elsewhere.invalid'
        self.assertEqual(provider.prefetch('query'), '')
        del os.environ['AGENTMEMORY_URL']
        provider.queue_prefetch('query')
        os.environ['AGENTMEMORY_AGENT_ID'] = 'other-agent'
        self.assertEqual(provider.prefetch('query'), '')

    def test_gateway_authors_are_context_local_and_delayed_writes_keep_their_author(self):
        provider = self.provider(platform='telegram', user_id='initial-user')
        calls = []
        self.module._api = lambda base, path, body, **k: calls.append((path, body)) or ({'session': {'id': body['sessionId']}} if path == 'session/start' else {'success': True})
        provider.on_turn_start(1, 'alice turn', author_id='alice')
        alice = provider._agent_id
        queued_alice = copy_context()
        provider.on_turn_start(2, 'bob turn', author_id='bob')
        bob = provider._agent_id
        provider.sync_turn('bob', 'answer', turn_author={'id': 'bob'})
        queued_alice.run(provider.sync_turn, 'alice', 'answer', turn_author={'id': 'alice'})
        provider.prefetch('bob query')
        queued_alice.run(provider.prefetch, 'alice query')
        self.assertNotEqual(alice, bob)
        captured = [body for path, body in calls if path == 'observe']
        self.assertEqual([body['agentId'] for body in captured], [bob, alice])
        self.assertNotEqual(captured[0]['sessionId'], captured[1]['sessionId'])
        self.assertEqual([body['agentId'] for path, body in calls if path == 'smart-search'], [bob, alice])
        provider.on_turn_start(3, 'unknown', author_id='')
        count = len(calls)
        provider.sync_turn('unknown', 'answer')
        self.assertEqual(provider.prefetch('unknown'), '')
        self.assertEqual(len(calls), count)

    def test_gateway_missing_author_never_reuses_primary_identity(self):
        provider = self.provider(platform='telegram')
        self.assertEqual(self.calls, [])
        provider.sync_turn('unknown', 'answer')
        provider.handle_tool_call('memory_save', {'content': 'unknown'})
        self.assertEqual(self.calls, [])
        provider.on_turn_start(1, 'known', author_id='alice')
        provider.sync_turn('known', 'answer')
        self.assertEqual([path for _, path, _, _ in self.calls], ['session/start', 'observe'])

    def test_nonprimary_contexts_do_not_capture_or_modify_remote_state(self):
        for context in ['subagent', 'cron', 'flush']:
            provider = self.provider(agent_context=context)
            provider.sync_turn('derived', 'response')
            provider.on_memory_write('add', 'memory', 'derived')
            result = json.loads(provider.handle_tool_call('memory_save', {'content': 'derived'}))
            provider.on_session_switch('next')
            provider.on_session_end([])
            self.assertEqual(result['errorCode'], 'read_only_context')
            self.assertEqual(self.calls, [])

    def test_static_prompt_never_reads_cross_profile_project_context(self):
        provider = self.provider()
        count = len(self.calls)
        self.assertIn('memory_recall', provider.system_prompt_block())
        self.assertEqual(len(self.calls), count)

    def test_empty_session_ids_are_rejected_and_empty_switch_preserves_binding(self):
        module = self.load()
        for session_id in ['', '   ', None, 0]:
            with self.assertRaises(ValueError):
                module.AgentMemoryProvider().initialize(session_id)
        provider = self.provider()
        before = list(self.calls)
        for session_id in ['', '   ', None, 0]:
            provider.on_session_switch(session_id)
        self.assertEqual(self.calls, before)
        provider.sync_turn('user', 'answer', session_id='')
        self.assertEqual(self.calls[-1][2]['sessionId'], provider._scoped_session_id('old-session'))

    def test_explicit_identity_is_deliberate_and_tool_overrides_are_validated(self):
        os.environ['AGENTMEMORY_AGENT_ID'] = 'team-shared'
        provider = self.provider()
        self.assertEqual(provider._agent_id, 'team-shared')
        for tool, args in [('memory_save', {'content': 'shared', 'agentId': 'selected'}), ('memory_recall', {'query': 'shared', 'agentId': 'selected'})]:
            provider.handle_tool_call(tool, args)
            self.assertEqual(self.calls[-1][2]['agentId'], 'selected')
        count = len(self.calls)
        for value in ['', '*', 'a' * 129]:
            self.assertFalse(json.loads(provider.handle_tool_call('memory_recall', {'query': 'query', 'agentId': value}))['success'])
        self.assertEqual(len(self.calls), count)
        os.environ['AGENTMEMORY_AGENT_ID'] = '*'
        with self.assertRaises(ValueError):
            self.module.AgentMemoryProvider().initialize('invalid')

    def test_native_scoped_credentials_rotate_without_reading_process_values(self):
        module = self.load()
        os.environ['AGENTMEMORY_SECRET'] = 'must-not-be-used'
        calls = []
        module._api = lambda *a, **k: calls.append(k['secret']) or {'success': True}
        secrets = {'AGENTMEMORY_SECRET': 'first'}
        with self.scoped_runtime() as bound:
            with bound(self.home / 'a', secrets):
                provider = module.AgentMemoryProvider()
                provider.initialize('session', cwd=str(self.home))
                secrets['AGENTMEMORY_SECRET'] = 'rotated'
                provider.handle_tool_call('memory_save', {'content': 'test'})
                secrets.pop('AGENTMEMORY_SECRET')
                provider.handle_tool_call('memory_save', {'content': 'test'})
        self.assertEqual(calls, ['first', 'rotated', ''])

    def test_host_workspace_and_explicit_project_determine_scope(self):
        provider = self.provider()
        self.assertEqual(provider._project, self.home.name)
        runtime = types.ModuleType('agent.runtime_cwd')
        workspace = self.home / 'desktop-workspace'
        workspace.mkdir()
        runtime.scope_terminal_cwd = lambda: str(workspace)
        with patch.dict(sys.modules, {'agent.runtime_cwd': runtime}):
            provider.initialize('desktop', platform='desktop')
            self.assertEqual(provider._project, 'desktop-workspace')
        os.environ['AGENTMEMORY_PROJECT_NAME'] = 'explicit-project'
        provider.initialize('named', cwd=str(workspace))
        self.assertEqual(provider._project, 'explicit-project')


if __name__ == '__main__':
    unittest.main()
