(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const all = (value) => Array.isArray(value) ? value : [];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const num = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—';
  const text = (value) => typeof value === 'string' ? value : value === null || value === undefined ? '' : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value, null, 2);
  const shorten = (value, limit = 180) => { const result = text(value).trim(); return result.length > limit ? `${result.slice(0, limit)}…` : result; };
  const state = { data: window.FLOVA_REVIEW, caseId: '', view: 'list', filters: { q: '', group: 'all', outcome: 'all', unknown: false, review: false, sort: 'newest', page: 1, size: 20 }, drawerFocus: null, toastTimer: null, catalogScroll: 0, lastListCaseId: '', routeSignature: '', detailRequest: 0, detailCache: new Map(), pendingDetails: new Map() };
  const roleNames = { user: '用户', assistant: '助手', system: '系统', developer: '开发者', tool: '工具' };
  const statusNames = { P: '满足', F: '未满足', U: '证据未明', 'N/A': '不适用', pass: '通过', fail: '未通过', undetermined: '未决', rated: '已分档', NG: '未准入' };
  const publicLabels = { title: '标题', name: '名称', status: '状态', reason: '原因', observation: '观察', observed_value: '观察结果', statement: '标准', description: '说明', target: '对象', operation: '操作', success: '成功', data: '返回内容', results: '结果', count: '数量', total: '合计', message: '消息', note: '说明', notes: '说明', missing_evidence: '缺失证据', evidence_id: '证据', locator: '位置', quote: '原文', rule_ref: '计分规则', points: '分数', score: '分档', rating: '分档', applicability: '适用条件', admission: '准入', admission_reason: '准入原因', rating_reason: '分档原因', low_quality_defect_anchor: '0 · 低质', satisfactory_anchor: '1 · 达标', high_quality_bonus_anchor: '2 · 高质' };

  function caseList() { return Array.isArray(state.data?.cases) ? state.data.cases : Object.values(state.data?.cases || {}); }
  function currentCase() { return state.detailCache.get(state.caseId) || caseList().find((item) => item.id === state.caseId) || null; }
  function statusClass(status) { return ['P', 'pass', 'rated'].includes(status) ? 'pass' : ['F', 'fail', 'NG'].includes(status) ? 'fail' : 'unknown'; }
  function pill(status, label = '') { return `<span class="status-pill ${statusClass(status)}">${esc(label || `${statusNames[status] || status}${['P', 'F', 'U'].includes(status) ? ` ${status}` : ''}`)}</span>`; }
  function rawDetails(label, value) { return `<details class="advanced"><summary>${esc(label)}</summary><pre class="raw-json">${esc(JSON.stringify(value, null, 2))}</pre></details>`; }
  function plain(value, className = '') { return `<p class="preserve-lines ${className}">${esc(text(value))}</p>`; }
  function identifier(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-'); }
  function evidenceValue(evidenceId, pointer = '', item = currentCase()) {
    let value = item?.evidence?.[evidenceId]?.record;
    if (!value || (pointer && !pointer.startsWith('/'))) return undefined;
    for (const token of pointer ? pointer.slice(1).split('/') : []) {
      const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
      if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
      value = value[key];
    }
    return value;
  }

  // Markdown is parsed from text only; source HTML is always escaped.
  function inlineMarkdown(value) {
    let output = esc(value);
    const tokens = [];
    const token = (html) => { const key = `\u0000${tokens.length}\u0000`; tokens.push(html); return key; };
    output = output.replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${code}</code>`));
    output = output.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => token(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`));
    output = output.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    output = output.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,，。；;!?！？”)])/g, '$1<em>$2</em>');
    return output.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
  }
  function splitTable(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|')); }
  function tableRule(line) { return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line); }
  function markdown(value) {
    const lines = text(value).replace(/\r\n?/g, '\n').split('\n');
    const result = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      if (/^\s*```/.test(line)) {
        const code = [];
        index += 1;
        while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
        index += 1;
        result.push(`<pre class="code-block"><code>${esc(code.join('\n'))}</code></pre>`);
        continue;
      }
      if (index + 1 < lines.length && line.includes('|') && tableRule(lines[index + 1])) {
        const header = splitTable(line);
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(splitTable(lines[index++]));
        result.push(`<div class="markdown-table-wrap" tabindex="0" role="region" aria-label="表格，可横向滚动"><table><thead><tr>${header.map((cell) => `<th scope="col">${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${header.map((_, cell) => `<td>${inlineMarkdown(row[cell] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      if (heading) { const level = Math.min(6, heading[1].length + 2); result.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); index += 1; continue; }
      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { result.push('<hr>'); index += 1; continue; }
      const listStart = line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
      if (listStart) {
        const ordered = /^\d/.test(listStart[1]);
        const entries = [];
        while (index < lines.length) {
          const entry = lines[index].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
          if (!entry || /^\d/.test(entry[1]) !== ordered) break;
          entries.push(inlineMarkdown(entry[2])); index += 1;
        }
        const tag = ordered ? 'ol' : 'ul';
        result.push(`<${tag}>${entries.map((entry) => `<li>${entry}</li>`).join('')}</${tag}>`); continue;
      }
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
        result.push(`<blockquote>${quote.map(inlineMarkdown).join('<br>')}</blockquote>`); continue;
      }
      const paragraph = [line]; index += 1;
      while (index < lines.length && lines[index].trim() && !/^\s*(?:#{1,6}\s|```|[-+*]\s|\d+[.)]\s|>)/.test(lines[index]) && !(index + 1 < lines.length && lines[index].includes('|') && tableRule(lines[index + 1]))) paragraph.push(lines[index++]);
      result.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
    }
    return `<div class="markdown-content">${result.join('')}</div>`;
  }

  function readable(value) {
    if (value === undefined || value === null || value === '') return '<span class="muted">未提供</span>';
    if (Array.isArray(value)) return `<ul>${value.map((entry) => `<li>${readable(entry)}</li>`).join('')}</ul>`;
    if (typeof value === 'object') return `<dl class="readable-fields">${Object.entries(value).filter(([key]) => !/^(?:raw|encrypted.*|thinking|reasoning|signature)$/i.test(key)).map(([key, entry]) => `<div><dt>${esc(publicLabels[key] || key)}</dt><dd>${readable(entry)}</dd></div>`).join('')}</dl>`;
    return `<span class="preserve-lines">${esc(typeof value === 'boolean' ? (value ? '是' : '否') : value)}</span>`;
  }
  function dateLabel(value) {
    if (!value) return '日期未记录';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)} · 北京时间`;
  }
  function section(id, order, title, note, body) {
    return `<section class="section-card" id="${id}" aria-labelledby="heading-${id}"><header class="section-heading"><span class="section-number">${String(order).padStart(2, '0')}</span><div><h2 class="section-title" id="heading-${id}">${esc(title)}</h2>${note ? `<p class="section-note">${esc(note)}</p>` : ''}</div></header>${body}</section>`;
  }

  function historyMessages(item = currentCase()) { return all(item?.history?.messages).filter((message) => !message.isCurrent); }
  function messageText(message) { return text(message?.text || all(message?.parts).filter((part) => ['text', 'public_text'].includes(part.kind || part.type)).map((part) => part.text || part.content || '').join('\n\n')); }
  function publicPart(part) {
    if (!part || typeof part !== 'object') return plain(part);
    const kind = part.kind || part.type || '记录';
    if (/reasoning|thinking|encrypted/i.test(kind)) return '';
    if (['text', 'public_text'].includes(kind)) return plain(part.text || part.content || '');
    const activity = part.activity || part;
    const name = activity.display_name || activity.name || activity.tool_name || kind;
    return `<details class="message-tool"><summary>${esc(name)} · 工具 / 附件记录</summary>${readable(activity)}</details>`;
  }
  function messageCard(message, preview = false) {
    const id = String(message.id || message.message_id || '');
    const source = `history-${identifier(id)}`;
    const body = messageText(message);
    const parts = all(message.parts).filter((part) => !['text', 'public_text'].includes(part.kind || part.type));
    return `<article class="history-message role-${esc(message.role || 'assistant')}"${preview ? '' : ` id="${source}"`}><div class="message-meta"><strong>${esc(roleNames[message.role] || message.role || '消息')}</strong><time datetime="${esc(message.createdAt || '')}">${esc(dateLabel(message.createdAt))}</time><button class="source-link" type="button" data-action="source" data-source="${esc(id)}" aria-label="查看${esc(roleNames[message.role] || '消息')}完整原文">原文 ↗</button></div><div class="message-copy">${plain(preview ? shorten(body.replace(/\*\*|__/g, '').replace(/\s+/g, ' '), 160) : body || '（此消息没有公开文本，工具记录见下方。）')}${!preview && parts.length ? `<details class="message-parts"><summary>工具与附件（${parts.length}）</summary>${parts.map(publicPart).join('')}</details>` : ''}</div></article>`;
  }
  function renderContext(item) {
    const messages = historyMessages(item);
    const count = item.history?.count ?? messages.length;
    const preview = messages.slice(-2);
    const materials = all(item.advanced?.sourceCase?.sources).filter((source) => source.kind !== 'current_user_request');
    const materialCards = materials.map((source) => {
      const content = source.record?.content || {};
      const title = content.snapshot?.title || `${content.media_type || '参考'}素材 · ${content.resource_id || source.id}`;
      return `<button class="artifact-card context-material" type="button" data-action="source" data-source="${esc(source.id)}" aria-haspopup="dialog"><span class="artifact-icon" aria-hidden="true">▧</span><span><strong>${esc(title)}</strong><small>${content.snapshot ? '用户附带的提示词草稿 · 打开完整内容' : '任务引用的历史素材 · 打开元数据'}</small></span><span aria-hidden="true">↗</span></button>`;
    }).join('');
    return section('context', 1, '上文轨迹与引用材料', `当前指令之前有 ${num(count)} 条公开消息${materials.length ? `，另有 ${num(materials.length)} 份引用材料` : ''}。完整原文随时可查。`, `<div class="history-preview">${preview.map((message) => messageCard(message, true)).join('') || '<p class="muted">此任务没有前序公开消息。</p>'}</div>${messages.length ? `<details class="full-history" id="full-history"><summary>展开全部 ${num(count)} 条前序消息</summary><div class="history-full">${messages.map((message) => messageCard(message)).join('')}</div></details>` : ''}${materials.length ? `<div class="context-materials"><h3>本轮引用的上下文材料</h3><p class="section-note">以下是用户输入与历史参考，供理解任务及生成 Rubrics。</p>${materialCards}</div>` : ''}`);
  }
  function renderInstruction(item) {
    const source = all(item.advanced?.sourceCase?.sources).find((entry) => entry.kind === 'current_user_request');
    return section('instruction', 2, '当前轮用户指令', '', `<div class="current-query"><div class="message-meta"><strong>用户 · 当前指令</strong>${item.currentQueryCreatedAt ? `<time datetime="${esc(item.currentQueryCreatedAt)}">${esc(dateLabel(item.currentQueryCreatedAt))}</time>` : ''}${source ? `<button type="button" class="source-link" data-action="source" data-source="${esc(source.id)}">完整指令与附件 ↗</button>` : ''}</div>${plain(item.currentQuery)}</div>`);
  }

  function textParts(item) {
    return all(item.response?.allTextParts).map((part) => typeof part === 'string' ? part : part?.text || part?.content || '').filter(Boolean);
  }
  function artifactList(item = currentCase()) {
    const artifacts = item.response?.artifacts;
    return Array.isArray(artifacts) ? artifacts : artifacts && typeof artifacts === 'object' ? Object.entries(artifacts).map(([id, artifact]) => typeof artifact === 'string' ? { id, text: artifact } : { id, ...artifact }) : [];
  }
  function artifactText(artifact) { return text(artifact?.text || artifact?.content || artifact?.fullText || artifact?.body || evidenceValue(artifact?.evidenceId, artifact?.contentPointer || '/content/content') || ''); }
  function artifactTitle(artifact) { return artifact.title || artifact.name || artifact.displayName || artifact.display_name || '本轮完整产物'; }
  function renderArtifactCards(item) {
    return artifactList(item).map((artifact, index) => `<button type="button" class="artifact-card" data-action="artifact" data-artifact="${index}" aria-haspopup="dialog"><span class="artifact-icon" aria-hidden="true">▤</span><span><strong>${esc(artifactTitle(artifact))}</strong><small>${num(artifactText(artifact).length)} 字符 · 打开完整产物正文</small></span><span aria-hidden="true">↗</span></button>`).join('');
  }
  function renderMediaReferences(item) {
    const refs = all(item.response?.mediaReferences);
    if (!refs.length) return '';
    return `<div class="media-references"><h3>媒体与资源记录 <span>${refs.length}</span></h3><p class="section-note">打开可查看资源标识、可用性与取证记录。</p><div class="media-reference-grid">${refs.map((ref) => `<button type="button" class="artifact-card media-reference" data-action="source" data-source="${esc(ref.evidenceId)}" aria-haspopup="dialog"><span class="artifact-icon" aria-hidden="true">◇</span><span><strong>${esc(ref.title || ref.id || '媒体资源')}</strong><small>${esc(ref.mediaType || '媒体')} · ${ref.rawMediaAttached ? '有媒体字节' : '未取得媒体字节'}${ref.inspectionPerformed ? ' · 有检查记录' : ''}</small></span><span aria-hidden="true">↗</span></button>`).join('')}</div></div>`;
  }
  function renderResponse(item) {
    const response = item.response || {};
    const parts = textParts(item);
    const finalText = response.finalText || parts.at(-1) || response.fullText || '';
    const count = item.execution?.expectedCount ?? all(item.execution?.segments).length;
    return section('response', 3, '模型 Response 与产物', '先看最终答复与产物，再按需展开这一轮的执行过程。', `<div class="response-copy"><div class="message-meta"><strong>助手 · 最终答复</strong>${response.createdAt ? `<time datetime="${esc(response.createdAt)}">${esc(dateLabel(response.createdAt))}</time>` : ''}<button type="button" class="source-link" data-action="source" data-source="E_FINAL_RESPONSE">完整回复与附件 ↗</button></div>${markdown(finalText || '未记录最终公开文本。')}</div>${renderArtifactCards(item)}${renderMediaReferences(item)}${!artifactList(item).length ? `<p class="no-artifact">${esc(response.artifactNote || '本次取证包未收录可直接展开的独立文本产物；媒体与项目状态依据见下方执行轨迹。')}</p>` : ''}${parts.length > 1 ? `<details class="all-public-text"><summary>这一轮的全部公开文本（${parts.length} 段）</summary>${parts.map((part, index) => `<article class="public-text-part"><div class="message-meta">公开文本 ${index + 1}${index === parts.length - 1 ? ' · 最终答复' : ''}</div>${markdown(part)}</article>`).join('')}</details>` : ''}<details class="execution-trace" id="current-execution"><summary class="trace-toggle"><span>本轮执行轨迹</span><small>${num(count)} 条执行记录 · 工具调用与边界</small></summary>${renderTrace(item)}</details>`);
  }

  const toolNames = { skill_manage: '管理技能', document_view: '读取文档', node_create: '创建项目节点', project_query: '查询项目资源', inspect_media_content: '检查媒体内容', resource_specialist: '委派资源处理', skill_search: '查找技能', document_create: '创建文档', document_edit: '编辑文档', edit_document: '编辑文档', write_document: '写入文档', get_document: '读取文档', read_document: '读取文档', search: '搜索', image_generate: '生成图像', image_generation: '生成图像', transparency_diagnosis: '透明度诊断' };
  function parseValue(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }
  function toolName(name) { return toolNames[name] ? `${toolNames[name]} · ${name}` : name || '工具调用'; }
  function argSummary(value) {
    const args = parseValue(value);
    if (!args || typeof args !== 'object') return shorten(args, 200);
    if (args.request && typeof args.request === 'object') {
      const request = args.request;
      return [request.mode ? `查询模式：${request.mode}` : '', all(request.resource_ids).length ? `资源：${request.resource_ids.join('；')}` : '', request.query ? `检索：${request.query}` : ''].filter(Boolean).join('\n') || '查询项目资源；完整参数可展开查看。';
    }
    if (Array.isArray(args.analyses)) return `检查 ${args.analyses.length} 项资源\n问题：${shorten(args.analyses[0]?.question || '', 180)}\n资源：${args.analyses.map((entry) => entry.resource_id || entry.id || '').filter(Boolean).join('；')}`;
    if (args.operation && typeof args.operation === 'object') {
      const operation = args.operation;
      return [operation.type || operation.operation || operation.action ? `操作：${operation.type || operation.operation || operation.action}` : '', operation.target || operation.document_id ? `文档：${operation.target || operation.document_id}` : '', operation.title ? `标题：${operation.title}` : '', operation.content || operation.text ? `正文：${text(operation.content || operation.text).length} 字符（完整参数可展开）` : ''].filter(Boolean).join('\n') || '文档编辑；完整参数可展开查看。';
    }
    if (Array.isArray(args.nodes)) return `创建 ${args.nodes.length} 个节点\n${args.nodes.map((node) => `${node.title || node.name || node.type || node.node_type || '项目节点'}${node.parent_id ? ` · 父节点 ${node.parent_id}` : ''}`).join('\n')}`;
    const priority = ['query', 'search_query', 'objective', 'title', 'name', 'action', 'skill_key', 'operation', 'document_id', 'document_node_id', 'node_id', 'resource_id', 'asset_id', 'target', 'target_id', 'path', 'prompt', 'description'];
    const entries = priority.filter((key) => args[key] !== null && args[key] !== undefined).map((key) => [key, args[key]]);
    if (!entries.length) entries.push(...Object.entries(args).filter(([key]) => !/content|text|body|base64|bytes/i.test(key)).slice(0, 3));
    const labels = { action: '操作', skill_key: '技能', query: '检索', search_query: '检索', objective: '目标', title: '标题', operation: '操作', document_id: '文档', document_node_id: '文档', node_id: '节点', resource_id: '资源', asset_id: '资产', target: '对象', target_id: '对象', path: '路径', prompt: '生成要求', description: '说明' };
    return entries.slice(0, 3).map(([key, value]) => `${labels[key] || key}：${shorten(value, 160)}`).join('\n') || (Object.keys(args).length ? `已记录 ${Object.keys(args).length} 个参数；完整参数可展开查看。` : '无参数');
  }
  function resultSummary(value) {
    const parsed = parseValue(value);
    if (typeof parsed === 'string') return shorten(parsed, 420);
    if (!parsed || typeof parsed !== 'object') return text(parsed);
    const lines = [];
    const visit = (entry, depth = 0) => {
      if (!entry || typeof entry !== 'object' || depth > 3 || lines.length >= 6) return;
      for (const key of ['status', 'search_status', 'success', 'error', 'message', 'note', 'summary', 'diagnosis', 'result', 'graph_changed']) {
        if (entry[key] !== undefined && entry[key] !== null && (typeof entry[key] !== 'object' || key === 'error')) {
          const label = { status: '状态', search_status: '检索状态', success: '成功', error: '错误', message: '返回说明', note: '说明', summary: '摘要', diagnosis: '诊断', result: '结果', graph_changed: '项目图变化' }[key];
          lines.push(`${label}：${shorten(typeof entry[key] === 'boolean' ? entry[key] ? '是' : '否' : entry[key], 220)}`);
        }
      }
      for (const key of ['candidates', 'results', 'artifacts', 'documents', 'items']) {
        if (Array.isArray(entry[key])) {
          const names = entry[key].map((item) => typeof item === 'string' ? item : item.skill_name || item.title || item.name || item.resource_id || item.node_id || item.id || '').filter(Boolean);
          lines.push(`返回 ${entry[key].length} 项${names.length ? `：${names.slice(0, 4).join('；')}${names.length > 4 ? '…' : ''}` : ''}`);
        }
      }
      if (entry.data) visit(parseValue(entry.data), depth + 1);
      if (Array.isArray(entry.content)) entry.content.filter((part) => part.type === 'text' || part.kind === 'text').forEach((part) => visit(parseValue(part.text), depth + 1));
    };
    visit(parsed);
    return [...new Set(lines)].slice(0, 6).join('\n') || shorten(parsed, 450);
  }
  function resultStatus(content) {
    const serialized = text(parseValue(content));
    if (/"(?:success|ok)"\s*:\s*false|"(?:status|search_status)"\s*:\s*"(?:error|failed|failure)"/.test(serialized)) return '工具返回错误';
    if (/"(?:success|ok)"\s*:\s*true|"(?:status|search_status)"\s*:\s*"(?:success|completed|ok)"/.test(serialized)) return '工具成功返回';
    return '工具已返回';
  }
  function renderTrace(item) {
    const segments = all(item.execution?.segments);
    return `${all(item.execution?.notes).length ? `<p class="section-note">${esc(all(item.execution.notes).join(' '))}</p>` : ''}<ol class="trace-list">${segments.map((segment, index) => {
      const kind = segment.kind || '公开段';
      const calls = all(segment.tool_calls).map((call) => ({ ...call, arguments: call.arguments ?? (call.argumentsRef ? evidenceValue(call.argumentsRef.evidenceId, call.argumentsRef.pointer, item) : undefined) }));
      const payload = segment.content ?? evidenceValue(segment.evidenceId, segment.contentPointer || '/content', item);
      const isContext = kind === 'context_update';
      const isResult = kind.includes('result') || (!calls.length && (segment.tool_name || segment.call_id));
      const title = kind === 'delegate_report' ? '子任务回报（正文未公开）' : isContext ? '运行时上下文更新' : calls.length ? calls.map((call) => toolName(call.name)).join('；') : isResult ? toolName(segment.tool_name) : kind.includes('text') || kind.includes('response') ? '助手公开文本' : kind;
      const body = kind === 'delegate_report' ? plain('档案保留了这段回报的边界，没有提供公开正文。') : isContext ? plain('运行时更新的边界已保留，正文未收录在公开执行记录中。') : calls.length ? calls.map((call) => `<div class="trace-call">${calls.length > 1 ? `<h4>${esc(toolName(call.name))}</h4>` : ''}${plain(argSummary(call.arguments), 'trace-argument-summary')}<p class="trace-meta">${esc(call.call_id ? `调用 ${call.call_id}` : '')}</p>${rawDetails('高级：完整调用参数', parseValue(call.arguments))}</div>`).join('') : isResult ? `<div class="trace-result">${plain(resultSummary(payload))}<details class="advanced"><summary>查看完整公开工具结果</summary>${readable(parseValue(payload))}</details></div>` : markdown(segment.text || payload || segment.note || '该公开段没有文本内容。');
      return `<li class="trace-item${isContext ? ' trace-context' : ''}" id="trace-${index + 1}"><span class="trace-marker">${num(segment.seq ?? index + 1)}</span><div class="trace-body"><div class="trace-heading"><strong>${esc(title)}</strong>${isResult ? `<span class="trace-meta">${esc(resultStatus(payload))}</span>` : ''}</div><p class="trace-meta">${esc(dateLabel(segment.created_at || segment.createdAt))}${isContext ? ' · 仅标记边界，正文未公开' : ''}</p>${body}</div></li>`;
    }).join('')}</ol>`;
  }

  function refId(ref) { return String(ref?.source_id || ref?.evidence_id || ref?.id || ''); }
  function quoteText(ref) { return Object.prototype.hasOwnProperty.call(ref, 'quote') ? (typeof ref.quote === 'string' ? ref.quote : JSON.stringify(ref.quote)) : ''; }
  function citationNote(ref) {
    const rule = ref.citationVerification?.rule;
    if (!rule || rule === 'exact_string_substring') return '';
    const labels = { markdown_visible_exact: '已按 Markdown 可见文字精确校验', typed_scalar_exact: '已按原字段类型精确校验', typed_container_exact: '已按原 JSON 对象精确校验', json_fragment_subset: '已按 JSON 字段精确校验', same_record_unique_exact_quote: '已唯一定位原文', single_nonexistent_wrapper_segment_delete: '已校验并定位原字段' };
    return `<p class="citation-proof">${esc(labels[rule] || '引用已通过程序定位校验')} · 不改变原判或分数${ref.originalLocator && ref.originalLocator !== ref.locator ? `<small>模型原位置：${esc(ref.originalLocator)}</small>` : ''}</p>`;
  }
  function evidenceReferences(refs, title = '') {
    const entries = all(refs);
    if (!entries.length) return '';
    return `${title ? `<h4>${esc(title)}</h4>` : ''}<div class="evidence-list">${entries.map((ref) => `<blockquote class="evidence-quote">${quoteText(ref) ? plain(quoteText(ref)) : ref.observation || ref.supports ? plain(ref.observation || ref.supports) : ''}${quoteText(ref) && (ref.observation || ref.supports) ? `<p class="evidence-note">${esc(ref.observation || ref.supports)}</p>` : ''}${citationNote(ref)}<footer><button class="source-link" type="button" data-action="source" data-source="${esc(refId(ref))}" data-quote="${esc(quoteText(ref))}" data-locator="${esc(ref.locator || '')}" aria-haspopup="dialog">${esc(refId(ref) || '查看来源')} ↗</button>${ref.locator ? `<span class="evidence-locator">${esc(ref.locator)}</span>` : ''}</footer></blockquote>`).join('')}</div>`;
  }
  function anchorBlocks(anchors) {
    if (!anchors) return '';
    const entries = Array.isArray(anchors) ? anchors : [{ anchors }];
    return entries.map((entry) => `<div class="anchor-group">${entries.length > 1 ? `<h5>${esc(entry.criterionId || '')} 判定锚点</h5>` : ''}<dl class="anchor-list">${Object.entries(entry.anchors || entry).filter(([key]) => ['P', 'F', 'U', 'N/A', '0', '1', '2'].includes(key)).map(([key, value]) => `<div><dt>${['0', '1', '2'].includes(key) ? esc(`${key} · ${['低质', '达标', '高质'][Number(key)]}`) : pill(key)}</dt><dd>${readable(value)}</dd></div>`).join('')}</dl></div>`).join('');
  }
  function scoreLabel(row) {
    if (row.status === 'N/A') return '<strong>—</strong><span>不计入适用预算</span>';
    if (Number(row.scoreLower) === Number(row.scoreUpper)) return `<strong>${num(row.scoreLower)}</strong><span> / ${num(row.budget)} 分</span>`;
    return `<strong>${num(row.scoreLower)}–${num(row.scoreUpper)}</strong><span> / ${num(row.budget)} 分</span><small>含未决上限</small>`;
  }
  function renderCheck(check) {
    return `<article class="check-row"><div class="check-heading"><strong><code>${esc(check.id || '')}</code> ${esc(check.title || '子项检查')}</strong>${pill(check.status)}</div>${check.observedValue ? `<p><span class="muted">观察结果：</span>${esc(text(check.observedValue))}</p>` : ''}${check.reason ? plain(check.reason) : ''}${evidenceReferences(check.citations)}${all(check.missingEvidence).length ? `<p class="missing-evidence">缺失：${esc(check.missingEvidence.map(text).join('；'))}</p>` : ''}</article>`;
  }
  function renderRubricRow(row, index) {
    const alphaReasons = { C1: '没有实际修复产物可核验，真实透明结果仍缺证据。', C2: '没有交付修复版本，无法核对标题设计是否保留。', C3: '最终只给出诊断和外部工具建议，没有交付可用成品。', C4: '如实说明修复未完成，没有虚报成功。', C5: '现有证据既不能证明非目标资源受损，也不能证明已完整保护。' };
    const previewReason = currentCase()?.id === 'transparent-title' ? alphaReasons[row.id] || row.reason : row.reason;
    return `<details class="rubric-row status-${statusClass(row.status)}" id="rubric-${identifier(row.id)}"><summary class="rubric-main"><div class="rubric-name"><span class="rubric-index">${String(index + 1).padStart(2, '0')}</span><h3>${esc(row.title)}</h3><span class="rubric-kind">${row.must === false ? '偏好' : '必要'}</span>${row.statement && row.statement !== row.title ? `<p class="rubric-standard">${esc(row.statement)}</p>` : ''}</div><div class="rubric-score">${pill(row.status)}<div>${scoreLabel(row)}</div></div><div class="rubric-reason"><p>${esc(shorten(previewReason, 150))}</p><span class="row-expand">展开判据与证据 <span aria-hidden="true">⌄</span></span></div></summary><div class="rubric-details"><h4>判定理由</h4>${plain(row.reason)}${row.criterionIds?.length > 1 ? '<p class="section-note">以下子项用于诊断，本行统一计分。</p>' : ''}${all(row.checks).length ? `<div class="check-list">${row.checks.map(renderCheck).join('')}</div>` : '<p class="section-note">该项未另列子检查；以判定理由、证据和缺失项为准。</p>'}${row.anchors ? `<details class="anchor-details"><summary>查看通过 / 未满足 / 未明的判定锚点</summary>${anchorBlocks(row.anchors)}</details>` : ''}${!all(row.checks).length ? evidenceReferences(row.citations, '本轮结果证据') : ''}${evidenceReferences(row.sourceRefs, '标准来自哪些原话')}${all(row.missingEvidence).length ? `<div class="missing-evidence"><h4>尚缺的证据</h4><ul>${row.missingEvidence.map((entry) => `<li>${esc(text(entry))}</li>`).join('')}</ul></div>` : ''}</div></details>`;
  }
  function renderQuality(item) {
    const rows = all(item.qualityRows);
    if (!rows.length) return '';
    return `<div class="quality-section"><div class="subsection-heading"><h3>质量表现</h3><p class="section-note">独立报告，不加到基础 100 分里。</p></div><div class="quality-list">${rows.map((row) => `<details class="quality-item"><summary><span><strong>${esc(row.title)}</strong><small>独立质量维度 · 展开查看理由与分档锚点</small></span><span class="quality-grade">${row.ordinal !== null && row.ordinal !== undefined ? `<strong>${num(row.ordinal)}</strong><small> / 2 档</small>` : pill(row.state || 'U', statusNames[row.state] || row.state || '证据未明')}</span></summary><div class="quality-details">${plain(row.reason)}${row.statement ? `<p class="section-note">${esc(row.statement)}</p>` : ''}${row.admission ? `<p class="section-note">准入：${esc(row.admission === 'admitted' ? '已准入' : typeof row.admission === 'string' ? row.admission : text(row.admission))}</p>` : ''}${anchorBlocks(row.anchors)}${evidenceReferences(row.citations)}${all(row.missingEvidence).length ? `<p class="missing-evidence">缺失：${esc(row.missingEvidence.map(text).join('；'))}</p>` : ''}</div></details>`).join('')}</div></div>`;
  }
  function renderRubrics(item) {
    const rows = all(item.rubricRows);
    return section('rubrics', 4, 'Rubrics 与逐条评估', `${rows.length} 条专属 Rubric，冻结预算共 100 分，本次适用 ${num(totalValues(item).max)} 分。每行是一个计分项，C 子检查不另加分。展开可核对完整判据、原话与证据。`, `<div class="rubric-table"><div class="rubric-table-head" aria-hidden="true"><span>评分标准</span><span>状态与得分</span><span>为什么这样判</span></div>${rows.map(renderRubricRow).join('')}</div>${renderQuality(item)}`);
  }

  function totalValues(item) {
    const aggregate = item.aggregate || {};
    const max = Number(aggregate.applicable_base_max ?? 100);
    const lower = Number(aggregate.base_score_lower ?? 0);
    const upper = Number(aggregate.base_score_upper ?? lower);
    return { max, lower, upper, unknown: Number(aggregate.unresolved_max ?? Math.max(0, upper - lower)), failed: Math.max(0, max - upper), outcome: aggregate.overall_outcome || 'undetermined' };
  }
  function outcomeCopy(item) {
    const value = totalValues(item);
    const failed = all(item.aggregate?.must_failures);
    if (value.outcome === 'fail') return `${failed.length || '部分'} 条必需要求确定未满足，因此整体未通过。${value.unknown ? `另有 ${num(value.unknown)} 分证据未明，仍需补齐取证。` : ''}`;
    if (value.outcome === 'undetermined') return `必需要求仍有证据缺口，当前已确认 ${num(value.lower)} 分；整体结论保留未决。`;
    return '适用的必需要求均已满足，整体结果验收通过；质量表现独立报告。';
  }
  function reviewWarning(item) {
    const notes = all(item.reviewNotes);
    if (!notes.length) return '';
    const label = `评估复核记录 · ${notes.length} 项`;
    return `<details class="review-warning"${item.needsReview ? ' open' : ''}><summary>${esc(label)}</summary>${notes.map((note) => `<article><h4>${esc(note.title)}${note.target ? ` · ${esc(note.target)}` : ''}</h4>${plain(note.detail)}${note.proposedReferenceCorrection ? `<p class="section-note">建议对照：<button type="button" class="source-link" data-action="source" data-source="${esc(note.proposedReferenceCorrection.to)}" data-locator="${esc(note.proposedReferenceCorrection.locator || '')}">${esc(note.proposedReferenceCorrection.to)} ↗</button></p>` : ''}</article>`).join('')}</details>`;
  }
  function reviewAlert(item) {
    if (!item.needsReview) return '';
    const flags = all(item.reviewNotes).filter((note) => note.origin === 'selected_attempt_semantic_audit');
    return `<div class="review-alert" role="note"><strong>判定待复核 · API 原判与分数已保留</strong><p>${esc(shorten(flags.map((note) => note.detail).join('；') || '独立复核对本例判据或理由提出争议。', 170))}</p><a href="${esc(routeHash(item.id, 'total'))}" data-jump="total">查看复核记录 ↓</a></div>`;
  }
  function technicalRecords(item) {
    const run = item.runMeta || {};
    const meta = state.data?.meta || {};
    const usage = run.actual_usage || {};
    return `<details class="technical-records"><summary>技术记录 · 评估模型、API 与原始 JSON</summary><div class="technical-overview"><dl class="readable-fields"><div><dt>实际评估模型</dt><dd>${esc(run.actual_model || meta.modelReturned || '未记录')}</dd></div><div><dt>请求别名</dt><dd>${esc(run.requested_alias || meta.modelAlias || '未记录')}</dd></div><div><dt>评估方式</dt><dd>对历史真实回应试评，未重新运行 Agent</dd></div><div><dt>API 协议</dt><dd>${esc(run.protocol || '未记录')}</dd></div><div><dt>调用与用量</dt><dd>本例共 ${num(run.actualCallCount ?? run.attempt ?? 1)} 次调用 · 当前采用第 ${num(run.selectedAttempt ?? run.attempt ?? 1)} 次 · 本次 ${num(usage.total_tokens ?? (Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0)))} tokens</dd></div></dl>${all(meta.limitations).length ? `<ul class="technical-limitations">${meta.limitations.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}</div>${rawDetails('专属 Rubric 与需求整理', item.advanced?.rubric || {})}${rawDetails('独立质检与冻结记录', item.advanced?.qualityAudit || {})}${rawDetails('实际模型调用记录', run)}${rawDetails('原始模型判定', item.advanced?.originalJudgment || item.advanced?.originalPilot?.judgment || {})}${rawDetails('逐项聚合记录', item.aggregate)}${rawDetails('冻结标准与来源记录', item.advanced?.sourceCase || {})}${item.advanced?.judgeInput ? rawDetails('提交给模型的完整评估输入', item.advanced.judgeInput) : rawDetails('完整输入文件与来源校验清单', item.advanced?.inputManifest || {})}</details>`;
  }
  function renderTotal(item) {
    const value = totalValues(item);
    const parts = [['met', value.lower, '已确认得分'], ['unknown', value.unknown, '证据未明'], ['failed', value.failed, '确定未得']];
    return section('total', 5, '最终合分结果', '基础分按上表相加；整体是否通过还取决于必需要求是否满足。', `<div class="total-card"><div class="total-heading"><div>${pill(value.outcome, value.outcome === 'pass' ? '整体通过' : value.outcome === 'fail' ? '整体未通过' : '整体未决')}<p>${esc(outcomeCopy(item))}</p></div><div class="total-score"><strong>${num(value.lower)}</strong><span> / ${num(value.max)}</span><small>${value.unknown ? '已确认得分' : '基础得分'}</small></div></div><div class="score-track" role="img" aria-label="已确认 ${num(value.lower)} 分，证据未明 ${num(value.unknown)} 分，确定未得 ${num(value.failed)} 分">${parts.filter(([, amount]) => amount > 0).map(([className, amount]) => `<span class="score-part ${className}" style="width:${Math.max(0, Math.min(100, amount / value.max * 100))}%"></span>`).join('')}</div><div class="score-legend">${parts.filter(([, amount]) => amount > 0).map(([className, amount, label]) => `<span><i class="legend-dot ${className}" aria-hidden="true"></i>${esc(label)} <strong>${num(amount)}</strong> 分</span>`).join('')}</div><div class="sum-list">${all(item.rubricRows).map((row) => `<div class="sum-row"><a href="${esc(routeHash(item.id, `rubric-${identifier(row.id)}`))}" data-jump="rubric-${identifier(row.id)}">${esc(row.title)}</a><span>${Number(row.scoreLower) === Number(row.scoreUpper) ? `${num(row.scoreLower)} / ${num(row.budget)}` : `已确认 ${num(row.scoreLower)} · 未决 ${num(Number(row.scoreUpper) - Number(row.scoreLower))}`}</span></div>`).join('')}<div class="sum-row sum-total"><strong>基础合计</strong><strong>${num(value.lower)} / ${num(value.max)}${value.unknown ? '（已确认）' : ''}</strong></div></div>${value.unknown ? `<p class="score-range-note">当前可确认区间为 <strong>${num(value.lower)}–${num(value.upper)} / ${num(value.max)}</strong>。${num(value.upper)} 是待补证据后可能达到的上限，不能当作已得分。</p>` : ''}</div>${reviewWarning(item)}${technicalRecords(item)}`);
  }
  function renderRail(item) {
    const value = totalValues(item);
    $('#result-rail').innerHTML = `<div class="rail-card"><p class="rail-eyebrow">本例最终结果</p>${item.needsReview ? '<span class="review-badge">判定待复核</span>' : ''}${pill(value.outcome, value.outcome === 'pass' ? '整体通过' : value.outcome === 'fail' ? '整体未通过' : '整体未决')}<div class="rail-score"><strong>${num(value.lower)}</strong><span> / ${num(value.max)}</span></div><p class="rail-score-label">${value.unknown ? '已确认得分' : '基础得分'}</p>${value.unknown ? `<p class="rail-unknown">另有 ${num(value.unknown)} 分证据未明<br>可能区间 ${num(value.lower)}–${num(value.upper)}，上限未得</p>` : ''}<p class="rail-result-note">${esc(value.outcome === 'pass' ? '适用的必要条件均已满足。' : value.outcome === 'undetermined' ? '必需要求尚有证据缺口。' : value.unknown ? '有确定失败，也有待补证据。' : '有必需要求未满足。')}</p><nav class="rail-nav" aria-label="页面章节"><a class="button primary" href="${esc(routeHash(item.id, 'rubrics'))}" data-jump="rubrics">查看评分表 ↓</a><a class="button subtle" href="${esc(routeHash(item.id, 'total'))}" data-jump="total">查看合分 ↓</a><a href="${esc(routeHash(item.id, 'context'))}" data-jump="context">此前上下文</a><a href="${esc(routeHash(item.id, 'instruction'))}" data-jump="instruction">当前指令</a><a href="${esc(routeHash(item.id, 'response'))}" data-jump="response">实际回应与产物</a></nav></div>`;
  }
  // CATALOG_QUERY_CORE_START
  // Index only light task metadata; full contexts and judge JSON are never searched.
  function catalogSummary(item, index = 0) {
    const aggregate = item.aggregate || {};
    const identity = item.identity || {};
    const numeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    const lower = numeric(aggregate.base_score_lower);
    const upper = numeric(aggregate.base_score_upper);
    const unknown = numeric(aggregate.unresolved_max);
    const createdAt = item.currentQueryCreatedAt || '';
    const parsedTime = createdAt ? Date.parse(createdAt) : NaN;
    const normalize = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    const identityParts = [identity.taskId, identity.projectId, identity.caseId, identity.traceId, ...(Array.isArray(identity.traceIds) ? identity.traceIds : [])];
    return {
      item, id: String(item.id || ''), index, group: String(item.group || ''), needsReview: item.needsReview === true,
      title: String(item.shortTitle || item.title || item.id || '未命名任务'),
      query: String(item.currentQuery || ''), createdAt,
      taskId: String(identity.taskId || item.id || ''),
      timestamp: Number.isFinite(parsedTime) ? parsedTime : null,
      lower, upper: upper ?? lower,
      max: numeric(aggregate.applicable_base_max) ?? 100,
      unknown: unknown ?? (lower !== null && upper !== null ? Math.max(0, upper - lower) : 0),
      outcome: ['pass', 'fail', 'undetermined'].includes(aggregate.overall_outcome) ? aggregate.overall_outcome : 'undetermined',
      searchText: normalize([item.id, item.queryId, item.group, item.title, item.shortTitle, item.currentQuery, ...identityParts].filter(Boolean).join(' ')),
    };
  }
  function catalogQuery(entries, filters) {
    const query = String(filters.q || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    const tokens = query.split(' ').filter(Boolean);
    const selected = entries.filter((entry) => (!tokens.length || tokens.every((token) => entry.searchText.includes(token))) && (!filters.group || filters.group === 'all' || entry.group === filters.group) && (filters.outcome === 'all' || !filters.outcome || entry.outcome === filters.outcome) && (!filters.unknown || entry.unknown > 0) && (!filters.review || entry.needsReview));
    const compareNullable = (left, right, direction) => left === null && right === null ? 0 : left === null ? 1 : right === null ? -1 : (left - right) * direction;
    return selected.sort((left, right) => {
      let order = 0;
      if (filters.sort === 'oldest') order = compareNullable(left.timestamp, right.timestamp, 1);
      else if (filters.sort === 'score-asc' || filters.sort === 'score-desc') order = compareNullable(left.lower, right.lower, filters.sort === 'score-asc' ? 1 : -1);
      else order = compareNullable(left.timestamp, right.timestamp, -1);
      return order || (filters.sort?.startsWith('score') ? compareNullable(left.timestamp, right.timestamp, -1) : 0) || left.index - right.index;
    });
  }
  // CATALOG_QUERY_CORE_END
  let catalogEntries = [];
  function filteredEntries() { return catalogQuery(catalogEntries, state.filters); }
  function catalogDate(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return '<span class="muted">日期未记录</span>';
    const date = new Date(value);
    const day = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replaceAll('/', '.');
    const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    return `<time datetime="${esc(value)}" title="${esc(dateLabel(value))}">${esc(day)}<small>${esc(time)} · 北京时间</small></time>`;
  }
  function renderCatalogStats() {
    const counts = { all: catalogEntries.length, pass: 0, fail: 0, undetermined: 0 };
    catalogEntries.forEach((entry) => { if (entry.outcome in counts) counts[entry.outcome] += 1; });
    const cards = [
      ['all', '全部评估记录', '当前已接入的真实案例'],
      ['pass', '整体通过', '适用的必要条件均满足'],
      ['fail', '整体未通过', '存在必需项未满足'],
      ['undetermined', '整体未决', '必需项仍有证据缺口'],
    ];
    $('#catalog-stats').innerHTML = cards.map(([key, label, note]) => `<button type="button" class="catalog-stat stat-${key}" data-stat="${key}" aria-pressed="${key === 'unknown' ? state.filters.unknown : !state.filters.unknown && !state.filters.review && (key !== 'all' || (!state.filters.q && state.filters.group === 'all')) && state.filters.outcome === (key === 'all' ? 'all' : key)}"><span class="stat-label">${label}</span><strong class="stat-value">${num(counts[key])}</strong><span class="stat-footnote">${note}</span></button>`).join('');
  }
  function renderCatalog() {
    const entries = filteredEntries();
    const pages = Math.max(1, Math.ceil(entries.length / state.filters.size));
    state.filters.page = Math.max(1, Math.min(pages, state.filters.page));
    const start = (state.filters.page - 1) * state.filters.size;
    const visible = entries.slice(start, start + state.filters.size);
    renderCatalogStats();
    $('#catalog-count').innerHTML = `<strong>${num(entries.length)}</strong> 条匹配 <span> / 共 ${num(catalogEntries.length)} 条${entries.length ? ` · 显示 ${num(start + 1)}–${num(start + visible.length)} 条` : ''}</span>`;
    $('#catalog-reset').disabled = !(state.filters.q || state.filters.group !== 'all' || state.filters.outcome !== 'all' || state.filters.unknown || state.filters.review || state.filters.sort !== 'newest' || state.filters.size !== 20 || state.filters.page !== 1);
    $('#catalog-results').innerHTML = !entries.length ? `<div class="empty-catalog"><span aria-hidden="true">⌕</span><h3>没有匹配的评估记录</h3><p>试试任务标题、当前指令或任务 ID，或清除筛选条件。</p><button type="button" class="button subtle" data-action="reset-catalog">清除筛选</button></div>` : `<div class="catalog-table-wrap"><table class="catalog-table"><caption class="sr-only">评估案例列表，任务时间均为北京时间</caption><thead><tr><th scope="col">任务</th><th scope="col">当前轮用户指令</th><th scope="col">已确认基础分</th><th scope="col">整体结论</th><th scope="col">任务时间</th><th scope="col"><span class="sr-only">查看案例</span></th></tr></thead><tbody>${visible.map((entry) => `<tr><td class="catalog-task"><a href="${esc(routeHash(entry.id))}" data-case="${esc(entry.id)}"><strong>${esc(entry.title)}</strong><small class="catalog-group-label">${esc(entry.group)}</small><small title="${esc(entry.taskId)}">${esc(entry.id)}</small></a></td><td class="catalog-query"><span title="${esc(entry.query)}">${esc(shorten(entry.query.replace(/\s+/g, ' '), 110))}</span></td><td class="catalog-score">${entry.lower === null ? '<span class="muted">待评估</span>' : `<strong>${num(entry.lower)}<span> / ${num(entry.max)}</span></strong>${entry.unknown ? `<small>${num(entry.unknown)} 分证据未明</small>` : '<small>无未明分</small>'}`}</td><td class="catalog-status">${entry.needsReview ? '<span class="review-badge">判定待复核</span>' : ''}${pill(entry.outcome, entry.outcome === 'pass' ? '通过' : entry.outcome === 'fail' ? '未通过' : '未决')}</td><td class="catalog-date">${catalogDate(entry.createdAt)}</td><td class="catalog-open"><a href="${esc(routeHash(entry.id))}" data-case="${esc(entry.id)}" aria-label="查看${esc(entry.title)}详情">查看详情 <span aria-hidden="true">→</span></a></td></tr>`).join('')}</tbody></table></div>`;
    const around = new Set([1, pages, state.filters.page - 1, state.filters.page, state.filters.page + 1]);
    if (state.filters.page <= 3) { around.add(2); around.add(3); around.add(4); }
    if (state.filters.page >= pages - 2) { around.add(pages - 1); around.add(pages - 2); around.add(pages - 3); }
    const numbers = [...around].filter((page) => page >= 1 && page <= pages).sort((left, right) => left - right);
    let last = 0;
    const pageButtons = numbers.map((page) => { const gap = last && page > last + 1 ? '<span class="pagination-ellipsis" aria-hidden="true">…</span>' : ''; last = page; return `${gap}<button type="button" class="pagination-button${page === state.filters.page ? ' active' : ''}" data-page="${page}" aria-label="第 ${page} 页"${page === state.filters.page ? ' aria-current="page"' : ''}>${num(page)}</button>`; }).join('');
    $('#catalog-pagination').innerHTML = `<button type="button" class="pagination-button" data-page="${state.filters.page - 1}"${state.filters.page === 1 ? ' disabled' : ''} aria-label="上一页">← 上一页</button>${pageButtons}<button type="button" class="pagination-button" data-page="${state.filters.page + 1}"${state.filters.page === pages ? ' disabled' : ''} aria-label="下一页">下一页 →</button><span class="pagination-summary">第 ${num(state.filters.page)} / ${num(pages)} 页</span>`;
  }
  function syncCatalogControls() {
    const groups = [...new Set(catalogEntries.map((entry) => entry.group).filter(Boolean))].sort();
    $('#catalog-group').innerHTML = '<option value="all">全部 ' + groups.length + ' 类</option>' + groups.map((group) => `<option value="${esc(group)}">${esc(group)} · ${num(catalogEntries.filter((entry) => entry.group === group).length)} 条</option>`).join('');
    $('#catalog-group').value = state.filters.group;
    $('#catalog-search').value = state.filters.q;
    $('#catalog-outcome').value = state.filters.outcome;
    $('#catalog-unknown').checked = state.filters.unknown;
    $('#catalog-review').checked = state.filters.review;
    $('#review-count').textContent = String(catalogEntries.filter((entry) => entry.needsReview).length);
    $('#catalog-sort').value = state.filters.sort;
    $('#catalog-size').value = String(state.filters.size);
  }
  function detailScope() {
    const filtered = filteredEntries();
    if (filtered.some((entry) => entry.id === state.caseId)) return { entries: filtered, filtered: Boolean(state.filters.q || state.filters.group !== 'all' || state.filters.outcome !== 'all' || state.filters.unknown || state.filters.review) };
    return { entries: catalogQuery(catalogEntries, { ...state.filters, q: '', group: 'all', outcome: 'all', unknown: false, review: false }), filtered: false };
  }
  function renderDetailNavigation() {
    const scope = detailScope();
    const index = scope.entries.findIndex((entry) => entry.id === state.caseId);
    $('#detail-position').textContent = index < 0 ? '案例未找到' : `${scope.filtered ? '筛选结果' : '全部案例'} · ${num(index + 1)} / ${num(scope.entries.length)}`;
    $('#detail-prev').disabled = index <= 0;
    $('#detail-next').disabled = index < 0 || index >= scope.entries.length - 1;
    $('#detail-prev').dataset.targetCase = scope.entries[index - 1]?.id || '';
    $('#detail-next').dataset.targetCase = scope.entries[index + 1]?.id || '';
  }
  function hasFullDetail(item) { return item && Array.isArray(item.rubricRows) && item.history && item.response; }
  function rememberDetail(item) {
    state.detailCache.delete(item.id);
    state.detailCache.set(item.id, item);
    while (state.detailCache.size > 12) {
      const discard = [...state.detailCache.keys()].find((id) => state.view !== 'detail' || id !== state.caseId);
      if (discard === undefined) break;
      state.detailCache.delete(discard);
    }
  }
  async function loadDetail(summary) {
    if (hasFullDetail(summary)) return summary;
    if (state.detailCache.has(summary.id)) { const cached = state.detailCache.get(summary.id); rememberDetail(cached); return cached; }
    if (state.pendingDetails.has(summary.id)) return state.pendingDetails.get(summary.id);
    const task = (async () => {
      if (!summary.detailUrl) throw new Error('此案例没有完整资料地址。');
      const url = new URL(summary.detailUrl, window.location.href);
      if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('完整资料必须来自本页面的同源静态文件。');
      const response = await fetch(url.href, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`资料文件读取失败（${response.status}）。`);
      const item = await response.json();
      if (item.id !== summary.id || !hasFullDetail(item)) throw new Error('资料内容与所选案例不一致。');
      rememberDetail(item);
      return item;
    })();
    state.pendingDetails.set(summary.id, task);
    try { return await task; } finally { state.pendingDetails.delete(summary.id); }
  }
  async function renderCase(sectionToOpen = '') {
    const summary = caseList().find((item) => item.id === state.caseId);
    closeDrawer(false);
    const request = ++state.detailRequest;
    document.body.dataset.case = state.caseId;
    $('#page-title').textContent = summary?.shortTitle || summary?.title || '案例未找到';
    $('#page-subtitle').textContent = [summary?.id, summary?.group, '历史真实回应 · API 试评'].filter(Boolean).join(' · ');
    document.title = `${summary?.shortTitle || summary?.title || '案例未找到'} · Flova 评测回顾`;
    renderDetailNavigation();
    if (!summary) {
      $('#review-content').innerHTML = '<div class="detail-load-error" role="alert"><h2>未找到这条评估记录</h2><p>它可能不在当前数据快照中，请返回列表重新选择。</p></div>';
      $('#result-rail').innerHTML = '';
      return;
    }
    renderRail(summary);
    $('#review-content').innerHTML = '<div class="detail-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span><h2>正在载入完整案例</h2><p>读取本轮的上文、回应、执行轨迹与评分依据…</p></div>';
    try {
      const item = await loadDetail(summary);
      if (request !== state.detailRequest || state.view !== 'detail' || item.id !== state.caseId) return;
      $('#review-content').innerHTML = reviewAlert(item) + renderContext(item) + renderInstruction(item) + renderResponse(item) + renderRubrics(item) + renderTotal(item);
      renderRail(item);
      syncDetails();
      if (sectionToOpen) requestAnimationFrame(() => jump(sectionToOpen, 'auto'));
    } catch (error) {
      if (request !== state.detailRequest || state.view !== 'detail' || summary.id !== state.caseId) return;
      $('#page-subtitle').textContent = '完整资料暂未载入；列表中的评估摘要仍保留。';
      $('#review-content').innerHTML = `<div class="detail-load-error" role="alert"><h2>完整案例未能载入</h2><p>${esc(error?.message || '请检查本地预览服务是否正在运行。')}</p><button type="button" class="button primary" data-action="retry-detail">重新加载</button><button type="button" class="button subtle" data-action="back-catalog">返回评估列表</button></div>`;
    }
  }
  function showView(options = {}) {
    closeDrawer(false);
    const isDetail = state.view === 'detail';
    $('#catalog-view').hidden = isDetail;
    $('#detail-view').hidden = !isDetail;
    document.body.dataset.view = state.view;
    if (isDetail) renderCase(options.section || '');
    else {
      state.detailRequest += 1;
      delete document.body.dataset.case;
      document.title = '通用评估集 28 条 · Flova';
      $('#review-content').innerHTML = '';
      $('#result-rail').innerHTML = '';
      syncCatalogControls();
      renderCatalog();
      if (options.restoreScroll) requestAnimationFrame(() => {
        if (state.view !== 'list') return;
        const active = document.activeElement;
        const canRestore = !active || active === document.body || active === document.documentElement || $('#detail-view')?.contains(active);
        // A user may already be typing or selecting a filter before this frame runs.
        // Restore the old row only while focus is still in the view being left.
        if (!canRestore) return;
        window.scrollTo({ top: state.catalogScroll, behavior: 'auto' });
        [...document.querySelectorAll('#catalog-results a[data-case]')].find((link) => link.dataset.case === state.lastListCaseId)?.focus({ preventScroll: true });
      });
    }
  }

  function highlightedOriginal(value, quote = '') {
    const full = text(value);
    const start = quote ? full.indexOf(quote) : -1;
    return `<pre class="source-original">${start < 0 ? esc(full) : `${esc(full.slice(0, start))}<mark>${esc(quote)}</mark>${esc(full.slice(start + quote.length))}`}</pre>`;
  }
  function openDrawer(title, body, options = {}) {
    const drawer = $('#drawer');
    if (!drawer) return;
    if (drawer.hidden) state.drawerFocus = document.activeElement;
    $('#drawer-title').textContent = title;
    $('#drawer-body').innerHTML = body;
    drawer.classList.toggle('wide', Boolean(options.wide));
    drawer.classList.toggle('drawer-wide', Boolean(options.wide));
    drawer.hidden = false;
    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.setAttribute('aria-modal', 'true');
    document.body.classList.add('drawer-open');
    document.querySelectorAll('body > :not(#drawer):not(#toast):not(script)').forEach((element) => {
      if (!element.hasAttribute('inert')) { element.setAttribute('inert', ''); element.setAttribute('data-review-inert', ''); }
    });
    syncDetails(drawer);
    $('#drawer-close')?.focus();
    if ($('#drawer-body')) $('#drawer-body').scrollTop = 0;
  }
  function closeDrawer(restoreFocus = true) {
    const drawer = $('#drawer');
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    drawer.setAttribute('inert', '');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    document.querySelectorAll('[data-review-inert]').forEach((element) => { element.removeAttribute('inert'); element.removeAttribute('data-review-inert'); });
    if (restoreFocus && state.drawerFocus?.isConnected) state.drawerFocus.focus();
    state.drawerFocus = null;
  }
  function openArtifact(index) {
    const artifact = artifactList()[Number(index)];
    if (!artifact) return;
    openDrawer(artifactTitle(artifact), `<div class="artifact-document">${markdown(artifactText(artifact))}<details class="source-original-details"><summary>查看产物完整原始文本（${num(artifactText(artifact).length)} 字符）</summary>${highlightedOriginal(artifactText(artifact))}</details></div>`, { wide: true });
  }
  function openSource(sourceId, quote = '', locator = '') {
    const item = currentCase();
    if (sourceId === 'E_ARTIFACT_0') { openArtifact(0); return; }
    if (sourceId === 'E_ACTION_LOG') { openDrawer('这一轮的完整公开执行过程', renderTrace(item) + rawDetails('执行记录索引与覆盖说明', item.evidence?.E_ACTION_LOG?.record || {}), { wide: true }); return; }
    const message = historyMessages(item).find((entry) => String(entry.id || entry.message_id) === String(sourceId));
    const sourceMessage = message || all(item.advanced?.sourceCase?.sources).find((entry) => String(entry.id || entry.message_id) === String(sourceId));
    const evidence = item.evidence?.[sourceId] || all(item.evidenceList).find((entry) => entry.id === sourceId);
    const locatorLine = locator ? `<p class="source-locator">引用位置：${esc(locator)}</p>` : '';
    if (sourceMessage) {
      const snapshot = sourceMessage.record?.content?.snapshot;
      if (snapshot?.payload?.prompt_text) {
        openDrawer(snapshot.title || '用户附带的提示词草稿', `<p class="section-note">当前任务的输入参考材料</p>${locatorLine}${markdown(snapshot.payload.prompt_text)}${rawDetails('完整草稿记录与参数', sourceMessage.record)}`, {wide:true});
        return;
      }
      const original = messageText(sourceMessage) || (sourceMessage.record ? JSON.stringify(sourceMessage.record.content, null, 2) : '');
      const parts = all(sourceMessage.parts).filter((part) => !['text', 'public_text'].includes(part.kind || part.type));
      openDrawer(`${roleNames[sourceMessage.role] || '消息'}原始消息`, `<div class="message-meta"><strong>${esc(roleNames[sourceMessage.role] || sourceMessage.role)}</strong><time datetime="${esc(sourceMessage.createdAt || '')}">${esc(dateLabel(sourceMessage.createdAt))}</time></div>${locatorLine}${highlightedOriginal(original, quote)}${parts.length ? `<details class="message-parts"><summary>原消息中的工具与附件（${parts.length}）</summary>${parts.map(publicPart).join('')}</details>` : ''}${rawDetails('完整来源记录（含非文本字段）', sourceMessage.record || sourceMessage)}`);
      return;
    }
    if (sourceId === 'E_FINAL_RESPONSE') {
      const record = evidence?.record;
      const otherParts = all(record?.content?.parts).filter((part) => !['text', 'public_text'].includes(part.kind || part.type));
      openDrawer('本轮完整公开回复', `${locatorLine}${textParts(item).map((part, index) => `<article class="public-text-part"><p class="message-meta">公开文本 ${index + 1}</p>${highlightedOriginal(part, quote)}</article>`).join('')}${otherParts.length ? `<h3>回复中的工具与附件（${otherParts.length}）</h3>${otherParts.map(publicPart).join('')}` : ''}${rawDetails('最终回复完整原始记录', record || {})}`, { wide: true });
      return;
    }
    if (evidence) {
      const original = evidence.text || evidence.snippet || (evidence.record ? JSON.stringify(evidence.record.content, null, 2) : '');
      const parsed = parseValue(original);
      openDrawer(evidence.title || sourceId, `${locatorLine}${quote ? `<blockquote class="evidence-quote">${plain(quote)}</blockquote>` : ''}${typeof parsed === 'object' ? `${readable(parsed)}<details><summary>完整原始公开文本</summary>${highlightedOriginal(original, quote)}</details>` : highlightedOriginal(original, quote)}${!original ? '<p class="muted">该证据未提供可展示的原文；缺失状态保留在评分项中。</p>' : ''}`, { wide: sourceId.startsWith('E_TOOL_') });
      return;
    }
    openDrawer('来源定位', `${locatorLine}${plain(sourceId)}${quote ? highlightedOriginal(quote) : ''}<p class="muted">当前资料未收录此来源的完整正文。</p>`);
  }

  function syncDetails(root = document) {
    root.querySelectorAll('details').forEach((details) => {
      const summary = details.querySelector(':scope > summary');
      if (summary) summary.setAttribute('aria-expanded', String(details.open));
    });
  }
  function toast(message) {
    const element = $('#toast');
    if (!element) return;
    clearTimeout(state.toastTimer);
    element.textContent = message;
    element.hidden = false;
    element.classList.add('visible');
    state.toastTimer = setTimeout(() => { element.classList.remove('visible'); element.hidden = true; }, 2600);
  }
  function hashRoute() {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    let caseId = params.get('case') || params.get('caseId') || '';
    if (!caseId) {
      const known = caseList().find((item) => hash === item.id || hash === `case/${item.id}` || hash === `case:${item.id}` || hash === `case-${item.id}`);
      caseId = known?.id || '';
    }
    const section = params.get('section') || (['context', 'instruction', 'response', 'rubrics', 'total'].includes(hash) ? hash : '');
    if (!caseId && section && params.get('view') !== 'list') caseId = caseList()[0]?.id || '';
    const outcome = params.get('outcome') || 'all';
    const sort = params.get('sort') || 'newest';
    const size = Number(params.get('size') || 20);
    const page = Number(params.get('page') || 1);
    return {
      view: caseId && params.get('view') !== 'list' ? 'detail' : 'list', caseId, section,
      filters: { q: params.get('q') || '', group: params.get('group') || 'all', outcome: ['all', 'pass', 'fail', 'undetermined'].includes(outcome) ? outcome : 'all', unknown: params.get('unknown') === '1', review: params.get('review') === '1', sort: ['newest', 'oldest', 'score-asc', 'score-desc'].includes(sort) ? sort : 'newest', size: [20, 50, 100].includes(size) ? size : 20, page: Number.isInteger(page) && page > 0 ? page : 1 },
    };
  }
  function routeHash(caseId = '', section = '') {
    const params = new URLSearchParams();
    if (caseId) params.set('case', caseId); else params.set('view', 'list');
    if (section && caseId) params.set('section', section);
    const filter = state.filters;
    if (filter.q) params.set('q', filter.q);
    if (filter.group !== 'all') params.set('group', filter.group);
    if (filter.outcome !== 'all') params.set('outcome', filter.outcome);
    if (filter.unknown) params.set('unknown', '1');
    if (filter.review) params.set('review', '1');
    if (filter.sort !== 'newest') params.set('sort', filter.sort);
    if (filter.page !== 1) params.set('page', String(filter.page));
    if (filter.size !== 20) params.set('size', String(filter.size));
    return `#${params.toString()}`;
  }
  function setHash(section = '', mode = 'replace') {
    const next = routeHash(state.view === 'detail' ? state.caseId : '', section);
    if (window.location.hash !== next) window.history[mode === 'push' ? 'pushState' : 'replaceState']({ flovaView: state.view }, '', next);
    state.routeSignature = window.location.hash;
  }
  function jump(section, behavior = 'smooth') {
    const target = document.getElementById(section);
    if (!target) return;
    if (target.tagName === 'DETAILS') { target.open = true; syncDetails(); }
    target.scrollIntoView({ behavior, block: 'start' });
    setHash(section);
  }
  function selectCase(caseId, neighbor = false) {
    if (!caseList().some((item) => item.id === caseId)) return;
    if (state.view === 'list') { state.catalogScroll = window.scrollY || 0; state.lastListCaseId = caseId; }
    state.caseId = caseId;
    state.view = 'detail';
    if (neighbor) {
      const index = filteredEntries().findIndex((entry) => entry.id === caseId);
      if (index >= 0) state.filters.page = Math.floor(index / state.filters.size) + 1;
      state.lastListCaseId = caseId;
    }
    showView();
    setHash('', 'push');
    window.scrollTo({ top: 0, behavior: 'auto' });
    $('#page-title')?.setAttribute('tabindex', '-1');
    $('#page-title')?.focus({ preventScroll: true });
  }
  function returnToCatalog() {
    state.view = 'list';
    showView({ restoreScroll: true });
    setHash('', 'push');
  }
  function updateCatalog(resetPage = true) {
    if (resetPage) state.filters.page = 1;
    renderCatalog();
    setHash();
  }
  function resetCatalog() {
    state.filters = { q: '', group: 'all', outcome: 'all', unknown: false, review: false, sort: 'newest', page: 1, size: 20 };
    syncCatalogControls();
    updateCatalog();
  }
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button,a,[data-dismiss]') : null;
    if (!target) return;
    if (target.dataset.case) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); selectCase(target.dataset.case); return;
    }
    if (target.id === 'detail-back' || target.dataset.action === 'back-catalog') { event.preventDefault(); returnToCatalog(); return; }
    if (target.id === 'detail-prev' || target.id === 'detail-next') { if (!target.disabled && target.dataset.targetCase) selectCase(target.dataset.targetCase, true); return; }
    if (target.id === 'catalog-reset' || target.dataset.action === 'reset-catalog') { resetCatalog(); return; }
    if (target.dataset.stat) {
      if (target.dataset.stat === 'all') { resetCatalog(); return; }
      state.filters.outcome = target.dataset.stat === 'unknown' ? 'all' : target.dataset.stat;
      state.filters.unknown = target.dataset.stat === 'unknown';
      syncCatalogControls(); updateCatalog(); return;
    }
    if (target.dataset.page && !target.disabled) { state.filters.page = Number(target.dataset.page); updateCatalog(false); $('#catalog-results')?.scrollIntoView({ behavior: 'auto', block: 'start' }); return; }
    if (target.dataset.jump) { event.preventDefault(); jump(target.dataset.jump); return; }
    if (target.id === 'drawer-close' || target.dataset.dismiss === 'drawer') { closeDrawer(); return; }
    if (target.dataset.action === 'retry-detail') { renderCase(); return; }
    if (target.dataset.action === 'artifact') { openArtifact(target.dataset.artifact); return; }
    if (target.dataset.action === 'source') { openSource(target.dataset.source, target.dataset.quote, target.dataset.locator); }
  });
  function searchChanged(event) {
    if (event.target?.id !== 'catalog-search' || event.isComposing) return;
    state.filters.q = event.target.value;
    updateCatalog();
  }
  document.addEventListener('input', searchChanged);
  document.addEventListener('compositionend', searchChanged);
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!target?.id?.startsWith('catalog-')) return;
    if (target.id === 'catalog-group') state.filters.group = target.value;
    else if (target.id === 'catalog-outcome') state.filters.outcome = target.value;
    else if (target.id === 'catalog-unknown') state.filters.unknown = target.checked;
    else if (target.id === 'catalog-review') state.filters.review = target.checked;
    else if (target.id === 'catalog-sort') state.filters.sort = target.value;
    else if (target.id === 'catalog-size') state.filters.size = Number(target.value);
    else return;
    updateCatalog();
  });
  document.addEventListener('toggle', (event) => {
    if (event.target instanceof HTMLDetailsElement) {
      const summary = event.target.querySelector(':scope > summary');
      summary?.setAttribute('aria-expanded', String(event.target.open));
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    const drawer = $('#drawer');
    if (!drawer || drawer.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...drawer.querySelectorAll('button, a[href], summary, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hidden && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  $('#drawer')?.addEventListener('click', (event) => { if (event.target === $('#drawer')) closeDrawer(); });
  function applyRoute() {
    if (state.routeSignature === window.location.hash) return;
    const previousView = state.view;
    const previousCase = state.caseId;
    const route = hashRoute();
    state.filters = route.filters;
    state.caseId = route.caseId;
    state.view = route.view;
    state.routeSignature = window.location.hash;
    if (state.view === 'detail' && previousView === 'detail' && previousCase === state.caseId && $('#review-content .section-card')) {
      renderDetailNavigation();
      if (route.section) jump(route.section, 'auto');
    } else showView({ section: route.section, restoreScroll: previousView === 'detail' && state.view === 'list' });
    setHash(route.section);
  }
  window.addEventListener('hashchange', applyRoute);
  window.addEventListener('popstate', applyRoute);

  if (!state.data || !caseList().length) {
    if ($('#catalog-results')) $('#catalog-results').innerHTML = '<div class="empty-catalog"><h3>尚无可展示的评估记录</h3><p>请确认评测数据已在页面脚本前加载。</p></div>';
    return;
  }
  catalogEntries = caseList().map(catalogSummary);
  const route = hashRoute();
  state.filters = route.filters;
  state.caseId = route.caseId;
  state.view = route.view;
  showView({ section: route.section });
  setHash(route.section);
})();
