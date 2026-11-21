import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { agent, connect, keyFor, shown } from "./tianshu.agent.js";

const gateway = { url: "http://127.0.0.1:3425", v1: "http://127.0.0.1:3425/v1", key: "magpie-tianshu" };
const providers = (out) => Object.fromEntries(Object.entries(out).filter(([k]) => k.startsWith("provider.providers.")).map(([k, v]) => [k.slice("provider.providers.".length), v]));

test("says where Tianshu keeps its model", () => {
  assert.equal(agent.id, "tianshu");
  assert.equal(agent.config, "~/.rivet/config.json");
  assert.equal(agent.format, "json");
});

test("names no model and no prefix, so magpie writes no model itself", () => {
  // a descriptor with a model makes magpie write agent.defaultModel as its
  // own prefix + the id (one provider only); naming neither leaves every
  // key connect returns written as it is, which is what lets the split hold
  assert.equal(agent.model, undefined);
  assert.equal(agent.prefix, undefined);
});

test("is detected by Tianshu's own command, not by its config folder", () => {
  // agent.dir would make magpie take ~/.rivet for an install on its own;
  // the folder is where Tianshu keeps its settings, not evidence it is here
  assert.equal(agent.bin, "tianshu");
  assert.equal(agent.dir, undefined);
});

test("names Tianshu's requests in usage by its User-Agent", () => {
  assert.deepEqual(agent.ua, ["tianshu", "rivet"]);
});

test("the package declares this module as its agent, and gives its own picture", async () => {
  const pkg = await readFile(new URL("./package.json", import.meta.url), "utf8").then(JSON.parse);
  assert.equal(pkg.magpie.agent, "./tianshu.agent.js");
  // a plugin installed from a path has no package name for the market to
  // match, so its icon has to come from the package itself
  assert.match(pkg.magpie.icon, /^data:image\/png;base64,/);
  assert.deepEqual(pkg.files.filter((f) => /\.m?js$/.test(f)), ["tianshu.agent.js"]);
  assert.equal(pkg.main, undefined);
  assert.equal(pkg.dependencies, undefined);
});

test("gives each software its own provider, and the routing group magpie's", () => {
  assert.equal(keyFor("workbuddy/deepseek-v4.1-flash"), "workbuddy-magpie");
  assert.equal(keyFor("codex/gpt-6.2-sol"), "codex-magpie");
  assert.equal(keyFor("minimax-code/MiniMax-M3"), "minimax-code-magpie");
  assert.equal(keyFor("auto/minimax-m3.1-flash"), "magpie");
  // an id with no software part names none, so it stays where magpie's own do
  assert.equal(keyFor("opaque"), "magpie");
  assert.equal(keyFor("/leading"), "magpie");
  assert.equal(keyFor("trailing/"), "magpie");
  // rivet's provider keys are lower-case letters, digits and "-"
  assert.equal(keyFor("WorkBuddy/some-model"), "workbuddy-magpie");
});

test("shows a provider by a readable name, and keeps its key lower-case", () => {
  assert.equal(shown("workbuddy-magpie"), "Workbuddy Magpie");
  assert.equal(shown("minimax-code-magpie"), "Minimax Code Magpie");
  assert.equal(shown("magpie"), "Magpie");
});

test("points every provider at magpie as an OpenAI-compatible one", () => {
  const out = connect({
    gateway,
    models: [{ id: "workbuddy/deepseek-v4.1-flash" }, { id: "auto/minimax-m3.1-flash" }],
  });
  const p = providers(out);
  assert.deepEqual(Object.keys(p).sort(), ["magpie", "workbuddy-magpie"]);
  assert.deepEqual(p["workbuddy-magpie"], {
    name: "Workbuddy Magpie",
    baseUrl: "http://127.0.0.1:3425/v1",
    protocol: "openai",
    apiKey: "magpie-tianshu",
    models: [{ id: "workbuddy/deepseek-v4.1-flash" }],
  });
  assert.deepEqual(p.magpie, {
    name: "Magpie",
    baseUrl: "http://127.0.0.1:3425/v1",
    protocol: "openai",
    apiKey: "magpie-tianshu",
    models: [{ id: "auto/minimax-m3.1-flash" }],
  });
});

test("keeps magpie's provider to the routing group alone", () => {
  const out = connect({
    gateway,
    models: [
      { id: "auto/minimax-m3.1-flash" },
      { id: "workbuddy/auto" },
      { id: "codex/gpt-6.2-sol" },
      { id: "doubao/doubao-auto" },
    ],
  });
  assert.deepEqual(providers(out).magpie.models.map((m) => m.id), ["auto/minimax-m3.1-flash"]);
  assert.deepEqual(providers(out)["workbuddy-magpie"].models.map((m) => m.id), ["workbuddy/auto"]);
  assert.deepEqual(providers(out)["codex-magpie"].models.map((m) => m.id), ["codex/gpt-6.2-sol"]);
  assert.deepEqual(providers(out)["doubao-magpie"].models.map((m) => m.id), ["doubao/doubao-auto"]);
});

test("keeps a model's capacity under rivet's names for it", () => {
  const out = connect({
    gateway,
    models: [{ id: "workbuddy/deepseek-v4.1-flash", name: "DeepSeek Flash", context: 1000000, output: 393216, images: true, efforts: ["high", "max"] }],
  });
  assert.deepEqual(providers(out)["workbuddy-magpie"].models, [
    { id: "workbuddy/deepseek-v4.1-flash", contextWindow: 1000000, maxTokens: 393216, supportsVision: true },
  ]);
});

test("writes no capacity it does not know", () => {
  const out = connect({ gateway, models: [{ id: "workbuddy/opaque-model" }] });
  assert.deepEqual(providers(out)["workbuddy-magpie"].models, [{ id: "workbuddy/opaque-model" }]);
});

test("a model magpie gives no capacity for is not written as zero", () => {
  // magpie fills a model it knows nothing about with 0s (#plugged.go), and
  // rivet reads 0 as no capacity budget at all
  const out = connect({ gateway, models: [{ id: "workbuddy/deepseek-v4.1-flash", context: 0, output: 0, images: false }] });
  assert.deepEqual(providers(out)["workbuddy-magpie"].models, [{ id: "workbuddy/deepseek-v4.1-flash" }]);
});

test("lists every model of a provider again, since each provider is written whole", () => {
  const out = connect({
    gateway,
    models: [
      { id: "workbuddy/one", context: 1000, output: 100 },
      { id: "workbuddy/two", context: 2000, output: 200 },
    ],
  });
  assert.deepEqual(
    providers(out)["workbuddy-magpie"].models.map((m) => m.id),
    ["workbuddy/one", "workbuddy/two"],
  );
});

test("starts Tianshu on a provider that exists, carrying a model it has", () => {
  const out = connect({
    gateway,
    models: [{ id: "codex/gpt-6.2-sol" }, { id: "workbuddy/deepseek-v4.1-flash" }],
  });
  // both keys must agree: agent.defaultModel may name neither a missing
  // provider nor a model that provider does not carry
  assert.equal(out["provider.default"], "codex-magpie");
  assert.equal(out["agent.defaultModel"], "codex-magpie:codex/gpt-6.2-sol");
  const key = out["provider.default"];
  assert.ok(providers(out)[key].models.some((m) => m.id === "codex/gpt-6.2-sol"));
});

test("points Tianshu at a whole model id, not a bare one", () => {
  // the id keeps its "<software>/" part: that is how magpie names the model
  const out = connect({ gateway, models: [{ id: "minimax-code/MiniMax-M3" }] });
  assert.equal(out["agent.defaultModel"], "minimax-code-magpie:minimax-code/MiniMax-M3");
});

test("writes no model at all when magpie offers none", () => {
  const out = connect({ gateway, models: [] });
  assert.deepEqual(out, {});
});

test("refuses to point Tianshu at a gateway it was given no address or key for", () => {
  assert.throws(() => connect({ gateway: { key: "k" }, models: [] }), /no \/v1 address/);
  assert.throws(() => connect({ gateway: { v1: "http://127.0.0.1:3425/v1" }, models: [] }), /no key/);
});
