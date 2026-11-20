import { IconCheck, IconPlayerPlay, IconTestPipe, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { SavedTest, TestOutcome } from "./api";
import { Empty, PageHead, errorText, plural } from "./ui";

/** Saved tests and their last results, shared by the tool page and the Tests page. */
export function useTests(tool?: string) {
  const [tests, setTests] = useState<SavedTest[]>([]);
  const [results, setResults] = useState<Record<string, TestOutcome>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => api.tests().then((data) => setTests(data.tests)), []);
  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  const shown = tool ? tests.filter((test) => test.tool === tool) : tests;

  const run = useCallback(
    async (ids?: string[]) => {
      setBusy(true);
      setError(null);
      try {
        const { results: next } = await api.runTests(ids ?? (tool ? tests.filter((test) => test.tool === tool).map((test) => test.id) : undefined));
        setResults((prev) => ({ ...prev, ...Object.fromEntries(next.map((result) => [result.id, result])) }));
      } catch (cause) {
        setError(errorText(cause));
      } finally {
        setBusy(false);
      }
    },
    [tests, tool],
  );

  const save = useCallback(async (test: Partial<SavedTest> & { tool: string }) => {
    const { test: saved } = await api.saveTest(test);
    await reload();
    return saved;
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await api.removeTest(id);
    await reload();
  }, [reload]);

  return { tests: shown, results, busy, error, run, save, remove };
}

function Mark({ result }: { result: TestOutcome | undefined }) {
  if (!result) return <span className="dot" title="Not run yet" />;
  return result.ok ? <IconCheck size={14} stroke={2.5} style={{ color: "var(--cable)" }} aria-label="Passed" /> : <IconX size={14} stroke={2.5} style={{ color: "var(--fault)" }} aria-label="Failed" />;
}

/** The saved tests of one tool, shown under its run form. */
export function ToolTests({ state }: { state: ReturnType<typeof useTests> }) {
  const { tests, results, busy, error, run, remove } = state;
  if (tests.length === 0) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="section-title">
          Saved tests <span className="muted small">{tests.length}</span>
        </h2>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run()}>
          <IconPlayerPlay size={13} stroke={2} /> {busy ? "Running" : "Run all"}
        </button>
      </div>
      {error ? <p className="panel-pad small fault">{error}</p> : null}
      {tests.map((test) => (
        <div className="test-row" key={test.id}>
          <Mark result={results[test.id]} />
          <span className="grow">
            <span className="truncate" style={{ display: "block", fontSize: 13 }}>{test.name}</span>
            {results[test.id] && !results[test.id]?.ok ? <span className="small fault">{results[test.id]?.reason}</span> : null}
          </span>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Run ${test.name}`} disabled={busy} onClick={() => void run([test.id])}>
            <IconPlayerPlay size={13} stroke={2} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Delete ${test.name}`} onClick={() => void remove(test.id)}>
            <IconTrash size={13} stroke={1.75} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Row({ test, result, state }: { test: SavedTest; result: TestOutcome | undefined; state: ReturnType<typeof useTests> }) {
  const [open, setOpen] = useState(false);
  const [contains, setContains] = useState(test.contains ?? "");
  const changed = contains.trim() !== (test.contains ?? "");
  return (
    <div className="test-block">
      <div className="test-row">
        <Mark result={result} />
        <button type="button" className="grow test-open" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <span className="truncate" style={{ display: "block", fontSize: 13.5 }}>{test.name}</span>
          <span className="small muted mono truncate" style={{ display: "block" }}>{JSON.stringify(test.arguments)}</span>
        </button>
        {result ? <span className="num">{result.ms} ms</span> : null}
        <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Run ${test.name}`} disabled={state.busy} onClick={() => void state.run([test.id])}>
          <IconPlayerPlay size={13} stroke={2} />
        </button>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Delete ${test.name}`} onClick={() => void state.remove(test.id)}>
          <IconTrash size={13} stroke={1.75} />
        </button>
      </div>
      {result && !result.ok ? <p className="small fault" style={{ padding: "0 16px 10px 40px" }}>{result.reason}</p> : null}
      {open ? (
        <div className="test-detail">
          <div className="field">
            <label htmlFor={`contains-${test.id}`}>
              The result must contain <span className="optional">leave empty to only check it does not fail</span>
            </label>
            <div className="row">
              <input id={`contains-${test.id}`} className="input grow" value={contains} onChange={(event) => setContains(event.target.value)} placeholder="For example Lisbon" />
              <button type="button" className="btn btn-outline btn-sm" disabled={!changed} onClick={() => void state.save({ ...test, contains })}>
                Save
              </button>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={test.expectError === true} onChange={(event) => void state.save({ ...test, expectError: event.target.checked })} />
            This call should fail (for example a missing or wrong input)
          </label>
          {result ? (
            <>
              <div className="muted small">Last result</div>
              <pre className="code">{result.output}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Every saved test of the open MCP server, with one button to run them all. */
export function TestsPage() {
  const state = useTests();
  const { tests, results, busy, error, run } = state;
  const ran = tests.filter((test) => results[test.id]);
  const passed = ran.filter((test) => results[test.id]?.ok).length;
  const tools = [...new Set(tests.map((test) => test.tool))];

  return (
    <div className="page">
      <PageHead
        title="Tests"
        lede="Saved calls of your tools and what they should give back. Run them after every change, here or with plugmcp test in a terminal or in CI."
      >
        {ran.length ? <span className={`pill ${passed === ran.length ? "pill-ok" : "pill-fault"}`}>{passed} of {ran.length} passed</span> : null}
        <button type="button" className="btn btn-primary" disabled={busy || tests.length === 0} onClick={() => void run()}>
          <IconPlayerPlay size={15} stroke={2} /> {busy ? "Running" : `Run ${plural(tests.length, "test")}`}
        </button>
      </PageHead>
      {error ? <p className="small fault">{error}</p> : null}
      {tests.length === 0 ? (
        <Empty icon={IconTestPipe} title="No tests yet" actions={<a className="btn btn-primary" href="#/tools">Open a tool</a>}>
          Run a tool with real input, then press Save as test. The call is kept with its input, and you can say what the result must contain.
        </Empty>
      ) : (
        tools.map((tool) => (
          <section key={tool}>
            <div className="section-head">
              <h2 className="section-title mono">{tool}</h2>
              <a className="link small" href={`#/tools/${tool}`}>
                Open the tool
              </a>
            </div>
            <div className="panel">
              {tests
                .filter((test) => test.tool === tool)
                .map((test) => (
                  <Row key={`${test.id}:${test.contains ?? ""}`} test={test} result={results[test.id]} state={state} />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
