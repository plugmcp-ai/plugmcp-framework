import { IconListDetails, IconTrash } from "@tabler/icons-react";
import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import type { Logs as LogData } from "../api";
import { Empty, PageHead, Seg } from "../ui";

const show = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));

export function Logs() {
  const [data, setData] = useState<LogData | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "failed">("all");

  useEffect(() => {
    const load = () => document.visibilityState === "visible" && void api.logs().then(setData).catch(() => undefined);
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  const calls = (data?.calls ?? []).filter((call) => filter === "all" || !call.ok);

  return (
    <div className="page">
      <PageHead title="Logs" lede="Every tool call this dev server has handled, from the Studio, your editor or any other connected client. Kept in memory until you stop the server.">
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: `All ${data?.total ?? 0}` },
            { id: "failed", label: `Failed ${data?.failed ?? 0}` },
          ]}
        />
        {data?.calls.length ? (
          <button type="button" className="btn btn-ghost" onClick={() => void api.clearLogs().then(setData)}>
            <IconTrash size={15} stroke={1.75} /> Clear
          </button>
        ) : null}
      </PageHead>

      {calls.length === 0 ? (
        <Empty icon={IconListDetails} title={filter === "failed" ? "No failed calls" : "No calls yet"} actions={<a className="btn btn-outline" href="#/tools">Run a tool</a>}>
          {filter === "failed" ? "Calls that return an error show up here with their input and the error text." : "Run a tool or send a chat message and the call appears here with its input, result and time."}
        </Empty>
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Tool</th>
                <th className="hide-sm">Server</th>
                <th>Time</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <Fragment key={call.id}>
                  <tr className="is-click" onClick={() => setOpen(open === call.id ? null : call.id)} aria-expanded={open === call.id}>
                    <td>
                      <span className={`dot ${call.ok ? "dot-ok" : "dot-error"}`} style={{ display: "inline-block" }} aria-label={call.ok ? "OK" : "Failed"} />
                    </td>
                    <td className="mono">{call.tool}</td>
                    <td className="muted hide-sm">{call.server === "local" ? "This server" : call.server}</td>
                    <td className="num">{call.ms} ms</td>
                    <td className="num">{new Date(call.at).toLocaleTimeString()}</td>
                  </tr>
                  {open === call.id ? (
                    <tr>
                      <td />
                      <td colSpan={4}>
                        <div className="log-detail">
                          <div>
                            <div className="label">Input</div>
                            <pre className="code">{show(call.input)}</pre>
                          </div>
                          <div>
                            <div className="label">{call.ok ? "Result" : "Error"}</div>
                            <pre className={`code${call.ok ? "" : " fault"}`}>{show(call.output)}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
