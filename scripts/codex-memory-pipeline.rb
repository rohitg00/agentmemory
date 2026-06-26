#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest/sha1"
require "fileutils"
require "json"
require "net/http"
require "open3"
require "optparse"
require "set"
require "shellwords"
require "tempfile"
require "time"
require "timeout"
require "uri"

$stdout.sync = true
$stderr.sync = true

DEFAULT_SOURCE = File.expand_path("~/.codex/sessions")
DEFAULT_STATE = File.expand_path("~/.agentmemory/codex-pipeline/state.jsonl")
DEFAULT_REPLAY_STATE = File.expand_path("~/.agentmemory/replay-enrichment/state.jsonl")
DEFAULT_AGENTMEMORY_URL = ENV.fetch("AGENTMEMORY_URL", "http://localhost:3111")
DEFAULT_SCHEMA_DIR = File.expand_path("~/.agentmemory/schemas")
DEFAULT_TMP_DIR = File.expand_path("~/.agentmemory/codex-pipeline/tmp")
DEFAULT_TRUSTED_CWD = "/home/dmartino/co/dimartino-dotfiles"
DEFAULT_EXPORT_VERSION = "0.9.27"
DEFAULT_MAX_EVENT_CHARS = 220
DEFAULT_MAX_PROMPT_CHARS = 3_000
DEFAULT_MAX_BATCH_PROMPT_CHARS = 20_000
DEFAULT_BATCH_SIZE = 5
DEFAULT_BATCH_MAX_EVENTS = 1_500
DEFAULT_BATCH_SMALL_MAX_EVENTS = 75
DEFAULT_BATCH_NORMAL_MAX_EVENTS = 250
DEFAULT_BATCH_MEDIUM_MIN_EVENTS = 500
DEFAULT_BATCH_OVERHEAD_CHARS = 700
MAX_DELTA_ITEMS = 200
SELF_IMPORT_TOOL_MARKERS = [
  "codex-memory-pipeline.rb ingest-summaries",
  "CODEX_PIPELINE_PHASE=ingest-summaries",
  "RUN_CODEX_PIPELINE=1",
  "agentmemory-cron-maintenance.sh",
  "import-codex-sessions-replay.rb",
  "enrich-codex-replay.rb"
].freeze

COMMANDS = %w[ingest-summaries re-enrich-ollama consolidate graph].freeze
UNSAFE_AGENTMEMORY_FLAGS = %w[
  AGENTMEMORY_AUTO_COMPRESS
  AGENTMEMORY_INJECT_CONTEXT
  CONSOLIDATION_ENABLED
  GRAPH_EXTRACTION_ENABLED
].freeze
CODEX_CHILD_ENV_ALLOWLIST = %w[
  CODEX_HOME
  HOME
  LANG
  LC_ALL
  LC_CTYPE
  LOGNAME
  PATH
  SHELL
  TERM
  TMPDIR
  USER
  XDG_CACHE_HOME
  XDG_CONFIG_HOME
  XDG_DATA_HOME
].freeze

PipelineOptions = Struct.new(
  :command,
  :source,
  :state_path,
  :replay_state_path,
  :agentmemory_url,
  :schema_dir,
  :tmp_dir,
  :trusted_cwd,
  :codex_add_dirs,
  :limit,
  :max_codex_calls,
  :after,
  :before,
  :project,
  :cwd_regex,
  :min_events,
  :max_events,
  :sample_events,
  :max_event_chars,
  :max_prompt_chars,
  :batch_size,
  :max_batch_prompt_chars,
  :batch_max_events,
  :batch_fallback_single,
  :sleep_seconds,
  :snapshot_rebuild,
  :memory_source,
  :dry_run,
  :codex_dry_run,
  :skip_failed,
  :timeout_seconds,
  keyword_init: true
)

def usage
  warn <<~USAGE
    Usage: codex-memory-pipeline.rb <command> [options]

    Commands:
      ingest-summaries  Summarize Codex sessions with codex exec and remember them
      re-enrich-ollama  Re-summarize replay-enrichment memories with codex exec
      consolidate       Generate semantic/procedural memory deltas with codex exec
      graph             Generate graph node/edge deltas with codex exec

    Default is dry-run. Use --apply to write to agentmemory.
  USAGE
end

def load_env_file(path)
  return {} unless File.file?(path)

  File.readlines(path, chomp: true).each_with_object({}) do |line, env|
    stripped = line.strip
    next if stripped.empty? || stripped.start_with?("#") || !stripped.include?("=")

    key, value = stripped.split("=", 2)
    env[key.strip] = value.to_s.strip
  end
end

def now_iso
  Time.now.utc.iso8601
end

def stable_id(prefix, *parts)
  "#{prefix}_#{Digest::SHA1.hexdigest(parts.map(&:to_s).join("\0"))[0, 20]}"
end

def stable_hash(value)
  Digest::SHA1.hexdigest(JSON.generate(value))
end

def truncate_text(value, max_chars)
  text = value.is_a?(String) ? value : JSON.generate(value)
  text.length > max_chars ? "#{text[0, max_chars]}...[truncated]" : text
rescue JSON::GeneratorError
  value.to_s
end

def content_text(content)
  return content if content.is_a?(String)
  return "" unless content.is_a?(Array)

  content.filter_map do |entry|
    next unless entry.is_a?(Hash)

    if %w[text input_text output_text].include?(entry["type"]) && entry["text"].is_a?(String)
      entry["text"]
    end
  end.join("\n")
end

def jsonl_files(source)
  if File.file?(source)
    source.end_with?(".jsonl") ? [source] : []
  else
    Dir.glob(File.join(source, "**", "*.jsonl")).sort.reverse
  end
end

def sample_event_window(events, max_events)
  max_events = max_events.to_i
  return events if max_events <= 0 || events.length <= max_events

  head_count = max_events / 2
  tail_count = max_events - head_count
  events.first(head_count) + events.last(tail_count)
end

def parse_codex_session(path, max_event_chars, sample_events = 0)
  meta = {}
  events = []
  response_items = 0

  File.foreach(path).with_index do |line, index|
    next if line.strip.empty?

    obj = JSON.parse(line)
    if obj["type"] == "session_meta"
      payload = obj["payload"] || {}
      meta = {
        "id" => payload["id"],
        "cwd" => payload["cwd"],
        "timestamp" => payload["timestamp"] || obj["timestamp"],
        "originator" => payload["originator"],
        "model_provider" => payload["model_provider"],
        "agent_nickname" => payload["agent_nickname"],
        "agent_role" => payload["agent_role"]
      }.compact
      next
    end
    next unless obj["type"] == "response_item"

    response_items += 1
    payload = obj["payload"] || {}
    timestamp = obj["timestamp"] || payload["timestamp"] || meta["timestamp"]
    payload_type = payload["type"]

    case payload_type
    when "message"
      role = payload["role"]
      next if role == "developer"

      text = content_text(payload["content"]).strip
      next if text.empty?

      events << {
        kind: "message",
        role: role,
        timestamp: timestamp,
        text: truncate_text(text, max_event_chars)
      }
    when "function_call", "custom_tool_call", "tool_search_call", "web_search_call"
      input = payload["arguments"] || payload["input"] || payload.reject { |key, _| %w[type call_id name].include?(key) }
      events << {
        kind: "tool_call",
        name: payload["name"] || payload_type,
        timestamp: timestamp,
        text: truncate_text(input, max_event_chars)
      }
    when "function_call_output", "custom_tool_call_output", "tool_search_output", "web_search_output"
      output = payload.key?("output") ? payload["output"] : payload.reject { |key, _| %w[type call_id].include?(key) }
      events << {
        kind: payload["status"] == "failed" || payload["is_error"] == true ? "tool_error" : "tool_result",
        timestamp: timestamp,
        text: truncate_text(output, max_event_chars)
      }
    end
  rescue JSON::ParserError
    warn "skip malformed JSON #{path}:#{index + 1}"
  end

  meta["id"] ||= File.basename(path, ".jsonl").split("-").last
  meta["cwd"] ||= Dir.home
  meta["timestamp"] ||= Time.at(File.mtime(path)).utc.iso8601
  original_events = events.length
  events = sample_event_window(events, sample_events)
  {
    path: path,
    meta: meta,
    project: File.basename(meta["cwd"].to_s),
    response_items: response_items,
    original_events: original_events,
    events: events
  }
end

def read_jsonl(path)
  return [] unless File.file?(path)

  File.readlines(path, chomp: true).filter_map do |line|
    next if line.strip.empty?

    JSON.parse(line)
  rescue JSON::ParserError
    nil
  end
end

def append_state(path, row)
  FileUtils.mkdir_p(File.dirname(path))
  File.open(path, "a") { |file| file.puts(JSON.generate(row)) }
end

def state_identity(row)
  source = row["source"].to_s.strip
  return source unless source.empty?

  sid = row["sessionId"].to_s.strip
  sid unless sid.empty?
end

def latest_rows_by_identity(rows)
  rows.each_with_object({}) do |row, index|
    identity = state_identity(row)
    index[identity] = row if identity
  end
end

def state_row_for_session(index, session)
  source = session[:path].to_s.strip
  return index[source] if index[source]

  sid = session[:meta]["id"].to_s.strip
  return nil if sid.empty?

  index[sid]
end

def date_in_range?(timestamp, after, before_)
  return true unless timestamp

  value_for_after = after&.length.to_i > 10 ? timestamp.to_s : timestamp.to_s[0, 10]
  value_for_before = before_&.length.to_i > 10 ? timestamp.to_s : timestamp.to_s[0, 10]
  return false if after && value_for_after < after
  return false if before_ && value_for_before > before_

  true
end

def codex_import_session?(session)
  session[:events].any? do |event|
    next false unless event[:kind] == "tool_call"

    text = event[:text].to_s
    SELF_IMPORT_TOOL_MARKERS.any? { |marker| text.include?(marker) }
  end
end

def session_event_count(session)
  session[:original_events] || session[:events].length
end

def schema_path(options, name)
  File.join(options.schema_dir, name)
end

def build_session_prompt(session, max_prompt_chars)
  meta = session[:meta]
  header = [
    "You are preparing one durable agentmemory record from a Codex session.",
    "Return JSON matching the provided schema. No markdown fences.",
    "Rules:",
    "- Preserve exact paths, commands, ids, decisions, failures, and next actions.",
    "- Do not invent facts.",
    "- For long sessions, use both timeline start and timeline end; the middle may be omitted.",
    "- content must start with: Codex replay session summary",
    "- sourceSessionId must be exactly #{meta["id"]}",
    "- sourcePath must be exactly #{session[:path]}",
    "- project must be exactly #{session[:project]}",
    "",
    "Session ID: #{meta["id"]}",
    "Project: #{session[:project]}",
    "CWD: #{meta["cwd"]}",
    "Started: #{meta["timestamp"]}",
    "Source file: #{session[:path]}",
    "Events: #{session_event_count(session)}",
    ("Sampled events in timeline: #{session[:events].length}" if session[:original_events] && session[:original_events] != session[:events].length),
    "",
    "Timeline:"
  ]
  event_lines = session[:events].map.with_index do |event, idx|
    prefix = format("%03d %s %s", idx + 1, event[:timestamp], event[:kind])
    role = event[:role] ? " role=#{event[:role]}" : ""
    name = event[:name] ? " name=#{event[:name]}" : ""
    "#{prefix}#{role}#{name}: #{event[:text].to_s.gsub(/\s+/, " ").strip}"
  end

  header_text = header.join("\n")
  full_text = ([header_text] + event_lines).join("\n")
  return full_text if full_text.length <= max_prompt_chars

  budget = [max_prompt_chars - header_text.length - 120, 500].max
  head_budget = budget / 2
  tail_budget = budget - head_budget
  head_lines = []
  head_chars = 0
  event_lines.each do |line|
    break if head_chars + line.length + 1 > head_budget

    head_lines << line
    head_chars += line.length + 1
  end
  tail_lines = []
  tail_chars = 0
  event_lines.reverse_each do |line|
    break if tail_chars + line.length + 1 > tail_budget

    tail_lines << line
    tail_chars += line.length + 1
  end
  tail_lines.reverse!
  omitted = [event_lines.length - head_lines.length - tail_lines.length, 0].max
  sampled = head_lines + ["... omitted #{omitted} middle events ..."] + tail_lines
  ([header_text] + sampled).join("\n")[0, max_prompt_chars]
end

def build_batch_session_prompt(sessions, options)
  [
    "You are preparing durable agentmemory records from multiple Codex sessions.",
    "Return JSON matching schema. No markdown fences.",
    "Return exactly one summary per input session in summaries[].",
    "Match each output by exact sourcePath.",
    "Do not merge sessions. Do not omit sessions. Do not invent facts.",
    "Each content must start with: Codex replay session summary",
    "",
    sessions.map.with_index do |session, idx|
      [
        "=== SESSION #{idx + 1} OF #{sessions.length} ===",
        build_session_prompt(session, options.max_prompt_chars)
      ].join("\n")
    end.join("\n\n")
  ].join("\n")
end

def plan_ingest_batches(sessions, options)
  return sessions.map { |session| [session] } if options.batch_size <= 1

  batches = []
  current = []
  soft_limit = batch_soft_prompt_limit(options)

  sessions.each do |session|
    prompt = build_session_prompt(session, options.max_prompt_chars)
    prompt_chars = prompt.length
    event_count = session_event_count(session)
    force_single = prompt_chars > (options.max_batch_prompt_chars * 0.70)
    session_batch_limit = session_batch_limit(session, options, prompt_chars)
    if force_single
      batches << current unless current.empty?
      current = []
      batches << [session]
      next
    end

    would_chars = build_batch_session_prompt(current + [session], options).length
    current_batch_limit = current.empty? ? session_batch_limit : [session_batch_limit, current.map { |item| session_batch_limit(item, options) }.min].min
    if current.length >= current_batch_limit || (!current.empty? && would_chars > soft_limit)
      batches << current unless current.empty?
      current = []
    end

    current << session
  end

  batches << current unless current.empty?
  batches
end

def batch_soft_prompt_limit(options)
  reserve = [DEFAULT_BATCH_OVERHEAD_CHARS, (options.max_batch_prompt_chars * 0.10).to_i].max
  [options.max_batch_prompt_chars - reserve, 1].max
end

def session_batch_limit(session, options, prompt_chars = nil)
  event_count = session_event_count(session)
  prompt_chars ||= build_session_prompt(session, options.max_prompt_chars).length
  prompt_ratio = prompt_chars.to_f / options.max_batch_prompt_chars
  sampled = session[:original_events] && session[:original_events] != session[:events].length

  return 1 if prompt_ratio > 0.70
  return [options.batch_size, 2].min if prompt_ratio > 0.55
  return [options.batch_size, 3].min if prompt_ratio > 0.42
  if sampled || event_count > options.batch_max_events
    high_event_cap = prompt_ratio <= 0.30 ? 5 : 4
    return [options.batch_size, high_event_cap].min
  end
  return options.batch_size if prompt_ratio <= 0.30

  if event_count <= DEFAULT_BATCH_SMALL_MAX_EVENTS
    options.batch_size
  elsif event_count <= DEFAULT_BATCH_NORMAL_MAX_EVENTS
    [options.batch_size, 4].min
  elsif event_count < DEFAULT_BATCH_MEDIUM_MIN_EVENTS
    [options.batch_size, 3].min
  else
    [options.batch_size, 3].min
  end
end

def build_consolidation_prompt(memories, version)
  compact = memories.map do |memory|
    {
      id: memory["id"],
      project: memory["project"],
      content: truncate_text(memory["content"].to_s, 1_400),
      concepts: memory["concepts"] || [],
      sessionIds: memory["sessionIds"] || []
    }
  end

  <<~PROMPT
    You are generating an agentmemory export delta for semantic/procedural consolidation.
    Return JSON matching the provided schema. No markdown fences.

    Required exportData boilerplate:
    - version: #{version}
    - sessions: []
    - observations: {}
    - memories: []
    - summaries: []

    Rules:
    - semanticMemories: stable factual knowledge only.
    - proceduralMemories: reusable workflows only.
    - Prefer facts/procedures supported by 2+ memories; allow one high-confidence operational rule only when explicit.
    - Keep facts and steps concrete. Preserve exact tool names, endpoints, env vars, paths, and commands.
    - sourceMemoryIds must use ids from input.
    - sourceSessionIds should use sessionIds from input when available.
    - If nothing strong exists, return empty arrays.
    - IDs are required temporary strings; caller will replace them deterministically.

    Input memories:
    #{JSON.pretty_generate(compact)}
  PROMPT
end

def build_graph_prompt(memories, version)
  compact = memories.map do |memory|
    {
      id: memory["id"],
      project: memory["project"],
      content: truncate_text(memory["content"].to_s, 240),
      concepts: memory["concepts"] || [],
      files: memory["files"] || []
    }
  end

  <<~PROMPT
    You are generating an agentmemory graph export delta from session summary memories.
    Return JSON matching the provided schema. No markdown fences.

    Required exportData boilerplate:
    - version: #{version}
    - sessions: []
    - observations: {}
    - memories: []
    - summaries: []

    Rules:
    - graphNodes should represent concrete projects, files, services, tools, commands, endpoints, configs, issues, or operational concepts.
    - graphEdges should connect nodes with relationship types like uses, configures, mentions, depends_on, verifies, fixes, observes.
    - sourceObservationIds must use input memory ids.
    - Edge sourceNodeId and targetNodeId must refer to node ids in graphNodes.
    - Keep graph small: at most 12 nodes and 16 edges.
    - IDs may be temporary; caller will replace them deterministically.

    Input memories:
    #{JSON.pretty_generate(compact)}
  PROMPT
end

def parse_json_text(raw)
  text = raw.to_s.strip
  if text.start_with?("```")
    text = text.sub(/\A```(?:json)?\s*/i, "").sub(/```\s*\z/, "").strip
  end
  JSON.parse(text)
end

def valid_string?(value)
  value.is_a?(String) && !value.strip.empty?
end

def ensure_array!(obj, key, max: nil)
  value = obj[key]
  raise "#{key} must be array" unless value.is_a?(Array)
  raise "#{key} exceeds #{max} items" if max && value.length > max

  value
end

def ensure_empty_array!(obj, key)
  value = ensure_array!(obj, key)
  raise "#{key} must be empty array" unless value.empty?
end

def string_array(value)
  Array(value).select { |item| valid_string?(item) }.map(&:strip).uniq
end

def validate_summary!(obj, session)
  raise "summary output must be object" unless obj.is_a?(Hash)

  %w[content project sourceSessionId sourcePath].each do |key|
    raise "summary #{key} must be non-empty string" unless valid_string?(obj[key])
  end
  %w[concepts files followups].each do |key|
    raise "summary #{key} must be array" unless obj[key].is_a?(Array)
  end
  raise "sourceSessionId mismatch" unless obj["sourceSessionId"] == session[:meta]["id"]
  raise "sourcePath mismatch" unless obj["sourcePath"] == session[:path]
  raise "project mismatch" unless obj["project"] == session[:project]

  obj
end

def validate_batch_summary!(obj, sessions)
  raise "batch output must be object" unless obj.is_a?(Hash)

  summaries = obj["summaries"]
  raise "summaries must be array" unless summaries.is_a?(Array)

  expected = sessions.map { |session| session[:path] }
  by_path = summaries.group_by { |summary| summary.is_a?(Hash) ? summary["sourcePath"] : nil }
  missing = expected.reject { |path| by_path[path]&.length == 1 }
  extra = by_path.keys.compact - expected
  dupes = by_path.select { |path, rows| path && rows.length > 1 }.keys

  raise "missing summaries for #{missing.inspect}" unless missing.empty?
  raise "extra summaries for #{extra.inspect}" unless extra.empty?
  raise "duplicate summaries for #{dupes.inspect}" unless dupes.empty?

  sessions.map do |session|
    validate_summary!(by_path.fetch(session[:path]).first, session)
  end
end

def validate_export_delta!(obj, command)
  raise "delta output must be object" unless obj.is_a?(Hash)
  export = obj["exportData"]
  raise "exportData must be object" unless export.is_a?(Hash)
  ensure_empty_array!(export, "sessions")
  ensure_empty_array!(export, "memories")
  ensure_empty_array!(export, "summaries")
  raise "exportData.observations must be object" unless export["observations"].is_a?(Hash)
  raise "exportData.observations must be empty object" unless export["observations"].empty?

  case command
  when "consolidate"
    ensure_array!(export, "semanticMemories", max: MAX_DELTA_ITEMS)
    ensure_array!(export, "proceduralMemories", max: MAX_DELTA_ITEMS)
  when "graph"
    ensure_array!(export, "graphNodes", max: MAX_DELTA_ITEMS)
    ensure_array!(export, "graphEdges", max: MAX_DELTA_ITEMS)
  else
    raise "unsupported delta command=#{command}"
  end

  export
end

def canonicalize_semantic(export, version)
  now = now_iso
  semantic = Array(export["semanticMemories"]).filter_map do |item|
    next unless item.is_a?(Hash)

    fact = item["fact"].to_s.strip
    next if fact.empty?

    confidence = [[Float(item["confidence"] || 0.5), 0.0].max, 1.0].min
    {
      "id" => stable_id("sem_codex", fact.downcase),
      "fact" => fact,
      "confidence" => confidence,
      "sourceSessionIds" => string_array(item["sourceSessionIds"]),
      "sourceMemoryIds" => string_array(item["sourceMemoryIds"]),
      "accessCount" => 1,
      "lastAccessedAt" => now,
      "strength" => confidence,
      "createdAt" => now,
      "updatedAt" => now
    }
  rescue ArgumentError, TypeError
    nil
  end

  procedural = Array(export["proceduralMemories"]).filter_map do |item|
    next unless item.is_a?(Hash)

    name = item["name"].to_s.strip
    trigger = item["triggerCondition"].to_s.strip
    steps = string_array(item["steps"])
    next if name.empty? || trigger.empty? || steps.empty?

    {
      "id" => stable_id("proc_codex", name.downcase, trigger.downcase, steps.join("\n").downcase),
      "name" => name,
      "steps" => steps,
      "triggerCondition" => trigger,
      "frequency" => 1,
      "sourceSessionIds" => string_array(item["sourceSessionIds"]),
      "sourceMemoryIds" => string_array(item["sourceMemoryIds"]),
      "strength" => 0.5,
      "createdAt" => now,
      "updatedAt" => now
    }
  end

  {
    "version" => version,
    "exportedAt" => now,
    "sessions" => [],
    "observations" => {},
    "memories" => [],
    "summaries" => [],
    "semanticMemories" => semantic,
    "proceduralMemories" => procedural
  }
end

def canonicalize_graph(export, version)
  now = now_iso
  id_map = {}
  nodes = []
  seen_nodes = {}

  Array(export["graphNodes"]).each do |item|
    next unless item.is_a?(Hash)

    type = item["type"].to_s.strip.downcase
    name = item["name"].to_s.strip
    next if type.empty? || name.empty?

    id = stable_id("gn_codex", type, name.downcase)
    if valid_string?(item["id"])
      source_id = item["id"].to_s
      existing_id = id_map[source_id]
      raise "duplicate graph node id=#{source_id}" if existing_id && existing_id != id

      id_map[source_id] = id
    end
    next if seen_nodes[id]

    properties = item["properties"].is_a?(Hash) ? item["properties"].transform_values { |v| v.to_s } : {}
    nodes << {
      "id" => id,
      "type" => type,
      "name" => name,
      "properties" => properties,
      "sourceObservationIds" => string_array(item["sourceObservationIds"]),
      "createdAt" => now
    }
    seen_nodes[id] = true
  end

  node_ids = nodes.map { |node| node["id"] }.to_set
  edges = []
  seen_edges = {}
  Array(export["graphEdges"]).each do |item|
    next unless item.is_a?(Hash)

    type = item["type"].to_s.strip.downcase
    source = id_map[item["sourceNodeId"].to_s] || item["sourceNodeId"].to_s
    target = id_map[item["targetNodeId"].to_s] || item["targetNodeId"].to_s
    raise "dangling graph edge source=#{source}" unless node_ids.include?(source)
    raise "dangling graph edge target=#{target}" unless node_ids.include?(target)
    next if type.empty? || source == target

    weight = [[Float(item["weight"] || 0.5), 0.0].max, 1.0].min
    id = stable_id("ge_codex", source, target, type)
    next if seen_edges[id]

    edges << {
      "id" => id,
      "type" => type,
      "sourceNodeId" => source,
      "targetNodeId" => target,
      "weight" => weight,
      "sourceObservationIds" => string_array(item["sourceObservationIds"]),
      "createdAt" => now
    }
    seen_edges[id] = true
  rescue ArgumentError, TypeError
    next
  end

  {
    "version" => version,
    "exportedAt" => now,
    "sessions" => [],
    "observations" => {},
    "memories" => [],
    "summaries" => [],
    "graphNodes" => nodes,
    "graphEdges" => edges
  }
end

def http_json(method, base_url, path, body: nil, timeout: 120)
  uri = URI.join(base_url.end_with?("/") ? base_url : "#{base_url}/", path)
  req = method == :get ? Net::HTTP::Get.new(uri) : Net::HTTP::Post.new(uri)
  req["content-type"] = "application/json"
  req["authorization"] = "Bearer #{ENV.fetch("AGENTMEMORY_SECRET")}" if ENV["AGENTMEMORY_SECRET"]
  req.body = JSON.generate(body) if body

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == "https"
  http.open_timeout = 10
  http.write_timeout = 30 if http.respond_to?(:write_timeout=)
  http.read_timeout = timeout
  res = http.request(req)
  payload = res.body.to_s.empty? ? {} : JSON.parse(res.body)
  raise "HTTP #{res.code} #{res.body.to_s[0, 500]}" unless res.is_a?(Net::HTTPSuccess)

  payload
end

def export_version(agentmemory_url)
  json = http_json(:get, agentmemory_url, "agentmemory/export?maxSessions=1", timeout: 120)
  json["version"].to_s.empty? ? DEFAULT_EXPORT_VERSION : json["version"].to_s
rescue StandardError => e
  warn "version fallback=#{DEFAULT_EXPORT_VERSION} reason=#{e.message}"
  DEFAULT_EXPORT_VERSION
end

def remember(agentmemory_url, session, summary, extra_concepts: [], extra_lines: [])
  concepts = (string_array(summary["concepts"]) + [
    "codex-pipeline-summary",
    "codex-replay-summary",
    "codex-session-import",
    "project:#{session[:project]}",
    "cwd:#{session[:meta]["cwd"]}"
  ] + extra_concepts).uniq
  extra_text = extra_lines.empty? ? "" : "\n#{extra_lines.join("\n")}"
  content = <<~TEXT.strip
    #{summary["content"].strip}

    Session: #{summary["sourceSessionId"]}
    Project: #{summary["project"]}
    CWD: #{session[:meta]["cwd"]}
    Source: #{summary["sourcePath"]}#{extra_text}
  TEXT

  json = http_json(:post, agentmemory_url, "agentmemory/remember", body: {
    content: content,
    type: "workflow",
    project: summary["project"],
    concepts: concepts,
    files: string_array(summary["files"])
  })
  raise "remember failed: #{json.inspect}" unless json["success"] == true

  json["memory"] || {}
end

def fetch_memory(agentmemory_url, memory_id)
  encoded = URI.encode_www_form_component(memory_id)
  json = http_json(:get, agentmemory_url, "agentmemory/memories/#{encoded}", timeout: 60)
  json["memory"] || json
end

def import_delta(agentmemory_url, export_data)
  http_json(:post, agentmemory_url, "agentmemory/import", body: {
    strategy: "skip",
    exportData: export_data
  }, timeout: 180)
end

def rebuild_graph_snapshot(agentmemory_url)
  http_json(:post, agentmemory_url, "agentmemory/graph/snapshot-rebuild", body: {
    force: true
  }, timeout: 180)
end

def existing_memory_for_source(agentmemory_url, session_id, source_path)
  json = http_json(:post, agentmemory_url, "agentmemory/smart-search", body: {
    query: "codex replay session summary #{session_id} #{source_path}",
    limit: 5
  }, timeout: 60)
  Array(json["results"]).each do |result|
    next unless result.is_a?(Hash)

    searchable = [result["title"], result["content"], result["text"], result["obsId"], result["memoryId"], result["id"]].compact.join("\n")
    next unless searchable.include?(source_path)

    memory_id = result["memoryId"] || result["obsId"] || result["id"]
    return memory_id if valid_string?(memory_id)
  end
  nil
end

def git_status(dir)
  return "" unless File.directory?(File.join(dir, ".git"))

  stdout, status = Open3.capture2e("git", "-C", dir, "status", "--short")
  status.success? ? stdout : "git-status-failed:#{stdout}"
end

def codex_child_env(options)
  env = {}
  CODEX_CHILD_ENV_ALLOWLIST.each do |key|
    env[key] = ENV[key] if ENV.key?(key) && !ENV[key].to_s.empty?
  end
  env["HOME"] ||= Dir.home
  env["PATH"] ||= "/usr/local/bin:/usr/bin:/bin"
  env["TMPDIR"] = options.tmp_dir
  env["AGENTMEMORY_CODEX_BACKEND_ACTIVE"] = "1"
  env["AGENTMEMORY_SDK_CHILD"] = "1"
  env["AGENTMEMORY_AUTO_COMPRESS"] = "false"
  env["AGENTMEMORY_INJECT_CONTEXT"] = "false"
  env["CONSOLIDATION_ENABLED"] = "false"
  env["GRAPH_EXTRACTION_ENABLED"] = "false"
  env
end

def unsafe_flag_allowed?(key, command)
  key == "GRAPH_EXTRACTION_ENABLED" &&
    %w[re-enrich-ollama consolidate graph].include?(command) &&
    ENV["AGENTMEMORY_CODEX_ALLOW_GRAPH_ENABLED"] == "true"
end

def capture_with_timeout(env, cmd, stdin_data, cwd, timeout_seconds)
  in_r, in_w = IO.pipe
  out_r, out_w = IO.pipe
  err_r, err_w = IO.pipe
  pid = Process.spawn(env, *cmd, { unsetenv_others: true, chdir: cwd, in: in_r, out: out_w, err: err_w })
  in_r.close
  out_w.close
  err_w.close

  writer = Thread.new do
    in_w.write(stdin_data)
  ensure
    in_w.close
  end
  stdout_thread = Thread.new { out_r.read }
  stderr_thread = Thread.new { err_r.read }
  status = nil

  Timeout.timeout(timeout_seconds) do
    _, status = Process.wait2(pid)
  end
  writer.join
  [stdout_thread.value, stderr_thread.value, status]
rescue Timeout::Error
  begin
    Process.kill("TERM", pid)
    sleep 2
    Process.kill("KILL", pid)
  rescue StandardError
    nil
  end
  raise "codex exec timed out after #{timeout_seconds}s"
ensure
  [in_w, out_r, err_r].each { |io| io.close unless io.closed? rescue nil }
end

def run_codex(prompt, schema, options)
  FileUtils.mkdir_p(options.tmp_dir)
  output_path = File.join(options.tmp_dir, "codex-output-#{Time.now.utc.strftime("%Y%m%dT%H%M%SZ")}-#{$$}-#{rand(1_000_000)}.json")
  cmd = [
    "codex",
    "-c",
    "model_reasoning_summary=\"none\"",
    "-c",
    "model_verbosity=\"low\"",
    "-c",
    "tool_output_token_limit=6000",
    "-c",
    "model_auto_compact_token_limit=64000",
    "-c",
    "agents.max_threads=10",
    "-c",
    "agents.max_depth=1",
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--cd",
    options.trusted_cwd,
    "--output-schema",
    schema,
    "--output-last-message",
    output_path,
    "-"
  ]
  options.codex_add_dirs.each do |dir|
    insert_at = cmd.index("--output-schema")
    cmd.insert(insert_at, "--add-dir", dir)
  end
  env = codex_child_env(options)

  before_status = git_status(options.trusted_cwd)
  stdout, stderr, status = capture_with_timeout(env, cmd, prompt, options.trusted_cwd, options.timeout_seconds)
  after_status = git_status(options.trusted_cwd)
  raise "codex exec failed status=#{status.exitstatus} stderr=#{stderr.to_s[0, 4_000]}" unless status.success?
  raise "codex child changed trusted worktree" unless before_status == after_status

  raw = File.file?(output_path) ? File.read(output_path) : stdout
  parsed = parse_json_text(raw)
  {
    "output" => parsed,
    "promptHash" => Digest::SHA1.hexdigest(prompt),
    "outputHash" => Digest::SHA1.hexdigest(raw.to_s),
    "schema" => schema,
    "outputPath" => output_path,
    "stdoutBytes" => stdout.to_s.bytesize,
    "stderrBytes" => stderr.to_s.bytesize
  }
end

def parse_options(command, argv)
  options = PipelineOptions.new(
    command: command,
    source: DEFAULT_SOURCE,
    state_path: DEFAULT_STATE,
    replay_state_path: DEFAULT_REPLAY_STATE,
    agentmemory_url: DEFAULT_AGENTMEMORY_URL,
    schema_dir: DEFAULT_SCHEMA_DIR,
    tmp_dir: DEFAULT_TMP_DIR,
    trusted_cwd: DEFAULT_TRUSTED_CWD,
    codex_add_dirs: [],
    limit: %w[ingest-summaries re-enrich-ollama].include?(command) ? DEFAULT_BATCH_SIZE : 10,
    max_codex_calls: 1,
    after: "2026-06-01",
    before: nil,
    project: nil,
    cwd_regex: nil,
    min_events: 10,
    max_events: 50,
    sample_events: 0,
    max_event_chars: DEFAULT_MAX_EVENT_CHARS,
    max_prompt_chars: DEFAULT_MAX_PROMPT_CHARS,
    batch_size: DEFAULT_BATCH_SIZE,
    max_batch_prompt_chars: DEFAULT_MAX_BATCH_PROMPT_CHARS,
    batch_max_events: DEFAULT_BATCH_MAX_EVENTS,
    batch_fallback_single: true,
    sleep_seconds: 0,
    snapshot_rebuild: true,
    memory_source: nil,
    dry_run: true,
    codex_dry_run: false,
    skip_failed: true,
    timeout_seconds: 900
  )

  parser = OptionParser.new do |opts|
    opts.banner = "Usage: codex-memory-pipeline.rb #{command} [options]"
    opts.on("--source PATH") { |value| options.source = File.expand_path(value) }
    opts.on("--state PATH") { |value| options.state_path = File.expand_path(value) }
    opts.on("--replay-state PATH") { |value| options.replay_state_path = File.expand_path(value) }
    opts.on("--agentmemory-url URL") { |value| options.agentmemory_url = value }
    opts.on("--schema-dir PATH") { |value| options.schema_dir = File.expand_path(value) }
    opts.on("--tmp-dir PATH") { |value| options.tmp_dir = File.expand_path(value) }
    opts.on("--trusted-cwd PATH") { |value| options.trusted_cwd = File.expand_path(value) }
    opts.on("--codex-add-dir PATH", "Additional explicit Codex context dir; repeatable") { |value| options.codex_add_dirs << File.expand_path(value) }
    opts.on("--limit N", Integer) { |value| options.limit = value }
    opts.on("--max-codex-calls N", Integer) { |value| options.max_codex_calls = value }
    opts.on("--after VALUE") { |value| options.after = value }
    opts.on("--before VALUE") { |value| options.before = value }
    opts.on("--project NAME") { |value| options.project = value }
    opts.on("--cwd-regex REGEX") { |value| options.cwd_regex = Regexp.new(value) }
    opts.on("--min-events N", Integer) { |value| options.min_events = value }
    opts.on("--max-events N", Integer) { |value| options.max_events = value }
    opts.on("--sample-events N", Integer, "Sample at most N parsed events per selected session for Codex prompts") { |value| options.sample_events = value }
    opts.on("--max-event-chars N", Integer) { |value| options.max_event_chars = value }
    opts.on("--max-prompt-chars N", Integer) { |value| options.max_prompt_chars = value }
    opts.on("--batch-size N", Integer, "Maximum sessions per Codex call; adaptive planner may use smaller batches") { |value| options.batch_size = value }
    opts.on("--max-batch-prompt-chars N", Integer, "Hard prompt char cap per Codex batch") { |value| options.max_batch_prompt_chars = value }
    opts.on("--batch-max-events N", Integer, "High-event threshold for adaptive batch caps") { |value| options.batch_max_events = value }
    opts.on("--sleep-seconds N", Integer, "Sleep after each applied Codex batch except the final batch") { |value| options.sleep_seconds = value }
    opts.on("--no-snapshot-rebuild", "Skip graph snapshot rebuild for this graph import batch") { options.snapshot_rebuild = false }
    opts.on("--memory-source VALUE", "Filter consolidate/graph inputs by source state") { |value| options.memory_source = value }
    opts.on("--no-batch-fallback-single") { options.batch_fallback_single = false }
    opts.on("--timeout-seconds N", Integer) { |value| options.timeout_seconds = value }
    opts.on("--dry-run") { options.dry_run = true }
    opts.on("--codex-dry-run") { options.codex_dry_run = true }
    opts.on("--apply") { options.dry_run = false }
    opts.on("--no-skip-failed") { options.skip_failed = false }
    opts.on("-h", "--help") do
      puts opts
      exit 0
    end
  end
  parser.parse!(argv)
  options.batch_size = [options.batch_size.to_i, 1].max
  options.max_batch_prompt_chars = [options.max_batch_prompt_chars.to_i, 1].max
  options.batch_max_events = [options.batch_max_events.to_i, 0].max
  options.sample_events = [options.sample_events.to_i, 0].max
  options.sleep_seconds = [options.sleep_seconds.to_i, 0].max
  options
end

def session_candidate?(session, options, pipeline_state, replay_state)
  meta = session[:meta]
  sid = meta["id"]
  return false unless sid
  pipeline_row = state_row_for_session(pipeline_state, session)
  replay_row = state_row_for_session(replay_state, session)
  return false if pipeline_row && pipeline_row["phase"] == "ingest-summaries" && pipeline_row["status"] == "remembered"
  return false if replay_row && replay_row["status"] == "remembered"
  return false if options.skip_failed && pipeline_row && pipeline_row["status"] == "failed"
  event_count = session_event_count(session)
  return false if event_count < options.min_events
  return false if event_count > options.max_events
  return false if options.project && session[:project] != options.project
  return false if options.cwd_regex && meta["cwd"].to_s !~ options.cwd_regex
  return false unless date_in_range?(meta["timestamp"], options.after, options.before)
  return false if codex_import_session?(session)

  true
end

def select_sessions(options)
  pipeline_state = latest_rows_by_identity(read_jsonl(options.state_path))
  replay_state = latest_rows_by_identity(read_jsonl(options.replay_state_path))
  selected = []
  jsonl_files(options.source).each do |path|
    session = parse_codex_session(path, options.max_event_chars, options.sample_events)
    next unless session_candidate?(session, options, pipeline_state, replay_state)

    selected << session
    break if selected.length >= options.limit
  end
  selected
end

def select_reenrich_sessions(options)
  rows = read_jsonl(options.replay_state_path).select do |row|
    row["status"] == "remembered" &&
      valid_string?(row["memoryId"]) &&
      valid_string?(row["source"]) &&
      File.file?(row["source"]) &&
      date_in_range?(row["startedAt"], options.after, options.before) &&
      (!options.project || row["project"] == options.project) &&
      (!options.cwd_regex || row["cwd"].to_s =~ options.cwd_regex)
  end.uniq { |row| [row["memoryId"].to_s, row["source"].to_s, row["sessionId"].to_s] }

  pipeline_rows = read_jsonl(options.state_path)
  codex_ingested = pipeline_rows.each_with_object(Set.new) do |row, ids|
    next unless row["phase"] == "ingest-summaries" && row["status"] == "remembered"

    ids << row["source"].to_s if valid_string?(row["source"])
    ids << row["sessionId"].to_s if valid_string?(row["sessionId"])
  end
  reenriched = pipeline_rows.each_with_object(Set.new) do |row, ids|
    next unless row["phase"] == "re-enrich-ollama" && row["status"] == "remembered"

    ids << row["source"].to_s if valid_string?(row["source"])
    ids << row["sessionId"].to_s if valid_string?(row["sessionId"])
    ids << row["originalMemoryId"].to_s if valid_string?(row["originalMemoryId"])
  end
  failed = pipeline_rows.each_with_object(Set.new) do |row, ids|
    next unless row["phase"] == "re-enrich-ollama" && row["status"] == "failed"

    ids << row["source"].to_s if valid_string?(row["source"])
    ids << row["sessionId"].to_s if valid_string?(row["sessionId"])
    ids << row["originalMemoryId"].to_s if valid_string?(row["originalMemoryId"])
  end

  rows.sort_by { |row| row["startedAt"].to_s }.reverse.filter_map do |row|
    identity_values = [row["source"].to_s, row["sessionId"].to_s, row["memoryId"].to_s]
    next if identity_values.any? { |value| codex_ingested.include?(value) }
    next if identity_values.any? { |value| reenriched.include?(value) }
    next if options.skip_failed && identity_values.any? { |value| failed.include?(value) }

    session = parse_codex_session(row["source"], options.max_event_chars, options.sample_events)
    next if session_event_count(session) < options.min_events
    next if session_event_count(session) > options.max_events
    next if codex_import_session?(session)

    session[:replay_row] = row
    session
  rescue StandardError => e
    warn "skip reenrich source=#{row["source"]} reason=#{e.message}"
    nil
  end.first(options.limit)
end

def pipeline_memory_rows(options)
  already_processed = processed_memory_ids(options)
  rows = []
  read_jsonl(options.replay_state_path).each do |row|
    source_state = "replay-enrichment"
    next if options.memory_source && options.memory_source != source_state
    next unless row["status"] == "remembered" && valid_string?(row["memoryId"])
    next if already_processed.include?(row["memoryId"])
    next unless date_in_range?(row["startedAt"], options.after, options.before)
    next if options.project && row["project"] != options.project
    next if options.cwd_regex && row["cwd"].to_s !~ options.cwd_regex

    rows << row.merge("sourceState" => source_state)
  end
  read_jsonl(options.state_path).each do |row|
    next unless %w[ingest-summaries re-enrich-ollama].include?(row["phase"])
    source_state = row["phase"] || "codex-pipeline"
    next if options.memory_source && options.memory_source != source_state
    next unless row["status"] == "remembered" && valid_string?(row["memoryId"])
    next if already_processed.include?(row["memoryId"])
    next unless date_in_range?(row["startedAt"], options.after, options.before)
    next if options.project && row["project"] != options.project
    next if options.cwd_regex && row["cwd"].to_s !~ options.cwd_regex

    rows << row.merge("sourceState" => source_state)
  end
  rows.uniq { |row| row["memoryId"] }.sort_by { |row| row["rememberedAt"].to_s }.reverse.first(options.limit)
end

def processed_memory_ids(options)
  return Set.new unless %w[consolidate graph].include?(options.command)

  read_jsonl(options.state_path).each_with_object(Set.new) do |row, ids|
    next unless row["phase"] == options.command
    next unless row["status"] == "imported"

    string_array(row["selectedMemoryIds"]).each { |id| ids << id }
  end
end

def fetch_pipeline_memories(options)
  pipeline_memory_rows(options).filter_map do |row|
    memory = fetch_memory(options.agentmemory_url, row["memoryId"])
    memory["id"] ||= row["memoryId"]
    memory["project"] ||= row["project"]
    memory["sessionIds"] = string_array(memory["sessionIds"]) | [row["sessionId"].to_s]
    memory
  rescue StandardError => e
    warn "skip memory=#{row["memoryId"]} reason=#{e.message}"
    nil
  end
end

def ingest_result_fields(result, batch: nil, batch_index: nil)
  fields = {
    "schema" => result["schema"],
    "promptHash" => result["promptHash"],
    "outputHash" => result["outputHash"]
  }
  return fields unless batch

  fields.merge(
    "batch" => true,
    "batchSize" => batch.length,
    "batchIndex" => batch_index,
    "batchSourcePaths" => batch.map { |session| session[:path] },
    "batchPromptHash" => result["promptHash"],
    "batchOutputHash" => result["outputHash"]
  )
end

def append_ingest_failure(options, session, error, fields = {})
  meta = session[:meta]
  append_state(options.state_path, {
    "phase" => "ingest-summaries",
    "sessionId" => meta["id"],
    "status" => "failed",
    "project" => session[:project],
    "cwd" => meta["cwd"],
    "startedAt" => meta["timestamp"],
    "source" => session[:path],
    "error" => error.message,
    "failedAt" => now_iso
  }.merge(fields)) unless options.dry_run
end

def ingest_one_session(session, schema, options, result: nil, summary: nil, batch: nil, batch_index: nil)
  meta = session[:meta]
  state_fields = {}
  unless result && summary
    prompt = build_session_prompt(session, options.max_prompt_chars)
    result = run_codex(prompt, schema, options)
    summary = validate_summary!(result["output"], session)
  end
  state_fields = ingest_result_fields(result, batch: batch, batch_index: batch_index)
  if options.dry_run
    puts "  codex output_hash=#{result["outputHash"]} content_chars=#{summary["content"].length}"
    return nil
  end

  existing_memory_id = if ENV["CODEX_PIPELINE_EXISTING_LOOKUP"] == "1"
    existing_memory_for_source(options.agentmemory_url, meta["id"], session[:path])
  end
  if existing_memory_id
    append_state(options.state_path, {
      "phase" => "ingest-summaries",
      "sessionId" => meta["id"],
      "status" => "remembered",
      "memoryId" => existing_memory_id,
      "reconciled" => true,
      "project" => session[:project],
      "cwd" => meta["cwd"],
      "startedAt" => meta["timestamp"],
      "source" => session[:path],
      "rememberedAt" => now_iso
    }.merge(state_fields))
    puts "  memory=#{existing_memory_id} reconciled=true"
    return existing_memory_id
  end

  append_state(options.state_path, {
    "phase" => "ingest-summaries",
    "sessionId" => meta["id"],
    "status" => "pending",
    "project" => session[:project],
    "cwd" => meta["cwd"],
    "startedAt" => meta["timestamp"],
    "source" => session[:path],
    "pendingAt" => now_iso
  }.merge(state_fields))
  memory = remember(options.agentmemory_url, session, summary)
  append_state(options.state_path, {
    "phase" => "ingest-summaries",
    "sessionId" => meta["id"],
    "status" => "remembered",
    "memoryId" => memory["id"],
    "project" => session[:project],
    "cwd" => meta["cwd"],
    "startedAt" => meta["timestamp"],
    "source" => session[:path],
    "rememberedAt" => now_iso
  }.merge(state_fields))
  puts "  memory=#{memory["id"]}"
  memory["id"]
rescue StandardError => e
  append_ingest_failure(options, session, e, state_fields)
  raise
end

def command_ingest(options)
  single_schema = schema_path(options, "codex-session-summary.schema.json")
  batch_schema = schema_path(options, "codex-session-summary-batch.schema.json")
  selected = select_sessions(options).first(options.limit)
  batches = plan_ingest_batches(selected, options).first(options.max_codex_calls)
  runnable = batches.flatten
  puts "command=ingest-summaries"
  puts "state=#{options.state_path}"
  puts "dry_run=#{options.dry_run}"
  puts "codex_dry_run=#{options.codex_dry_run}"
  puts "batch_size=#{options.batch_size}"
  puts "sample_events=#{options.sample_events}"
  puts "max_batch_prompt_chars=#{options.max_batch_prompt_chars}"
  puts "batch_max_events=#{options.batch_max_events}"
  puts "sleep_seconds=#{options.sleep_seconds}"
  puts "selected=#{runnable.length}"
  puts "batches=#{batches.length}"
  batches.each_with_index do |batch, batch_idx|
    batch_prompt_chars = if batch.length == 1
      build_session_prompt(batch.first, options.max_prompt_chars).length
    else
      build_batch_session_prompt(batch, options).length
    end
    puts "batch[#{batch_idx + 1}/#{batches.length}] size=#{batch.length} events=#{batch.sum { |session| session_event_count(session) }} prompt_chars=#{batch_prompt_chars}"
    batch.each_with_index do |session, idx|
      meta = session[:meta]
      sampled = session[:original_events] && session[:original_events] != session[:events].length ? " sampled=#{session[:events].length}" : ""
      puts "[#{idx + 1}/#{batch.length}] #{meta["id"]} project=#{session[:project]} cwd=#{meta["cwd"]} events=#{session_event_count(session)}#{sampled} started=#{meta["timestamp"]} source=#{session[:path]}"
    end
    next if options.dry_run && !options.codex_dry_run

    if batch.length == 1
      ingest_one_session(batch.first, single_schema, options)
      next
    end

    begin
      prompt = build_batch_session_prompt(batch, options)
      result = run_codex(prompt, batch_schema, options)
      summaries = validate_batch_summary!(result["output"], batch)
      if options.dry_run
        puts "  batch output_hash=#{result["outputHash"]} summaries=#{summaries.length}"
        summaries.each { |summary| puts "  source=#{summary["sourcePath"]} content_chars=#{summary["content"].length}" }
        next
      end

      batch.zip(summaries).each do |session, summary|
        ingest_one_session(session, batch_schema, options, result: result, summary: summary, batch: batch, batch_index: batch_idx + 1)
      end
    rescue StandardError => e
      if options.batch_fallback_single && batch.length > 1
        warn "batch failed; falling back to single-session ingest: #{e.message}"
        batch.each { |session| ingest_one_session(session, single_schema, options) }
      else
        fields = {
          "batch" => true,
          "batchSize" => batch.length,
          "batchIndex" => batch_idx + 1,
          "batchSourcePaths" => batch.map { |session| session[:path] }
        }
        batch.each { |session| append_ingest_failure(options, session, e, fields) }
        raise
      end
    end
    if !options.dry_run && options.sleep_seconds.positive? && batch_idx < batches.length - 1
      puts "sleeping #{options.sleep_seconds}s before next Codex batch"
      sleep options.sleep_seconds
    end
  end
end

def append_reenrich_failure(options, session, error, fields = {})
  row = session[:replay_row] || {}
  meta = session[:meta]
  append_state(options.state_path, {
    "phase" => "re-enrich-ollama",
    "sessionId" => meta["id"],
    "status" => "failed",
    "originalMemoryId" => row["memoryId"],
    "project" => session[:project],
    "cwd" => meta["cwd"],
    "startedAt" => meta["timestamp"],
    "source" => session[:path],
    "error" => error.message,
    "failedAt" => now_iso
  }.merge(fields)) unless options.dry_run
end

def reenrich_one_session(session, schema, options, result: nil, summary: nil, batch: nil, batch_index: nil)
  row = session[:replay_row] || {}
  meta = session[:meta]
  state_fields = {}
  unless result && summary
    prompt = build_session_prompt(session, options.max_prompt_chars)
    result = run_codex(prompt, schema, options)
    summary = validate_summary!(result["output"], session)
  end
  state_fields = ingest_result_fields(result, batch: batch, batch_index: batch_index)
  if options.dry_run
    puts "  codex output_hash=#{result["outputHash"]} content_chars=#{summary["content"].length}"
    return nil
  end

  append_state(options.state_path, {
    "phase" => "re-enrich-ollama",
    "sessionId" => meta["id"],
    "status" => "pending",
    "originalMemoryId" => row["memoryId"],
    "project" => session[:project],
    "cwd" => meta["cwd"],
    "startedAt" => meta["timestamp"],
    "source" => session[:path],
    "pendingAt" => now_iso
  }.merge(state_fields))
  memory = remember(
    options.agentmemory_url,
    session,
    summary,
    extra_concepts: [
      "codex-reenriched",
      "ollama-replacement",
      "supersedes:#{row["memoryId"]}"
    ],
    extra_lines: [
      "SupersedesMemory: #{row["memoryId"]}",
      "ReenrichedFrom: replay-enrichment"
    ]
  )
  append_state(options.state_path, {
    "phase" => "re-enrich-ollama",
    "sessionId" => meta["id"],
    "status" => "remembered",
    "memoryId" => memory["id"],
    "originalMemoryId" => row["memoryId"],
    "project" => session[:project],
    "cwd" => meta["cwd"],
    "startedAt" => meta["timestamp"],
    "source" => session[:path],
    "rememberedAt" => now_iso
  }.merge(state_fields))
  puts "  memory=#{memory["id"]} supersedes=#{row["memoryId"]}"
  memory["id"]
rescue StandardError => e
  append_reenrich_failure(options, session, e, state_fields)
  raise
end

def command_reenrich_ollama(options)
  single_schema = schema_path(options, "codex-session-summary.schema.json")
  batch_schema = schema_path(options, "codex-session-summary-batch.schema.json")
  selected = select_reenrich_sessions(options).first(options.limit)
  batches = plan_ingest_batches(selected, options).first(options.max_codex_calls)
  runnable = batches.flatten
  puts "command=re-enrich-ollama"
  puts "state=#{options.state_path}"
  puts "replay_state=#{options.replay_state_path}"
  puts "dry_run=#{options.dry_run}"
  puts "codex_dry_run=#{options.codex_dry_run}"
  puts "batch_size=#{options.batch_size}"
  puts "sample_events=#{options.sample_events}"
  puts "max_batch_prompt_chars=#{options.max_batch_prompt_chars}"
  puts "batch_max_events=#{options.batch_max_events}"
  puts "sleep_seconds=#{options.sleep_seconds}"
  puts "selected=#{runnable.length}"
  puts "batches=#{batches.length}"
  batches.each_with_index do |batch, batch_idx|
    batch_prompt_chars = if batch.length == 1
      build_session_prompt(batch.first, options.max_prompt_chars).length
    else
      build_batch_session_prompt(batch, options).length
    end
    puts "batch[#{batch_idx + 1}/#{batches.length}] size=#{batch.length} events=#{batch.sum { |session| session_event_count(session) }} prompt_chars=#{batch_prompt_chars}"
    batch.each_with_index do |session, idx|
      row = session[:replay_row] || {}
      meta = session[:meta]
      sampled = session[:original_events] && session[:original_events] != session[:events].length ? " sampled=#{session[:events].length}" : ""
      puts "[#{idx + 1}/#{batch.length}] #{meta["id"]} original_memory=#{row["memoryId"]} project=#{session[:project]} cwd=#{meta["cwd"]} events=#{session_event_count(session)}#{sampled} started=#{meta["timestamp"]} source=#{session[:path]}"
    end
    next if options.dry_run && !options.codex_dry_run

    if batch.length == 1
      reenrich_one_session(batch.first, single_schema, options)
      next
    end

    begin
      prompt = build_batch_session_prompt(batch, options)
      result = run_codex(prompt, batch_schema, options)
      summaries = validate_batch_summary!(result["output"], batch)
      if options.dry_run
        puts "  batch output_hash=#{result["outputHash"]} summaries=#{summaries.length}"
        summaries.each { |summary| puts "  source=#{summary["sourcePath"]} content_chars=#{summary["content"].length}" }
        next
      end

      batch.zip(summaries).each do |session, summary|
        reenrich_one_session(session, batch_schema, options, result: result, summary: summary, batch: batch, batch_index: batch_idx + 1)
      end
    rescue StandardError => e
      if options.batch_fallback_single && batch.length > 1
        warn "batch failed; falling back to single-session re-enrich: #{e.message}"
        batch.each { |session| reenrich_one_session(session, single_schema, options) }
      else
        fields = {
          "batch" => true,
          "batchSize" => batch.length,
          "batchIndex" => batch_idx + 1,
          "batchSourcePaths" => batch.map { |session| session[:path] }
        }
        batch.each { |session| append_reenrich_failure(options, session, e, fields) }
        raise
      end
    end
    if !options.dry_run && options.sleep_seconds.positive? && batch_idx < batches.length - 1
      puts "sleeping #{options.sleep_seconds}s before next Codex batch"
      sleep options.sleep_seconds
    end
  end
end

def command_consolidate(options)
  schema = schema_path(options, "codex-consolidation-delta.schema.json")
  version = export_version(options.agentmemory_url)
  memories = fetch_pipeline_memories(options)
  puts "command=consolidate"
  puts "state=#{options.state_path}"
  puts "dry_run=#{options.dry_run}"
  puts "selected_memories=#{memories.length}"
  if memories.empty?
    puts "no_op=true"
    return
  end
  return if options.dry_run && !options.codex_dry_run

  prompt = build_consolidation_prompt(memories, version)
  result = run_codex(prompt, schema, options)
  export = validate_export_delta!(result["output"], "consolidate")
  delta = canonicalize_semantic(export, version)
  puts "semantic=#{delta["semanticMemories"].length}"
  puts "procedural=#{delta["proceduralMemories"].length}"
  puts "output_hash=#{result["outputHash"]}"
  return if options.dry_run

  response = import_delta(options.agentmemory_url, delta)
  append_state(options.state_path, {
    "phase" => "consolidate",
    "status" => response["success"] == true ? "imported" : "failed",
    "selectedMemoryIds" => memories.map { |memory| memory["id"] },
    "semantic" => delta["semanticMemories"].length,
    "procedural" => delta["proceduralMemories"].length,
    "importResponse" => response,
    "schema" => result["schema"],
    "promptHash" => result["promptHash"],
    "outputHash" => result["outputHash"],
    "importedAt" => now_iso
  })
  puts "import_success=#{response["success"]}"
end

def command_graph(options)
  schema = schema_path(options, "codex-graph-delta.schema.json")
  version = export_version(options.agentmemory_url)
  memories = fetch_pipeline_memories(options)
  puts "command=graph"
  puts "state=#{options.state_path}"
  puts "dry_run=#{options.dry_run}"
  puts "selected_memories=#{memories.length}"
  if memories.empty?
    puts "no_op=true"
    return
  end
  return if options.dry_run && !options.codex_dry_run

  prompt = build_graph_prompt(memories, version)
  result = run_codex(prompt, schema, options)
  export = validate_export_delta!(result["output"], "graph")
  delta = canonicalize_graph(export, version)
  puts "graph_nodes=#{delta["graphNodes"].length}"
  puts "graph_edges=#{delta["graphEdges"].length}"
  puts "output_hash=#{result["outputHash"]}"
  return if options.dry_run

  response = import_delta(options.agentmemory_url, delta)
  rebuild = options.snapshot_rebuild ? rebuild_graph_snapshot(options.agentmemory_url) : { "success" => true, "skipped" => true }
  append_state(options.state_path, {
    "phase" => "graph",
    "status" => response["success"] == true && rebuild["success"] == true ? "imported" : "failed",
    "selectedMemoryIds" => memories.map { |memory| memory["id"] },
    "graphNodes" => delta["graphNodes"].length,
    "graphEdges" => delta["graphEdges"].length,
    "importResponse" => response,
    "snapshotRebuild" => rebuild,
    "schema" => result["schema"],
    "promptHash" => result["promptHash"],
    "outputHash" => result["outputHash"],
    "importedAt" => now_iso
  })
  puts "import_success=#{response["success"]}"
  puts "snapshot_success=#{rebuild["success"]}"
  puts "snapshot_skipped=#{rebuild["skipped"] == true}"
end

def main(argv)
  command = argv.shift
  unless COMMANDS.include?(command)
    usage
    exit 2
  end

  options = parse_options(command, argv)
  env_file = load_env_file(File.expand_path("~/.agentmemory/.env"))
  UNSAFE_AGENTMEMORY_FLAGS.each do |key|
    if env_file[key] == "true" && !unsafe_flag_allowed?(key, command)
      raise "unsafe agentmemory flag enabled: #{key}=true"
    end
    if ENV[key] == "true" && !unsafe_flag_allowed?(key, command)
      raise "unsafe live environment flag enabled: #{key}=true"
    end
  end
  if env_file["OPENAI_BASE_URL"].to_s.include?("api.openai.com")
    raise "unsafe agentmemory provider configured: OPENAI_BASE_URL=#{env_file["OPENAI_BASE_URL"]}"
  end
  raise "trusted cwd missing: #{options.trusted_cwd}" unless File.directory?(options.trusted_cwd)
  raise "schema dir missing: #{options.schema_dir}" unless File.directory?(options.schema_dir)

  case command
  when "ingest-summaries"
    command_ingest(options)
  when "re-enrich-ollama"
    command_reenrich_ollama(options)
  when "consolidate"
    command_consolidate(options)
  when "graph"
    command_graph(options)
  end
end

main(ARGV)
