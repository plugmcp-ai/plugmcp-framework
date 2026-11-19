import { IconExternalLink, IconPlus, IconSearch, IconStar, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { DirectoryServer, RemoteServer } from "./api";

/** Listings come from READMEs and can carry markup. Show plain words. */
const clean = (text: string | undefined) =>
  (text ?? "")
    .replace(/<[^>]*>?/g, " ")
    .replace(/[#*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function Directory() {
  const [query, setQuery] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [results, setResults] = useState<DirectoryServer[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<RemoteServer[]>([]);
  const [notice, setNotice] = useState<{ slug: string; text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const latest = useRef(0);

  const refreshAdded = () => api.servers().then((next) => setAdded(next.servers));

  useEffect(() => {
    void refreshAdded();
  }, []);

  // Wait for a pause in typing so the directory is not asked on every key.
  useEffect(() => {
    const ticket = ++latest.current;
    setLoading(true);
    const timer = setTimeout(
      () => {
        api
          .directory(query.trim(), remoteOnly)
          .then((data) => {
            if (ticket !== latest.current) return;
            setResults(data.servers);
            setTotal(data.total);
            setError(null);
          })
          .catch((cause: unknown) => ticket === latest.current && setError(cause instanceof Error ? cause.message : String(cause)))
          .finally(() => ticket === latest.current && setLoading(false));
      },
      query ? 450 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, remoteOnly]);

  async function add(server: DirectoryServer) {
    setPending(server.slug);
    setNotice(null);
    try {
      await api.addServer({ slug: server.slug });
      await refreshAdded();
      setNotice({ slug: server.slug, ok: true, text: "Added. Its tools are in the Chat tab now." });
    } catch (cause) {
      setNotice({ slug: server.slug, ok: false, text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Directory</h1>
        <p className="note">
          Search the PlugMCP directory before you build. Hosted servers can join your chat so you can try them next to your own.
        </p>
      </div>

      <div className="search">
        <IconSearch size={18} stroke={1.75} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search servers, for example github or postgres" aria-label="Search the directory" autoFocus />
      </div>
      <label className="check">
        <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} />
        Only servers I can add to the chat
      </label>

      {added.length ? (
        <section>
          <h3>In your chat</h3>
          <ul className="list">
            {added.map((server) => (
              <li key={server.name} className="list-row">
                <div className="grow">
                  <div className="list-title">{server.name}</div>
                  <div className={`note${server.ok ? "" : " fault"}`}>
                    {server.ok ? `${server.tools.length} tool${server.tools.length === 1 ? "" : "s"}` : `Not reachable: ${server.error}`}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${server.name}`}
                  onClick={async () => {
                    await api.removeServer(server.name);
                    await refreshAdded();
                  }}
                >
                  <IconTrash size={16} stroke={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3>
          {query ? "Results" : "Popular"}
          {total !== null && query ? <span className="meta">{total.toLocaleString()} found</span> : null}
        </h3>
        {error ? <p className="note fault">{error}</p> : null}
        {!error && !loading && results.length === 0 ? (
          <p className="note">Nothing matched. That may be a gap worth filling with your own server.</p>
        ) : null}
        <ul className={`cards${loading ? " is-loading" : ""}`}>
          {results.map((server) => (
            <li key={server.slug} className="card">
              <div className="card-top">
                <a className="card-title" href={server.url} target="_blank" rel="noopener">
                  {server.name} <IconExternalLink size={14} stroke={1.75} />
                </a>
                {server.stars ? (
                  <span className="meta">
                    <IconStar size={13} stroke={1.75} /> {server.stars.toLocaleString()}
                  </span>
                ) : null}
              </div>
              <p className="card-text clamp-3">{clean(server.summary)}</p>
              <div className="card-foot">
                <div className="tags">
                  {server.verified ? <span className="pill pill-ok">Verified</span> : null}
                  {server.remote ? <span className="pill">Hosted</span> : <span className="pill">Runs locally</span>}
                </div>
                {server.remote ? (
                  <button className="btn btn-secondary btn-small" disabled={pending === server.slug} onClick={() => void add(server)}>
                    <IconPlus size={14} stroke={2} /> {pending === server.slug ? "Adding" : "Add to chat"}
                  </button>
                ) : (
                  <a className="btn btn-ghost btn-small" href={server.url} target="_blank" rel="noopener">
                    Install steps
                  </a>
                )}
              </div>
              {notice?.slug === server.slug ? <p className={`note${notice.ok ? " ok" : " fault"}`}>{notice.text}</p> : null}
            </li>
          ))}
        </ul>
        <p className="note">
          <a className="link" href={`https://plugmcp.ai/mcp${query ? `?q=${encodeURIComponent(query)}` : ""}`} target="_blank" rel="noopener">
            See everything on plugmcp.ai
          </a>
        </p>
      </section>
    </div>
  );
}
