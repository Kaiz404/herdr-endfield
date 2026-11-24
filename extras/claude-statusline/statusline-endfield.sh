#!/usr/bin/env bash
# Claude Code statusline, Endfield style. ANSI 16 colours only, so the terminal theme decides the hues.
# Also writes a per-session sidecar for Herdr's Endfield skin:
#   ~/.config/herdr-app/data/endfield/sessions/<session_id>.json
# rate_limits (the account's 5-hour and 7-day usage) rides along for the HUD footer.
# One gawk process does the parsing (no jq, no git): forks are what make Git Bash slow.

exec 2>/dev/null

dir="$HOME/.config/herdr-app/data/endfield/sessions"
[ -d "$dir" ] || mkdir -p "$dir"
tmp="$dir/.tmp-$$"

{ IFS= read -r sid; IFS= read -r line; } < <(awk -v term="$HC_TERMINAL_ID" -v tmp="$tmp" '
function obj(s, key,    i, n, d, c, q, start) {
  if (!match(s, "\"" key "\"[[:space:]]*:[[:space:]]*\\{")) return ""
  start = RSTART + RLENGTH - 1; n = length(s); d = 0; q = 0
  for (i = start; i <= n; i++) {
    c = substr(s, i, 1)
    if (q) { if (c == "\\") i++; else if (c == "\"") q = 0; continue }
    if (c == "\"") q = 1
    else if (c == "{") d++
    else if (c == "}" && --d == 0) return substr(s, start, i - start + 1)
  }
  return ""
}
function str(s, key,    v) {
  if (!match(s, "\"" key "\"[[:space:]]*:[[:space:]]*\"([^\"\\\\]|\\\\.)*\"")) return ""
  v = substr(s, RSTART, RLENGTH); sub(/^"[^"]*"[[:space:]]*:[[:space:]]*"/, "", v)
  return substr(v, 1, length(v) - 1)
}
function num(s, key,    v) {
  if (!match(s, "\"" key "\"[[:space:]]*:[[:space:]]*-?[0-9][0-9.eE+-]*")) return ""
  v = substr(s, RSTART, RLENGTH); sub(/^"[^"]*"[[:space:]]*:[[:space:]]*/, "", v)
  return v + 0
}
function unesc(s) { gsub(/\\\\/, "\\", s); gsub(/\\"/, "\"", s); return s }
function jstr(s) { return s == "" ? "null" : "\"" s "\"" }
function jnum(v) { return v == "" ? "null" : v }
function jwin(o) { return o == "" ? "null" : "{\"used_percentage\":" jnum(num(o, "used_percentage")) ",\"resets_at\":" jnum(num(o, "resets_at")) "}" }
function firstline(path,    l) { l = ""; if ((getline l < path) > 0) {}; close(path); sub(/[\r\n].*/, "", l); return l }
function branch(cwd,    d, h, g, p) {
  d = cwd; gsub(/\\/, "/", d); sub(/\/+$/, "", d)
  while (d != "") {
    h = firstline(d "/.git/HEAD")
    if (h == "") {
      g = firstline(d "/.git")
      if (g ~ /^gitdir: /) { p = substr(g, 9); if (p !~ /^([A-Za-z]:)?\//) p = d "/" p; h = firstline(p "/HEAD") }
    }
    if (h != "") { if (sub(/^ref: refs\/heads\//, "", h)) return h; return substr(h, 1, 7) }
    if (d !~ /\//) break
    sub(/\/[^\/]*$/, "", d)
  }
  return ""
}
function left(r,    d) {
  if (r == "") return ""
  d = r - systime(); if (d < 0) d = 0
  if (d >= 86400) return sprintf("%dd%dh", int(d / 86400), int(d % 86400 / 3600))
  if (d >= 3600) return sprintf("%dh%dm", int(d / 3600), int(d % 3600 / 60))
  return sprintf("%dm", int(d / 60))
}
function toks(n) {
  if (n >= 1000000) return B sprintf("%.1f", n / 1000000) R D "m" R
  if (n >= 1000) return B sprintf("%.1f", n / 1000) R D "k" R
  return B sprintf("%d", n) R
}
function quota(label, o,    p, l, s) {
  p = num(o, "used_percentage"); if (p == "") return ""
  s = D label R " " (p >= 80 ? Y : "") B sprintf("%.0f", p) R D "%" R
  l = left(num(o, "resets_at")); if (l != "") s = s " " D l " left" R
  return s
}
BEGIN { RS = "\001"; E = "\033["; R = E "0m"; B = E "1m"; D = E "90m"; Y = E "33m" }
{
  j = $0
  sid = str(j, "session_id"); if (sid !~ /^[A-Za-z0-9_-]+$/) sid = ""
  cwd_raw = str(j, "cwd"); if (cwd_raw == "") cwd_raw = str(obj(j, "workspace"), "current_dir")
  cwd = unesc(cwd_raw)
  m = obj(j, "model"); model_id = str(m, "id"); model = unesc(str(m, "display_name")); if (model == "") model = "unknown"
  effort = str(obj(j, "effort"), "level")
  cw = obj(j, "context_window"); total = num(cw, "context_window_size"); pct = num(cw, "used_percentage")
  cu = obj(cw, "current_usage"); used = ""
  if (cu != "") used = num(cu, "input_tokens") + num(cu, "cache_creation_input_tokens") + num(cu, "cache_read_input_tokens")
  else if (pct != "" && total != "") used = int(pct * total / 100 + 0.5)
  intok = num(cw, "total_input_tokens"); if (intok == "") intok = 0
  cost = num(obj(j, "cost"), "total_cost_usd")
  rl = obj(j, "rate_limits")

  base = cwd; gsub(/\\/, "/", base); sub(/\/+$/, "", base); sub(/.*\//, "", base)
  br = branch(cwd)
  dot = " " D "\302\267" R " "

  s = D "//" R " " B base R
  if (br != "") s = s " " D "\356\202\240" R " " br
  s = s dot model
  if (effort != "") s = s " " D toupper(substr(effort, 1, 1)) substr(effort, 2) R
  if (pct != "") {
    f = int(pct / 10 + 0.5); if (f > 10) f = 10
    hot = pct >= 75
    g = (hot ? E "31m" : E "34m"); for (i = 0; i < f; i++) g = g "\342\226\260"
    g = g R D; for (i = f; i < 10; i++) g = g "\342\226\261"
    s = s dot D "ctx" R " " g R " " (hot ? Y : "") B sprintf("%.0f", pct) R D "%" R
  } else s = s dot D "ctx n/a" R
  s = s dot D "in" R " " toks(intok)
  q5 = quota("5h", obj(rl, "five_hour")); if (q5 != "") s = s dot q5
  q7 = quota("7d", obj(rl, "seven_day")); if (q7 != "") s = s dot q7

  if (sid != "") {
    printf "{\"session_id\":\"%s\",\"terminal\":%s,\"cwd\":%s,\"transcript_path\":%s,", sid, jstr(term), jstr(cwd_raw), jstr(str(j, "transcript_path")) > tmp
    printf "\"model\":{\"id\":%s,\"display_name\":%s},\"effort\":%s,", jstr(model_id), jstr(str(m, "display_name")), jstr(effort) > tmp
    printf "\"context\":{\"used\":%s,\"total\":%s,\"pct\":%s},", jnum(used), jnum(total), jnum(pct) > tmp
    printf "\"rate_limits\":%s,", (rl == "" ? "null" : "{\"five_hour\":" jwin(obj(rl, "five_hour")) ",\"seven_day\":" jwin(obj(rl, "seven_day")) "}") > tmp
    printf "\"cost_usd\":%s,\"updated_at\":\"%s\"}\n", jnum(cost), strftime("%Y-%m-%dT%H:%M:%SZ", systime(), 1) > tmp
    close(tmp)
  }
  print sid; print s
}')

[ -n "$sid" ] && mv -f "$tmp" "$dir/$sid.json" || rm -f "$tmp"
printf '%s' "$line"
