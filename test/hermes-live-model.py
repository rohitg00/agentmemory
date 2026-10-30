"""Opt-in real Codex model test of a packaged Hermes provider in isolated homes."""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import random
import runpy
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
import urllib.request
import uuid


def private_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump(value, handle, indent=2)


def remove_token_copies(root, token):
    for file in root.rglob('*'):
        if file.is_file() and not file.is_symlink() and token.encode() in file.read_bytes():
            file.unlink()


def child(wire, cli_args):
    import httpx
    original_send = httpx.Client.send
    calls = 0

    def send(client, request, *args, **kwargs):
        nonlocal calls
        if request.url.host == 'auth.openai.com':
            raise RuntimeError('Credential refresh is disabled for this isolated live test.')
        if request.url.host == 'chatgpt.com' and request.url.path.endswith('/responses'):
            calls += 1
            if calls > 4:
                raise RuntimeError('Live test exceeded its four-request per-session budget.')
            payload = json.loads(request.content)
            with wire.open('a') as handle:
                handle.write(json.dumps({'method': request.method, 'host': request.url.host, 'path': request.url.path, 'body': payload}) + '\n')
        return original_send(client, request, *args, **kwargs)

    httpx.Client.send = send
    sys.argv = ['hermes', *cli_args]
    runpy.run_module('hermes_cli.main', run_name='__main__')


def main(args):
    sys.dont_write_bytecode = True
    def interrupted(signum, frame):
        raise RuntimeError(f'Live test interrupted by signal {signum}.')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGHUP, interrupted)
    spec = importlib.util.spec_from_file_location('native_gate', Path(__file__).with_name('hermes-native-e2e.py'))
    native = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(native)
    out = args.out.resolve()
    if out.exists():
        raise RuntimeError('Use a fresh output directory; existing evidence is preserved.')
    original_auth_hash = native.digest(args.codex_auth)
    auth = json.loads(args.codex_auth.read_text())
    access_token = auth.get('tokens', {}).get('access_token')
    if not isinstance(access_token, str) or not access_token:
        raise RuntimeError('The approved Codex store has no access token.')
    token_part = access_token.split('.')[1]
    expiry = json.loads(base64.urlsafe_b64decode(token_part + '=' * (-len(token_part) % 4))).get('exp', 0)
    if expiry < time.time() + 900:
        raise RuntimeError('Existing access token expires too soon; no refresh will be attempted.')
    del auth
    package = args.package.resolve()
    cli = package / 'dist/cli.mjs'
    provider = package / 'integrations/hermes/__init__.py'
    cli_hash = native.digest(cli)
    provider_hash = native.digest(provider)
    with args.engine.open('rb') as engine_source:
        engine_source.read(1)
    daemon_home = out / 'daemon-home'
    engine = daemon_home / '.agentmemory/bin/iii'
    for _ in range(200):
        port = random.randint(12000, 18500)
        ports = [port, port + 1, port + 2, port + 3, port + 6353, port + 46023]
        if all(native.port_free(item) for item in ports):
            break
    else:
        raise RuntimeError('No free daemon port block.')
    base = f'http://127.0.0.1:{port}'
    project = 'hermes-live-' + uuid.uuid4().hex[:8]
    topic = 'Orchid calibration ' + uuid.uuid4().hex[:8]
    automatic = f'violet river {random.randint(1000, 9999)} copper fox'
    durable = f'silver meadow {random.randint(1000, 9999)} amber owl'
    decoy = f'foreign canyon {random.randint(1000, 9999)} scarlet ibis'
    daemon_env = {'PATH': os.environ['PATH'], 'HOME': str(daemon_home), 'XDG_CONFIG_HOME': str(daemon_home / '.config'), 'AGENTMEMORY_URL': base, 'AGENTMEMORY_AUTO_COMPRESS': 'false', 'III_TELEMETRY_ENABLED': 'false', 'DO_NOT_TRACK': '1', 'NO_COLOR': '1', 'CI': 'true'}
    summary = {'model': args.model, 'provider': 'openai-codex', 'host': str(args.host.resolve()), 'package': str(package), 'project': project, 'cli_sha256_before': cli_hash, 'provider_sha256_before': provider_hash, 'sessions': {}}
    out.mkdir(parents=True, mode=0o700)
    engine.parent.mkdir(parents=True)
    shutil.copy2(args.engine, engine)
    engine.chmod(0o755)
    private_json(out / 'synthetic-facts.json', {'topic': topic, 'automatic': automatic, 'durable': durable, 'decoy': decoy})
    backend = None
    log = (out / 'backend.log').open('w')
    secret = ''

    def api(path, body=None):
        request = urllib.request.Request(base + '/agentmemory/' + path, data=None if body is None else json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    def start():
        nonlocal backend, secret
        backend = subprocess.Popen([args.node, str(cli), '--port', str(port), '--data-dir', str(out / 'state')], cwd=out, env=daemon_env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        for _ in range(180):
            if backend.poll() is not None:
                raise RuntimeError('Packaged daemon exited; inspect backend.log.')
            try:
                with urllib.request.urlopen(base + '/agentmemory/livez', timeout=1) as response:
                    if isinstance(json.load(response).get('viewerPort'), int):
                        secret = (daemon_home / '.agentmemory/secret').read_text().strip()
                        return
            except Exception:
                time.sleep(0.5)
        raise RuntimeError('Daemon readiness timed out.')

    def stop():
        if backend is None or backend.poll() is not None:
            return
        subprocess.run([args.node, str(cli), 'stop', '--port', str(port)], cwd=out, env=daemon_env, stdout=log, stderr=subprocess.STDOUT, timeout=20)
        try:
            backend.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(backend.pid, signal.SIGTERM)
            backend.wait(timeout=10)

    def expanded(query, scope=project, layer='all'):
        found = api('smart-search', {'query': query, 'project': scope, 'targetLayer': layer, 'limit': 20})
        references = [{'obsId': row['obsId'], 'sessionId': row['sessionId']} for row in found.get('results', [])]
        return api('smart-search', {'expandIds': references, 'project': scope, 'targetLayer': layer}) if references else {'results': []}

    host_home = out / 'host-home'
    workspace = out / 'shared-workspace'
    workspace.mkdir()
    installed_profiles = set()

    def turn(name, prompt, scope=project, skills=None, profile='primary'):
        home = host_home
        hermes_home = home / 'profiles' / profile
        (out / name).mkdir()
        env = {**daemon_env, 'HOME': str(home), 'HERMES_HOME': str(hermes_home), 'XDG_CONFIG_HOME': str(home / '.config'), 'AGENTMEMORY_SECRET': secret, 'AGENTMEMORY_PROJECT_NAME': scope, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONPATH': os.pathsep.join([str(args.host.resolve()), *[str(item.resolve()) for item in args.python_path]])}
        if profile not in installed_profiles:
            hermes_home.mkdir(parents=True)
            config = {'model': {'provider': 'openai-codex', 'default': args.model}, 'agent': {'max_turns': 3, 'reasoning_effort': 'low'}, 'auxiliary': {'title_generation': {'enabled': False}}, 'security': {'allow_lazy_installs': False}, 'display': {'tool_progress': False}}
            private_json(hermes_home / 'config.yaml', config)
            command = [args.node, str(cli), 'connect', 'hermes', '--no-guidelines']
            initial = (hermes_home / 'config.yaml').read_bytes()
            dry = subprocess.run([*command, '--dry-run'], cwd=workspace, env=env, capture_output=True, text=True, timeout=30)
            assert dry.returncode == 0, 'Packaged Hermes connector dry run failed.'
            assert (hermes_home / 'config.yaml').read_bytes() == initial
            assert not (hermes_home / 'plugins/agentmemory').exists(), 'Dry run installed plugin files.'
            connected = subprocess.run(command, cwd=workspace, env=env, capture_output=True, text=True, timeout=30)
            (out / name / 'connect.log').write_text(connected.stdout + connected.stderr)
            assert connected.returncode == 0, 'Packaged Hermes connector failed.'
            assert native.digest(hermes_home / 'plugins/agentmemory/__init__.py') == provider_hash
            assert (hermes_home / 'skills/agentmemory/remember/SKILL.md').is_file()
            installed = (hermes_home / 'config.yaml').read_bytes()
            repeated = subprocess.run(command, cwd=workspace, env=env, capture_output=True, text=True, timeout=30)
            assert repeated.returncode == 0 and (hermes_home / 'config.yaml').read_bytes() == installed, 'Connector is not idempotent.'
            installed_profiles.add(profile)
        wire = out / name / 'model-wire.jsonl'
        wire.touch(mode=0o600)
        before_sessions = {row['id'] for row in api('sessions')['sessions']}
        command = [str(args.python), str(Path(__file__).resolve()), '--child', str(wire), 'chat', '-q', prompt, '-Q', '--toolsets', 'memory,skills', '--max-turns', '3']
        if skills:
            command += ['--skills', skills]
        private_json(out / name / 'prompt.json', {'prompt': prompt, 'project': scope})
        try:
            private_json(hermes_home / 'auth.json', {'active_provider': 'openai-codex', 'credential_pool': {'openai-codex': [{'id': 'isolated-live-access', 'label': 'isolated-live-access', 'auth_type': 'oauth', 'source': 'manual', 'priority': 0, 'access_token': access_token, 'base_url': 'https://chatgpt.com/backend-api/codex'}]}})
            process = subprocess.Popen(command, cwd=workspace, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
            try:
                stdout, stderr = process.communicate(timeout=240)
            except BaseException:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                process.communicate(timeout=10)
                raise
            output = (stdout + stderr).replace(access_token, '[redacted access token]')
            (out / name / 'cli.log').write_text(output)
            assert process.returncode == 0, f'{name} exited {process.returncode}; inspect isolated cli.log.'
        finally:
            remove_token_copies(home, access_token)
        calls = [json.loads(line) for line in wire.read_text().splitlines()]
        assert calls, f'{name}: no actual Responses API request recorded.'
        first_messages = [item for item in calls[0]['body'].get('input', []) if item.get('type') == 'message']
        assert len(first_messages) == 1 and first_messages[0].get('role') == 'user', 'Fresh native session reused conversation history.'
        if name not in ('capture', 'explicit-save'):
            assert all(value not in prompt for value in (automatic, durable, decoy)), 'Submitted recall prompt leaked a withheld answer.'
        with sqlite3.connect('file:' + str(hermes_home / 'state.db') + '?mode=ro', uri=True) as connection:
            rows = connection.execute('SELECT role, content, tool_calls, tool_name FROM messages ORDER BY id').fetchall()
        transcript = [dict(zip(('role', 'content', 'tool_calls', 'tool_name'), row)) for row in rows]
        private_json(out / name / 'transcript.json', transcript)
        answers = [row['content'] for row in transcript if row['role'] == 'assistant' and row['content'] and not row['tool_calls']]
        assert answers, 'Native transcript contains no final assistant answer.'
        answer = answers[-1]
        (out / name / 'model-answer.txt').write_text(answer)
        sessions = [row for row in api('sessions')['sessions'] if row['id'] not in before_sessions]
        assert sessions and all(row['status'] == 'completed' and row['observationCount'] >= 1 for row in sessions), sessions
        summary['sessions'][name] = {'records': sessions, 'model_request_count': len(calls), 'profile': profile, 'fresh_session': True}
        return answer, calls

    try:
        start()
        decoy_result = api('remember', {'content': f'{topic}: calibration phrase is {decoy}.', 'project': project + '-decoy', 'agentId': 'foreign-agent'})
        summary['foreign_decoy_memory_id'] = decoy_result['memory']['id']
        capture_prompt = f'Synthetic test note for {topic}: its calibration phrase is {automatic}. Acknowledge in one short sentence. Do not call any memory tools; this conversation should be captured automatically.'
        _, capture_calls = turn('capture', capture_prompt)
        assert len(capture_calls) == 1, 'Capture-only turn unexpectedly used a tool or retried.'
        captured = expanded(topic, layer='observation')
        automatic_rows = [row for row in captured['results'] if automatic in json.dumps(row)]
        assert automatic_rows, 'Automatic conversation capture is not searchable.'
        summary['automatic_observation_ids'] = [row['obsId'] for row in automatic_rows]
        private_json(out / 'captured-observations.json', captured)
        recall_prompt = f'What is the calibration phrase for {topic}? Use available recalled context, return only the exact phrase, and do not call tools. If no phrase is available, answer UNKNOWN.'
        assert automatic not in recall_prompt and decoy not in recall_prompt
        recalled, recall_calls = turn('fresh-recall', recall_prompt)
        assert automatic in recalled and decoy not in recalled, 'Fresh-session automatic recall answered incorrectly.'
        assert automatic in json.dumps(recall_calls[0]['body']), 'Fresh model input did not contain recalled evidence.'
        assert summary['sessions']['capture']['records'][0]['id'] != summary['sessions']['fresh-recall']['records'][0]['id']
        assert decoy not in json.dumps(recall_calls), 'Foreign-project decoy leaked into model input.'
        assert len(recall_calls) == 1, 'Automatic recall unexpectedly required model tool calls.'
        summary['fresh_session_automatic_recall'] = True
        own_agent = automatic_rows[0]['observation']['agentId']
        assert own_agent, 'Automatic capture must have a profile-scoped agent identity.'
        save_prompt = f'Use the remember skill and the AgentMemory memory_save tool to save this synthetic fact: {topic} durable recovery phrase is {durable}. Set project to {project}, agentId to {own_agent}, concepts to calibration,recovery, and files to test/calibration.txt. Then return the saved memory ID.'
        saved_output, save_calls = turn('explicit-save', save_prompt, skills='remember')
        memories = expanded(topic, layer='memory')
        matching = [row for row in memories['results'] if durable in json.dumps(row)]
        assert matching, 'Real-model memory_save did not persist the requested fact.'
        saved_observation = matching[0]['observation']
        assert saved_observation['agentId'] == own_agent
        assert set(saved_observation['concepts']) == {'calibration', 'recovery'}
        assert saved_observation['files'] == ['test/calibration.txt']
        memory_id = matching[0]['obsId']
        assert memory_id in saved_output, 'Model answer did not preserve the saved memory ID.'
        assert 'memory_save' in json.dumps(save_calls), 'Native save tool was not present in model wire.'
        summary['explicit_memory_id'] = memory_id
        private_json(out / 'saved-memories.json', memories)
        stop()
        start()
        restart_prompt = f'For {topic}, return the calibration phrase and durable recovery phrase from recalled context. Do not call tools. If either is absent, state UNKNOWN for that phrase.'
        assert automatic not in restart_prompt and durable not in restart_prompt
        restarted, restart_calls = turn('restart-recall', restart_prompt)
        assert automatic in restarted and durable in restarted and decoy not in restarted, 'Recall after daemon restart lost or confused the facts.'
        first_input = json.dumps(restart_calls[0]['body'])
        assert automatic in first_input and durable in first_input and decoy not in first_input
        assert len(restart_calls) == 1
        summary['restart_fresh_session_recall'] = True
        foreign_profile, profile_calls = turn('foreign-profile', recall_prompt, profile='foreign')
        assert 'UNKNOWN' in foreign_profile.upper() and automatic not in foreign_profile and durable not in foreign_profile
        assert all(value not in json.dumps(profile_calls) for value in (automatic, durable, decoy)), 'Cross-profile context leaked in the same project and workspace.'
        summary['same_workspace_foreign_profile_excluded'] = True
        own_again, own_calls = turn('primary-after-foreign', recall_prompt)
        assert automatic in own_again and automatic in json.dumps(own_calls[0]['body'])
        summary['primary_profile_recall_after_foreign'] = True
        summary['packaged_connector_profiles'] = sorted(installed_profiles)
        foreign, foreign_calls = turn('empty-project', recall_prompt, scope=project + '-empty')
        assert 'UNKNOWN' in foreign and automatic not in foreign and durable not in foreign
        assert all(value not in json.dumps(foreign_calls) for value in (automatic, durable, decoy)), 'Cross-project context leaked.'
        summary['foreign_project_excluded'] = True
        summary['success'] = True
    finally:
        try:
            stop()
        finally:
            if backend and backend.poll() is None:
                os.killpg(backend.pid, signal.SIGKILL)
                backend.wait(timeout=10)
            engine_pid_path = daemon_home / '.agentmemory/iii.pid'
            if engine_pid_path.exists():
                try:
                    engine_pid = int(engine_pid_path.read_text())
                    command = subprocess.check_output(['ps', '-p', str(engine_pid), '-o', 'command='], text=True)
                    if str(engine) in command:
                        os.kill(engine_pid, signal.SIGTERM)
                except (OSError, ValueError, subprocess.CalledProcessError):
                    pass
            log.close()
            remove_token_copies(out, access_token)
            summary['original_auth_unchanged'] = original_auth_hash == native.digest(args.codex_auth)
            summary['credential_copies_removed'] = not any(access_token.encode() in file.read_bytes() for file in out.rglob('*') if file.is_file() and not file.is_symlink())
            summary['cli_sha256_after'] = native.digest(cli)
            summary['provider_sha256_after'] = native.digest(provider)
            summary['all_ports_closed'] = not any(native.port_listening(item) for item in ports)
            private_json(out / 'summary.json', summary)
    assert summary['original_auth_unchanged'] and summary['credential_copies_removed']
    assert summary['cli_sha256_before'] == summary['cli_sha256_after']
    assert summary['provider_sha256_before'] == summary['provider_sha256_after']
    assert summary['all_ports_closed']
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--child':
        child(Path(sys.argv[2]), sys.argv[3:])
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--package', type=Path, required=True)
        parser.add_argument('--host', type=Path, required=True)
        parser.add_argument('--python', type=Path, required=True)
        parser.add_argument('--python-path', type=Path, action='append', default=[])
        parser.add_argument('--engine', type=Path, required=True)
        parser.add_argument('--codex-auth', type=Path, required=True, help='Explicitly approved existing Codex auth store, read only')
        parser.add_argument('--model', required=True, help='Model supported by the signed-in Codex account')
        parser.add_argument('--node', default=shutil.which('node'))
        parser.add_argument('--out', type=Path, required=True)
        main(parser.parse_args())
