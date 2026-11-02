import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api/client';
import { useExecution, useExecutions, useWorkflows } from '../api/hooks';
import type { N8nNode, Workflow } from '../api/types';
import { Icon } from '../components/Icon';
import { NodeIcon, Spinner, StatusChip, errMsg } from '../components/ui';
import { nodeIO, runOrder } from '../lib/execution';
import { preview, timeAgo } from '../lib/format';
import { aiLabel } from '../lib/ports';

const AGENT_TYPES = new Set(['@n8n/n8n-nodes-langchain.agent', '@n8n/n8n-nodes-langchain.agentTool', '@n8n/n8n-nodes-langchain.openAiAssistant']);
const CHAT = '@n8n/n8n-nodes-langchain.chatTrigger';

interface AgentInfo {
  key: string;
  wf: Workflow;
  agent: N8nNode;
  parts: Record<string, N8nNode[]>;
}

function findAgents(wfs: Workflow[]): AgentInfo[] {
  const out: AgentInfo[] = [];
  for (const wf of wfs) {
    if (wf.isArchived) continue;
    for (const agent of wf.nodes.filter((n) => AGENT_TYPES.has(n.type))) {
      const parts: Record<string, N8nNode[]> = {};
      for (const [src, byType] of Object.entries(wf.connections || {})) {
        for (const [type, outs] of Object.entries(byType)) {
          if (type === 'main') continue;
          if (outs.some((ts) => (ts ?? []).some((t) => t.node === agent.name))) {
            const n = wf.nodes.find((x) => x.name === src);
            if (n) (parts[type] ||= []).push(n);
          }
        }
      }
      out.push({ key: `${wf.id}:${agent.name}`, wf, agent, parts });
    }
  }
  return out;
}

export function AgentsPage() {
  const wfs = useWorkflows();
  const agents = useMemo(() => findAgents(wfs.data ?? []), [wfs.data]);
  const [sel, setSel] = useState<string | null>(null);
  const current = agents.find((a) => a.key === sel) ?? agents[0];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Workflows that contain an AI Agent</div>
          <h1>AI agents</h1>
        </div>
      </header>
      {wfs.isLoading && <div className="center"><Spinner /></div>}
      {!wfs.isLoading && agents.length === 0 && <div className="card empty">No workflow uses an AI Agent module yet. Add one from the editor (AI category).</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
        {agents.map((a) => {
          const on = current?.key === a.key;
          const tools = a.parts.ai_tool ?? [];
          return (
            <button key={a.key} type="button" onClick={() => setSel(a.key)} aria-pressed={on} className="card"
              style={{ textAlign: 'left', padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, border: on ? '2px solid var(--accent)' : undefined }}>
              <span className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 15.5 }}>{a.wf.name}</span>
                <span className={`chip ${a.wf.active ? 'ok' : ''}`}>{a.wf.active ? 'Live' : 'Inactive'}</span>
              </span>
              <span className="small muted">{a.agent.name}{a.parts.ai_languageModel?.[0] ? ` · ${a.parts.ai_languageModel[0].name}` : ''}</span>
              <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                {tools.length ? tools.map((t) => <NodeIcon key={t.name} type={t.type} size={30} title={t.name} />) : <span className="small muted">No tools</span>}
              </span>
            </button>
          );
        })}
      </div>
      {current && <AgentDetail key={current.key} info={current} />}
    </div>
  );
}

function Part({ label, nodes }: { label: string; nodes?: N8nNode[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      {nodes?.length ? <NodeIcon type={nodes[0].type} size={52} /> : <span className="mod" style={{ width: 52, height: 52, background: 'var(--sunken)', color: 'var(--muted)' }}>—</span>}
      <span className="small" style={{ fontWeight: 700 }}>{label}</span>
      <span className="small muted">{nodes?.map((n) => n.name).join(', ') || 'None'}</span>
    </div>
  );
}

function AgentDetail({ info }: { info: AgentInfo }) {
  const { wf, agent, parts } = info;
  const execs = useExecutions({ workflowId: wf.id }, { pageSize: 10 });
  const list = execs.data?.pages[0]?.data ?? [];
  const [execId, setExecId] = useState<string | null>(null);
  const shownId = execId ?? list[0]?.id ?? null;
  const exec = useExecution(shownId);
  const hasChat = wf.nodes.some((n) => n.type === CHAT && !n.disabled);
  const extra = Object.keys(parts).filter((t) => !['ai_languageModel', 'ai_memory', 'ai_tool'].includes(t));

  return (
    <div className="row wrap" style={{ alignItems: 'stretch', gap: 20 }}>
      <section className="card pad" style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><h2>{agent.name}</h2><div className="small muted">How this agent is wired</div></div>
          <Link className="btn" to={`/workflows/${wf.id}`}>Open in editor</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12, alignItems: 'center' }}>
          <Part label="Model" nodes={parts.ai_languageModel} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 92, height: 92, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#fff', boxShadow: '0 0 0 8px var(--accent-soft)' }}><Icon name="agents" size={38} stroke={1.8} /></span>
            <span style={{ fontWeight: 700 }}>AI Agent</span>
          </div>
          <Part label="Memory" nodes={parts.ai_memory} />
        </div>
        <div>
          <h3 style={{ marginBottom: 10 }}>Tools</h3>
          <div className="row wrap">
            {(parts.ai_tool ?? []).map((t) => <span key={t.name} className="chip" style={{ height: 34, paddingLeft: 4 }}><NodeIcon type={t.type} size={26} />{t.name}</span>)}
            {!(parts.ai_tool ?? []).length && <span className="small muted">No tools connected.</span>}
          </div>
          {extra.map((t) => <div key={t} className="small muted" style={{ marginTop: 8 }}>{aiLabel(t)}: {parts[t].map((n) => n.name).join(', ')}</div>)}
        </div>
      </section>

      <section className="card pad" style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Recent runs</h2>
          <Link to={`/executions?workflowId=${wf.id}`} className="small">All runs</Link>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {list.map((e) => (
            <button key={e.id} type="button" className={`chip ${e.id === shownId ? 'live' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setExecId(e.id)}>
              #{e.id} · {timeAgo(e.startedAt ?? e.createdAt)}
            </button>
          ))}
          {!execs.isLoading && list.length === 0 && <span className="small muted">No runs yet.</span>}
        </div>
        {exec.data && (
          <>
            <StatusChip status={exec.data.status} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {runOrder(exec.data).map(({ name, info: r }) => {
                const io = nodeIO(exec.data, name);
                const out = io?.outputs[0]?.[0]?.json;
                const node = (exec.data!.workflowData?.nodes ?? wf.nodes).find((n) => n.name === name);
                return (
                  <div key={name} className="row" style={{ alignItems: 'flex-start' }}>
                    <NodeIcon type={node?.type ?? ''} size={28} />
                    <div className="grow" style={{ padding: '8px 10px', borderRadius: 10, background: r.state === 'error' ? 'var(--bad-soft)' : node?.name === agent.name ? 'var(--accent-soft)' : 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div className="small" style={{ fontWeight: 700 }}>{name} <span className="muted" style={{ fontWeight: 400 }}>· {r.items} items</span></div>
                      <div className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {r.error ?? (out ? preview(out.output ?? out.text ?? out.response ?? out, 400) : '')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {hasChat && <ChatBox wf={wf} />}
      </section>
    </div>
  );
}

function ChatBox({ wf }: { wf: Workflow }) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [msgs, setMsgs] = useState<Array<{ who: 'me' | 'agent' | 'error'; text: string }>>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText('');
    setMsgs((m) => [...m, { who: 'me', text: message }]);
    setBusy(true);
    try {
      const res = await request<Record<string, unknown> | string>('POST', `/api/chat/${wf.id}`, { message, sessionId });
      const reply = typeof res === 'string' ? res : String(res?.output ?? res?.text ?? JSON.stringify(res));
      setMsgs((m) => [...m, { who: 'agent', text: reply }]);
    } catch (err) {
      setMsgs((m) => [...m, { who: 'error', text: errMsg(err) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ borderTop: '1px dashed var(--border-strong)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3>Chat with this agent</h3>
      {!wf.active && <div className="notice small">Publish the workflow to enable its chat endpoint.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
        {msgs.map((m, i) => (
          <div key={i} className="small" style={{ alignSelf: m.who === 'me' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap',
            background: m.who === 'me' ? 'var(--accent)' : m.who === 'error' ? 'var(--bad-soft)' : 'var(--sunken)', color: m.who === 'me' ? 'var(--accent-ink)' : m.who === 'error' ? 'var(--bad-text)' : 'var(--ink)' }}>
            {m.text}
          </div>
        ))}
        {busy && <span className="small muted">Thinking…</span>}
      </div>
      <form className="row" onSubmit={send}>
        <label className="sr-only" htmlFor="chat-in">Message</label>
        <input id="chat-in" className="input" placeholder="Send a message" value={text} onChange={(e) => setText(e.target.value)} disabled={!wf.active} />
        <button type="submit" className="btn primary" disabled={busy || !wf.active || !text.trim()}><Icon name="send" size={16} />Send</button>
      </form>
    </div>
  );
}
