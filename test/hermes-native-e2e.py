"""Run actual Hermes CLI/provider contracts against an installed AgentMemory package."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def api(base, path, body=None):
    headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ['AGENTMEMORY_SECRET']}
    request = urllib.request.Request(base + '/agentmemory/' + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def probe(out):
    from plugins.memory import load_memory_provider
    from agent.memory_manager import MemoryManager
    from tools.skills_tool import skills_list, skill_view
    from tools.memory_tool import MemoryStore, memory_tool
    base = os.environ['AGENTMEMORY_URL']
    provider = load_memory_provider('agentmemory')
    assert provider is not None
    manager = MemoryManager()
    manager.add_provider(provider)
    manager.initialize_all('native-old', cwd=os.getcwd(), platform='cli', agent_context='primary')
    result = json.loads(manager.handle_tool_call('memory_save', {'content': 'NATIVE_METADATA_LYNX keeps exact build evidence.', 'concepts': 'native,metadata', 'files': 'src/example.ts', 'agentId': 'test-agent'}))
    assert result.get('success'), result
    saved = result['memory']
    assert saved['concepts'] == ['native', 'metadata'] and saved['files'] == ['src/example.ts'], saved
    assert saved['project'] == 'hermes-native-e2e' and saved['agentId'] == 'test-agent', saved
    recalled = json.loads(manager.handle_tool_call('memory_recall', {'query': 'NATIVE_METADATA_LYNX', 'agentId': 'test-agent'}))
    assert saved['id'] in json.dumps(recalled), recalled
    old_native = 'NATIVE_OLD_WOMBAT says use the abandoned orange deployment protocol.'
    native_store = MemoryStore()
    native_store.load_from_disk()
    add_args = {'action': 'add', 'target': 'memory', 'content': old_native}
    add_result = memory_tool(**add_args, store=native_store)
    assert json.loads(add_result).get('success'), add_result
    manager.notify_memory_tool_write(add_result, add_args)
    replace_args = {'action': 'replace', 'target': 'memory', 'old_text': 'NATIVE_OLD_WOMBAT', 'content': 'NATIVE_REPLACEMENT_OTTER uses corrected storage semantics.'}
    replace_result = memory_tool(**replace_args, store=native_store)
    assert json.loads(replace_result).get('success'), replace_result
    manager.notify_memory_tool_write(replace_result, replace_args)
    has_previous_entry = isinstance(json.loads(replace_result).get('replaced_entry'), str)
    old_recalled = 'NATIVE_OLD_WOMBAT' in json.dumps(api(base, 'smart-search', {'query': 'NATIVE_OLD_WOMBAT', 'project': 'hermes-native-e2e'}))
    if has_previous_entry:
        assert not old_recalled, 'Native replacement left the old active record searchable.'
    else:
        assert old_recalled, 'Legacy notification should not guess the identity of the previous record.'
    assert 'NATIVE_REPLACEMENT_OTTER' in json.dumps(api(base, 'smart-search', {'query': 'NATIVE_REPLACEMENT_OTTER', 'project': 'hermes-native-e2e'}))
    manager.sync_all('OLD_SESSION_KOALA', 'old conversation evidence', session_id='native-old')
    assert manager.flush_pending(timeout=10)
    manager.on_session_switch('native-new', parent_session_id='native-old', reset=True)
    manager.sync_all('NEW_SESSION_KOALA', 'new conversation evidence', session_id='native-new')
    assert manager.flush_pending(timeout=10)
    messages = [{'role': 'user', 'content': 'unchanged original'}]
    contribution = manager.on_pre_compress(messages)
    assert isinstance(contribution, str) and messages == [{'role': 'user', 'content': 'unchanged original'}]
    manager.on_session_end([])
    manager.shutdown_all()
    sessions = {item['id']: item for item in api(base, 'sessions')['sessions']}
    assert provider._session_id == 'native-new'
    for raw_id in ['native-old', 'native-new']:
        session_id = provider._scoped_session_id(raw_id)
        assert sessions[session_id]['status'] == 'completed', sessions[session_id]
        assert sessions[session_id]['observationCount'] >= 1, sessions[session_id]
    from agent.secret_scope import set_multiplex_active, set_secret_scope, reset_secret_scope
    module = sys.modules[type(provider).__module__]
    set_multiplex_active(True)
    try:
        token = set_secret_scope({'AGENTMEMORY_URL': 'https://profile.example.invalid', 'AGENTMEMORY_SECRET': 'synthetic-profile-only'})
        try:
            assert module._configuration() == ('https://profile.example.invalid', 'synthetic-profile-only')
        finally:
            reset_secret_scope(token)
        assert not type(provider)().is_available()
        token = set_secret_scope({})
        try:
            assert module._configuration() == (module.DEFAULT_BASE_URL, '')
        finally:
            reset_secret_scope(token)
    finally:
        set_multiplex_active(False)
    correct_secret = os.environ['AGENTMEMORY_SECRET']
    denied = type(provider)()
    denied.initialize('auth-failure', cwd=os.getcwd())
    try:
        for bad_secret in ['synthetic-wrong-secret', None]:
            if bad_secret is None:
                os.environ.pop('AGENTMEMORY_SECRET', None)
            else:
                os.environ['AGENTMEMORY_SECRET'] = bad_secret
            for name, arguments in [('memory_search', {'query': 'NATIVE_METADATA_LYNX'}), ('memory_save', {'content': 'MUST_NOT_SAVE_BAD_AUTH'})]:
                result = json.loads(denied.handle_tool_call(name, arguments))
                assert result.get('errorCode') == 'authentication' and result.get('success') is False, result
        os.environ['AGENTMEMORY_SECRET'] = correct_secret
        recovered = json.loads(denied.handle_tool_call('memory_recall', {'query': 'NATIVE_METADATA_LYNX'}))
        assert saved['id'] in json.dumps(recovered), recovered
        os.environ['AGENTMEMORY_URL'] = 'https://changed-endpoint.example.invalid'
        rebound = json.loads(denied.handle_tool_call('memory_save', {'content': 'MUST_NOT_SAVE_REBOUND'}))
        assert rebound.get('errorCode') == 'configuration_changed' and rebound.get('success') is False, rebound
    finally:
        os.environ['AGENTMEMORY_SECRET'] = correct_secret
        os.environ['AGENTMEMORY_URL'] = base
        denied.shutdown()
    assert 'MUST_NOT_SAVE_BAD_AUTH' not in json.dumps(api(base, 'smart-search', {'query': 'MUST_NOT_SAVE_BAD_AUTH', 'project': 'hermes-native-e2e'}))
    previous_agent = os.environ.pop('AGENTMEMORY_AGENT_ID', None)
    gateway = type(provider)()
    try:
        gateway.initialize('shared-gateway-room', cwd=os.getcwd(), platform='telegram')
        missing_author = json.loads(gateway.handle_tool_call('memory_save', {'content': 'MUST_NOT_SAVE_ANONYMOUS'}))
        assert missing_author.get('success') is False, missing_author
        for author, fact in [('alice', 'GATEWAY_ALICE_CEDAR'), ('bob', 'GATEWAY_BOB_MAPLE')]:
            gateway.sync_turn('NATIVE_GATEWAY_ORCHID ' + fact, 'Acknowledged ' + fact, turn_author={'id': author})
        author_ids = []
        for author, own, foreign in [('alice', 'GATEWAY_ALICE_CEDAR', 'GATEWAY_BOB_MAPLE'), ('bob', 'GATEWAY_BOB_MAPLE', 'GATEWAY_ALICE_CEDAR')]:
            gateway.on_turn_start(1, 'NATIVE_GATEWAY_ORCHID', author_id=author)
            recalled = gateway.prefetch('NATIVE_GATEWAY_ORCHID')
            assert own in recalled and foreign not in recalled, recalled
            author_ids.append(gateway._agent_id)
        assert author_ids[0] != author_ids[1]
        gateway.on_session_end([])
        gateway.shutdown()
    finally:
        if previous_agent is not None:
            os.environ['AGENTMEMORY_AGENT_ID'] = previous_agent
    inventory = json.loads(skills_list())
    skill = json.loads(skill_view('remember'))
    assert 'remember' in json.dumps(inventory) and 'memory_save' in json.dumps(skill), (inventory, skill)
    summary = {'native_metadata': True, 'recall_identity': True, 'replacement_content_mirrored': True, 'native_previous_content_available': has_previous_entry, 'old_record_superseded': not old_recalled, 'session_switch_completed': True, 'compression_transcript_unchanged': True, 'auth_errors_visible': True, 'scoped_credentials_fail_closed': True, 'missing_credentials_rejected': True, 'credential_recovery_same_provider': True, 'endpoint_change_requires_restart': True, 'gateway_authors_isolated': True, 'skills_discovered': True, 'saved_id': saved['id']}
    (out / 'native-summary.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary))


def port_free(port):
    sock = socket.socket()
    try:
        sock.bind(('127.0.0.1', port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def port_listening(port):
    sock = socket.socket()
    sock.settimeout(0.3)
    try:
        return sock.connect_ex(('127.0.0.1', port)) == 0
    finally:
        sock.close()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    home = out / 'home'
    if home.exists():
        raise RuntimeError('Use a fresh --out directory; existing test state is preserved.')
    hh = home / '.hermes'
    hh.mkdir(parents=True)
    package = args.package.resolve()
    cli = package / 'dist/cli.mjs'
    provider_file = package / 'integrations/hermes/__init__.py'
    engine = home / '.agentmemory/bin/iii'
    engine.parent.mkdir(parents=True)
    shutil.copy2(args.engine, engine)
    engine.chmod(0o755)
    ports = []
    for _ in range(200):
        port = random.randint(12000, 18500)
        ports = [port, port + 1, port + 2, port + 3, port + 6353, port + 46023]
        if all(port_free(item) for item in ports):
            break
    else:
        raise RuntimeError('No free daemon port block.')
    base = f'http://127.0.0.1:{port}'
    env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'HERMES_HOME': str(hh), 'XDG_CONFIG_HOME': str(home / '.config'), 'AGENTMEMORY_URL': base, 'AGENTMEMORY_PROJECT_NAME': 'hermes-native-e2e', 'AGENTMEMORY_AGENT_ID': 'test-agent', 'AGENTMEMORY_AUTO_COMPRESS': 'false', 'III_TELEMETRY_ENABLED': 'false', 'NO_COLOR': '1', 'DO_NOT_TRACK': '1', 'CI': 'true', 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONPATH': os.pathsep.join([str(args.host.resolve()), *[str(item.resolve()) for item in args.python_path]])}
    requests = []
    mode = {'mcp': False, 'bad_auth': False, 'offline': False, 'stop_on_save': False}
    class Model(BaseHTTPRequestHandler):
        def log_message(self, *unused): pass
        def do_GET(self):
            self.send_json({'object': 'list', 'data': [{'id': 'fixture', 'object': 'model', 'owned_by': 'local'}]})
        def send_json(self, body):
            content = json.dumps(body).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            label = 'mcp-auth-failure' if mode['bad_auth'] else ('mcp-offline' if mode['offline'] else ('mcp' if mode['mcp'] else 'native'))
            requests.append({'mode': label, 'body': body})
            count = sum(message.get('role') == 'tool' for message in body.get('messages', []))
            schemas = {item.get('function', {}).get('name'): item.get('function', {}).get('parameters', {}).get('properties', {}) for item in body.get('tools', [])}
            batch_tools = 'names' in schemas.get('tool_describe', {})
            mcp_unavailable = mode['bad_auth'] and 'tool_describe' not in schemas
            done = count >= ((3 if batch_tools else 4) if mode['mcp'] and not mcp_unavailable else 1)
            name = 'memory_save'
            arguments = {'content': 'CLI_NATIVE_TULIP preserves native metadata after restart.', 'concepts': 'native,cli', 'files': 'src/cli.ts', 'project': 'hermes-native-e2e'}
            if mcp_unavailable:
                arguments['content'] = 'CLI_AUTH_REJECTED_BADGER must not be saved with rejected credentials.'
            if mode['mcp'] and not mcp_unavailable:
                describe_count = 1 if batch_tools else 2
                if count < describe_count:
                    if batch_tools:
                        name, arguments = 'tool_describe', {'names': ['mcp__agentmemory__memory_save', 'mcp__agentmemory__memory_recall']}
                    else:
                        name, arguments = 'tool_describe', {'name': 'mcp__agentmemory__memory_save' if count == 0 else 'mcp__agentmemory__memory_recall'}
                else:
                    if mode['stop_on_save']:
                        mode['stop_on_save'] = False
                        stop()
                    mcp_marker = 'CLI_AUTH_REJECTED_BADGER' if mode['bad_auth'] else ('CLI_OFFLINE_BADGER' if mode['offline'] else 'CLI_MCP_TULIP')
                    call = {'name': 'mcp__agentmemory__memory_save', 'arguments': {**arguments, 'content': mcp_marker + ' preserves deferred tool metadata.'}} if count == describe_count else {'name': 'mcp__agentmemory__memory_recall', 'arguments': {'query': mcp_marker, 'project': 'hermes-native-e2e'}}
                    name, arguments = 'tool_call', {'calls': [call]} if batch_tools else call
            message = {'role': 'assistant', 'content': 'Native integration verification complete.'} if done else {'role': 'assistant', 'content': None, 'tool_calls': [{'id': f'call_fixture_{count}', 'type': 'function', 'function': {'name': name, 'arguments': json.dumps(arguments)}}]}
            response = {'id': 'chatcmpl-fixture', 'object': 'chat.completion', 'created': int(time.time()), 'model': 'fixture', 'choices': [{'index': 0, 'message': message, 'finish_reason': 'stop' if done else 'tool_calls'}], 'usage': {'prompt_tokens': 10, 'completion_tokens': 10, 'total_tokens': 20}}
            if not body.get('stream'):
                self.send_json(response)
                return
            delta = dict(message)
            if 'tool_calls' in delta:
                delta['tool_calls'] = [dict(item, index=index) for index, item in enumerate(delta['tool_calls'])]
            chunk = {**response, 'object': 'chat.completion.chunk', 'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]}
            final = {**response, 'object': 'chat.completion.chunk', 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop' if done else 'tool_calls'}]}
            content = ('data: ' + json.dumps(chunk) + '\n\ndata: ' + json.dumps(final) + '\n\ndata: [DONE]\n\n').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
    model = ThreadingHTTPServer(('127.0.0.1', 0), Model)
    threading.Thread(target=model.serve_forever, daemon=True).start()
    config = f'''model:
  default: fixture
  provider: custom
  base_url: http://127.0.0.1:{model.server_port}/v1
  api_key: synthetic-local-only
  api_mode: chat_completions
security:
  allow_lazy_installs: false
agent:
  max_turns: 6
  reasoning_effort: none
display:
  tool_progress: false
'''
    (hh / 'config.yaml').write_text(config)
    summary = {'host': str(args.host.resolve()), 'package': str(package), 'cli_sha256_before': digest(cli), 'provider_sha256_before': digest(provider_file)}
    backend = None
    log = (out / 'backend.log').open('w')
    def start():
        nonlocal backend
        backend = subprocess.Popen([args.node, str(cli), '--port', str(port), '--data-dir', str(out / 'state')], cwd=out, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        for _ in range(180):
            exit_code = backend.poll()
            if exit_code not in (None, 0):
                raise RuntimeError(f'Backend exited with code {exit_code}; inspect backend.log.')
            try:
                with urllib.request.urlopen(base + '/agentmemory/livez', timeout=1) as response:
                    if isinstance(json.load(response).get('viewerPort'), int):
                        env['AGENTMEMORY_SECRET'] = (home / '.agentmemory/secret').read_text().strip()
                        return
            except Exception:
                time.sleep(0.5)
        raise RuntimeError('Backend readiness timed out.')
    def stop():
        if backend is None:
            return
        subprocess.run([args.node, str(cli), 'stop', '--port', str(port)], cwd=out, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=20)
        try:
            backend.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(backend.pid, signal.SIGTERM)
            backend.wait(timeout=10)
    def host_run(command, name, timeout=90):
        result = subprocess.run([str(args.python), *command], cwd=out, env=env, text=True, capture_output=True, timeout=timeout)
        (out / f'{name}.log').write_text(result.stdout + result.stderr)
        assert result.returncode == 0, f'{name} exited {result.returncode}; inspect its log.'
    def local_api(path, body=None):
        with patch_environment(env):
            return api(base, path, body)
    try:
        start()
        connector = subprocess.run([args.node, str(cli), 'connect', 'hermes', '--no-guidelines'], cwd=out, env=env, text=True, capture_output=True, timeout=30)
        (out / 'connect.log').write_text(connector.stdout + connector.stderr)
        assert connector.returncode == 0, 'Packaged Hermes connector failed.'
        assert digest(hh / 'plugins/agentmemory/__init__.py') == digest(provider_file)
        assert (hh / 'skills/agentmemory/remember/SKILL.md').is_file()
        summary['packaged_connector_installed'] = True
        local_api('remember', {'content': 'PREFETCH_HERON ' + 'long evidence prefix ' * 16 + 'requires exact turquoise readiness evidence.', 'project': 'hermes-native-e2e', 'agentId': 'test-agent'})
        host_run([str(Path(__file__).resolve()), '--probe', str(out)], 'native-probe')
        assert 'mcp_servers:' not in (hh / 'config.yaml').read_text()
        for mcp in [False, True]:
            mode['mcp'] = mcp
            if mcp:
                connected = subprocess.run([args.node, str(cli), 'connect', 'hermes', '--no-guidelines', '--with-mcp'], cwd=out, env=env, text=True, capture_output=True, timeout=30)
                (out / 'connect-mcp.log').write_text(connected.stdout + connected.stderr)
                assert connected.returncode == 0 and 'mcp_servers:' in (hh / 'config.yaml').read_text()

            command = ['-m', 'hermes_cli.main', 'chat', '-q', 'Recall PREFETCH_HERON and save the requested fixture.', '-Q', '--toolsets', 'memory,skills,agentmemory' if mcp else 'memory', '--max-turns', '6']
            if mcp:
                command += ['--skills', 'remember']
            before_sessions = {item['id'] for item in local_api('sessions')['sessions']}
            host_run(command, 'mcp-cli' if mcp else 'native-cli')
            cli_sessions = [item for item in local_api('sessions')['sessions'] if item['id'] not in before_sessions]
            assert cli_sessions and all(item['status'] == 'completed' and item['observationCount'] >= 1 for item in cli_sessions), cli_sessions
            summary['mcp_cli_sessions' if mcp else 'native_cli_sessions'] = cli_sessions
        for marker in ['CLI_NATIVE_TULIP', 'CLI_MCP_TULIP']:
            assert marker in json.dumps(local_api('smart-search', {'query': marker, 'project': 'hermes-native-e2e'})), marker
        mode['bad_auth'] = True
        correct_secret = env['AGENTMEMORY_SECRET']
        env['AGENTMEMORY_SECRET'] = 'synthetic-rejected-secret'
        try:
            host_run(['-m', 'hermes_cli.main', 'chat', '-q', 'Verify rejected memory authentication.', '-Q', '--toolsets', 'memory,skills,agentmemory', '--max-turns', '6'], 'mcp-auth-failure-cli')
        finally:
            env['AGENTMEMORY_SECRET'] = correct_secret
            mode['bad_auth'] = False
        auth_results = '\n'.join(str(message.get('content', '')) for row in requests if row['mode'] == 'mcp-auth-failure' for message in row['body'].get('messages', []) if message.get('role') == 'tool').lower()
        auth_diagnostics = auth_results + (out / 'mcp-auth-failure-cli.log').read_text().lower()
        assert any(word in auth_diagnostics for word in ['401', 'unauthorized', 'authentication']), auth_diagnostics
        assert '"saved"' not in auth_results.replace('\\', ''), auth_results
        auth_model_calls = [row['body'] for row in requests if row['mode'] == 'mcp-auth-failure' and 'messages' in row['body']]
        assert auth_model_calls and all(not any(tool.get('function', {}).get('name') in ('tool_describe', 'tool_call') for tool in body.get('tools', [])) for body in auth_model_calls), 'Rejected MCP inventory exposed deferred tools.'
        assert 'CLI_AUTH_REJECTED_BADGER' not in json.dumps(local_api('smart-search', {'query': 'CLI_AUTH_REJECTED_BADGER', 'project': 'hermes-native-e2e'}))
        summary['mcp_authentication_failure_disables_inventory'] = True
        mode['offline'] = True
        mode['stop_on_save'] = True
        try:
            host_run(['-m', 'hermes_cli.main', 'chat', '-q', 'Verify memory endpoint interruption.', '-Q', '--toolsets', 'memory,skills,agentmemory', '--max-turns', '6'], 'mcp-offline-cli')
            assert not mode['stop_on_save'], 'Offline scenario never reached a discovered MCP save call.'
        finally:
            mode['offline'] = False
            mode['stop_on_save'] = False
        offline_results = '\n'.join(str(message.get('content', '')) for row in requests if row['mode'] == 'mcp-offline' for message in row['body'].get('messages', []) if message.get('role') == 'tool').lower()
        assert any(word in offline_results for word in ['error', 'failed', 'unavailable']), offline_results
        assert '"saved"' not in offline_results.replace('\\', ''), offline_results
        start()
        assert 'CLI_OFFLINE_BADGER' not in json.dumps(local_api('smart-search', {'query': 'CLI_OFFLINE_BADGER', 'project': 'hermes-native-e2e'}))
        summary['forced_proxy_offline_does_not_save_locally'] = True
        summary['native_cli'] = True
        summary['mcp_cli'] = True
        summary['prefetch_reached_model'] = any('exact turquoise readiness' in json.dumps(item['body'].get('messages', [])) for item in requests)
        assert summary['prefetch_reached_model']
        assert any('memory_save' in json.dumps(item['body'].get('messages', [])) and item['mode'] == 'mcp' for item in requests)
        stop()
        start()
        assert 'CLI_NATIVE_TULIP' in json.dumps(local_api('smart-search', {'query': 'CLI_NATIVE_TULIP', 'project': 'hermes-native-e2e'}))
        summary['restart_persistence'] = True
        summary.update(json.loads((out / 'native-summary.json').read_text()))
    finally:
        try:
            stop()
        finally:
            if backend and backend.poll() is None:
                os.killpg(backend.pid, signal.SIGKILL)
                backend.wait(timeout=10)
            engine_pid_path = home / '.agentmemory/iii.pid'
            if engine_pid_path.exists():
                try:
                    engine_pid = int(engine_pid_path.read_text())
                    command = subprocess.check_output(['ps', '-p', str(engine_pid), '-o', 'command='], text=True)
                    if str(engine) in command:
                        os.kill(engine_pid, signal.SIGTERM)
                except (OSError, ValueError, subprocess.CalledProcessError):
                    pass
            model.shutdown()
            model.server_close()
            log.close()
            (out / 'model-wire.json').write_text(json.dumps(requests, indent=2))
            summary['cli_sha256_after'] = digest(cli)
            summary['provider_sha256_after'] = digest(provider_file)
            summary['all_ports_closed'] = not any(port_listening(item) for item in [*ports, model.server_port])
            (out / 'summary.json').write_text(json.dumps(summary, indent=2))
    assert summary['cli_sha256_before'] == summary['cli_sha256_after']
    assert summary['provider_sha256_before'] == summary['provider_sha256_after']
    assert summary['all_ports_closed'], ports
    print(json.dumps(summary, indent=2))


class patch_environment:
    def __init__(self, env): self.env = env
    def __enter__(self):
        self.previous = dict(os.environ)
        os.environ.clear()
        os.environ.update(self.env)
    def __exit__(self, *args):
        os.environ.clear()
        os.environ.update(self.previous)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--probe':
        probe(Path(sys.argv[2]))
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--package', type=Path, required=True, help='Installed @agentmemory/agentmemory package directory')
        parser.add_argument('--host', type=Path, required=True, help='Actual Hermes source directory')
        parser.add_argument('--python', type=Path, required=True, help='Hermes Python environment executable')
        parser.add_argument('--python-path', type=Path, action='append', default=[], help='Optional isolated dependency target')
        parser.add_argument('--engine', type=Path, required=True, help='Pinned iii executable')
        parser.add_argument('--node', default=shutil.which('node'))
        parser.add_argument('--out', type=Path, required=True, help='Fresh isolated evidence directory')
        run(parser.parse_args())
