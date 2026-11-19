import { IconExternalLink, IconPlus, IconSearch, IconStar, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { DirectoryServer } from "../api";
import { useStudio } from "../state";
import { Glyph, PageHead, errorText, plural } from "../ui";

/** Listings come from READMEs and can carry markup. Show plain words. */
const clean = (text: string | undefined) =>
  (text ?? "")
    .replace(/<[^>]*>?/g, " ")
    .replace(/[#*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Most listings come from GitHub, so the owner's picture stands in as a logo. */
function Logo({ server }: { server: DirectoryServer }) {
  const owner = /^io\.github\.([A-Za-z0-9-]+)$/.exec(server.publisher ?? "")?.[1];
  const [failed, setFailed] = useState(false);
  if (!owner || failed) return <Glyph name={server.name} />;
  return <img className="glyph logo" src={`https://github.com/${owner}.png?size=72`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

const PICKS = 4;
const SHOWN = 8;

export function DirectoryPage() {
  const { remote, reloadRemote } = useStudio();
  const [query, setQuery] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [results, setResults] = useState<DirectoryServer[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ slug: string; text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const latest = useRef(0);

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
          .catch((cause: unknown) => ticket === latest.current && setError(errorText(cause)))
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
      await reloadRemote();
      setNotice({ slug: server.slug, ok: true, text: "Added. Its tools are in the chat now." });
    } catch (cause) {
      setNotice({ slug: server.slug, ok: false, text: errorText(cause) });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="page">
      <PageHead
        title="Directory"
        lede="A few servers from the PlugMCP directory to try next to your own. The full directory, with every server and its install steps, is on plugmcp.ai."
      >
        <a className="btn btn-outline" href={`https://plugmcp.ai/mcp${query ? `?q=${encodeURIComponent(query)}` : ""}`} target="_blank" rel="noopener">
          Browse all on plugmcp.ai <IconExternalLink size={14} stroke={1.75} />
        </a>
      </PageHead>

      <div className="stack">
        <div className="search search-lg">
          <IconSearch size={18} stroke={1.75} />
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search servers, for example github or postgres" aria-label="Search the directory" autoFocus />
        </div>
        <label className="check">
          <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} />
          Only hosted servers I can add to the chat
        </label>
      </div>

      {remote.length ? (
        <section>
          <h2 className="section-title" style={{ marginBottom: 10 }}>In your chat</h2>
          <ul className="panel rows">
            {remote.map((server) => (
              <li key={server.name} className="rowlink">
                <Glyph name={server.name} />
                <div className="grow">
                  <div className="row-title">{server.name}</div>
                  <div className={`row-sub${server.ok ? "" : " fault"}`}>{server.ok ? plural(server.tools.length, "tool") : `Not reachable: ${server.error}`}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  aria-label={`Remove ${server.name}`}
                  onClick={async () => {
                    await api.removeServer(server.name);
                    await reloadRemote();
                  }}
                >
                  <IconTrash size={15} stroke={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="section-head">
          <h2 className="section-title">{query ? "Results" : "Popular on PlugMCP"}</h2>
          {total !== null && query ? <span className="muted small">{total.toLocaleString()} found</span> : null}
        </div>
        {error ? <p className="small fault">{error}</p> : null}
        {!error && !loading && results.length === 0 ? <p className="muted">Nothing matched. That may be a gap worth filling with your own server.</p> : null}
        <ul className={`cards${loading ? " is-loading" : ""}`}>
          {results.slice(0, query ? SHOWN : PICKS).map((server) => (
            <li key={server.slug} className="card">
              <div className="row">
                <Logo server={server} />
                <a className="card-title grow truncate" href={server.url} target="_blank" rel="noopener">
                  <span className="truncate">{server.name}</span> <IconExternalLink size={13} stroke={1.75} />
                </a>
                {server.stars ? (
                  <span className="num row" style={{ gap: 3 }}>
                    <IconStar size={12} stroke={1.75} /> {server.stars.toLocaleString()}
                  </span>
                ) : null}
              </div>
              <p className="card-text clamp-3">{clean(server.summary)}</p>
              <div className="card-foot">
                <div className="row">
                  {server.verified ? <span className="pill pill-ok">Verified</span> : null}
                  <span className="pill">{server.remote ? "Hosted" : "Runs locally"}</span>
                </div>
                {server.remote ? (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={pending === server.slug} onClick={() => void add(server)}>
                    <IconPlus size={13} stroke={2} /> {pending === server.slug ? "Adding" : "Add to chat"}
                  </button>
                ) : (
                  <a className="btn btn-ghost btn-sm" href={server.url} target="_blank" rel="noopener">
                    Install steps
                  </a>
                )}
              </div>
              {notice?.slug === server.slug ? <p className={`small ${notice.ok ? "ok" : "fault"}`}>{notice.text}</p> : null}
            </li>
          ))}
        </ul>
        {!error && results.length ? (
          <a className="more-link" href={`https://plugmcp.ai/mcp${query ? `?q=${encodeURIComponent(query)}` : ""}`} target="_blank" rel="noopener">
            {query && total !== null && total > SHOWN ? `See all ${total.toLocaleString()} results on plugmcp.ai` : `See all ${total !== null ? `${total.toLocaleString()} ` : ""}servers on plugmcp.ai`}
            <IconExternalLink size={14} stroke={1.75} />
          </a>
        ) : null}
      </section>
    </div>
  );
}
