// Tianshu (天枢 / rivet harness) keeps the model it starts on in
// ~/.rivet/config.json, in two keys together: provider.default names the
// provider, and agent.defaultModel is "<providerKey>:<modelId>", where the
// model id must be one of that provider's own models.
//
// This module splits magpie's models by the software each one comes from
// (the part before "/" in its id) and registers one provider per software,
// "<software>-magpie", so a subscription's models sit in a channel of their
// own instead of one crowd. The routing group auto/<model> stays in the
// "magpie" provider: an id there is not one software's.
//
// The descriptor names no model and no prefix, so magpie writes no model
// itself and every key connect returns is written as it is (plugged.go: a
// descriptor with no model is a connect-only agent). That is what lets the
// provider key be one of many, and agent.defaultModel name any of them.
//
// A model's capacity is kept as rivet names it (contextWindow, maxTokens,
// supportsVision), not as magpie hands it over (context, output, images):
// a model magpie knows nothing about keeps its id alone, rather than a
// made-up capacity.
export const agent = {
  id: "tianshu",
  name: "Tianshu",
  // Tianshu's own command, which its installer puts on PATH
  // (~/…/tianshu-harness/dist/cli/entry.js behind a symlink). A plugin
  // must not name its config folder here to be detected: that folder is
  // evidence of the agent's settings, not of the agent.
  bin: "tianshu",
  config: "~/.rivet/config.json",
  format: "json",
  // usage names Tianshu's requests by these words of its User-Agent
  // (rivet sends "Tianshu/1.0 (terminal coding agent)…")
  ua: ["tianshu", "rivet"],
  notice:
    "Tianshu reads its config when a session starts: restart Tianshu or open a new session. 天枢在新的会话读取配置：重启天枢或新开会话后生效。",
  // No library: rivet's global skills are ~/.agents/skills and
  // ~/.rivet/skills, and ~/.agents/skills is already the Library's own
  // source, so the two share it. Naming ~/.rivet/skills here would
  // register the same skill twice.
  // No mcp: "tianshu" is not one of the MCP formats magpie can write, and
  // rivet's servers live under mcp.servers in this same file, in a shape
  // of their own.
};

// the provider the routing group's models stay in
const magpie = "magpie";
// every other provider is the software of "<software>/<model>", then this
const suffix = "-magpie";
// the one group that is not a software's: magpie's own routing group
const routing = "auto";

// keyFor names the provider a model id is registered under: one provider per
// software, and the routing group's own for auto/<model>. An id with no
// "<software>/" part names no software, so it stays in magpie's provider.
export function keyFor(id) {
  if (typeof id !== "string") return magpie;
  const at = id.indexOf("/");
  if (at <= 0 || at === id.length - 1) return magpie;
  const software = id.slice(0, at);
  if (software === routing) return magpie;
  // rivet spells a provider key in lower-case letters, digits and "-"
  const key = software.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return key ? key + suffix : magpie;
}

// shown is the name a provider carries in Tianshu's list, where its key is
// "workbuddy-magpie": "Workbuddy Magpie". The key stays lower-case, since
// Tianshu spells the model with it.
export function shown(key) {
  if (key === magpie) return "Magpie";
  const base = key.endsWith(suffix) ? key.slice(0, -suffix.length) : key;
  const words = base
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return (words.length ? words.join(" ") : "Magpie") + " Magpie";
}

// groups sorts magpie's models into the provider each is registered under,
// in the order each provider's first model turned up.
function groups(models) {
  const order = [];
  const byKey = new Map();
  for (const m of Array.isArray(models) ? models : []) {
    if (!m || typeof m.id !== "string" || !m.id) continue;
    const key = keyFor(m.id);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = [];
      byKey.set(key, bucket);
      order.push(key);
    }
    const entry = { id: m.id };
    // keep only what magpie knows, as rivet's own names for it
    if (Number.isInteger(m.context) && m.context > 0) entry.contextWindow = m.context;
    if (Number.isInteger(m.output) && m.output > 0) entry.maxTokens = m.output;
    if (m.images === true) entry.supportsVision = true;
    bucket.push(entry);
  }
  return order.map((key) => ({ key, models: byKey.get(key) }));
}

export function connect({ gateway, models }) {
  // A gateway without either half wires Tianshu to nothing, and its config
  // would be left pointing at nothing: fail before writing rather than after.
  if (!gateway || typeof gateway.v1 !== "string" || !gateway.v1) throw new Error("Magpie's gateway has no /v1 address to give Tianshu.");
  if (typeof gateway.key !== "string" || !gateway.key) throw new Error("Magpie's gateway has no key to give Tianshu.");

  // Every provider is written whole, so each one lists its own models again:
  // a model picked in Tianshu since is one of magpie's own.
  const out = {};
  const list = groups(models);
  for (const { key, models: mine } of list) {
    out[`provider.providers.${key}`] = {
      name: shown(key),
      baseUrl: gateway.v1,
      protocol: "openai",
      apiKey: gateway.key,
      // no models rather than an empty list, which rivet reads as a provider
      // that can serve nothing
      ...(mine.length ? { models: mine } : {}),
    };
  }

  // Tianshu starts on the first provider magpie offered a model in, and that
  // provider's first model: the two keys must agree, since agent.defaultModel
  // may name neither a missing provider nor a model that provider lacks.
  const first = list.find((g) => g.models.length);
  if (!first) return out;

  out["provider.default"] = first.key;
  out["agent.defaultModel"] = `${first.key}:${first.models[0].id}`;
  return out;
}
