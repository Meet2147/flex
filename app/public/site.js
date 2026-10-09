// Landing form, waitlist, and the order status page.
const $ = (id) => document.getElementById(id);

const maker = $('maker');
if (maker) {
  const go = $('go'), error = $('error');
  const plan = () => new FormData(maker).get('plan');
  const label = () => (plan() === 'pass' ? go.dataset.pass : 'flex for me · free →');
  go.dataset.pass = go.textContent;
  maker.addEventListener('change', () => (go.textContent = label()));
  document.querySelectorAll('[data-plan]').forEach((link) =>
    link.addEventListener('click', () => {
      maker.querySelector(`[name="plan"][value="${link.dataset.plan}"]`).checked = true;
      go.textContent = label();
      setTimeout(() => $('urls').focus(), 50);
    }),
  );
  maker.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    go.disabled = true;
    go.textContent = 'checking your links…';
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(maker))),
      });
      const result = await response.json();
      if (!response.ok && result.next) return void (location.href = result.next);
      if (!response.ok) throw new Error(result.error || 'Something went wrong.');
      location.href = result.next;
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      go.disabled = false;
      go.textContent = label();
    }
  });
}

const waitlist = $('waitlist');
waitlist?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: waitlist.email.value }) });
  $('wl-note').textContent = response.ok ? 'Noted. One email when Pro opens, nothing else.' : 'That email did not look right.';
  if (response.ok) waitlist.reset();
});

const order = $('order');
if (order) {
  const id = order.dataset.id;
  const title = $('title'), detail = $('detail'), apps = $('apps'), done = $('done');
  const words = { waiting: 'waiting', capturing: 'capturing now…', done: 'captured', failed: 'could not capture' };
  const stage = {
    awaiting_payment: ['waiting for payment', 'If you have paid, this will move on within a few seconds.'],
    queued: ['in the queue', 'Another page is being made ahead of yours.'],
    capturing: ['capturing your apps', 'About 30 seconds each. This page updates by itself.'],
    writing: ['writing the copy', 'Reading what was captured and writing each section.'],
    building: ['building the page', 'Nearly there.'],
  };
  const host = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

  const render = (state) => {
    apps.replaceChildren(
      ...state.apps.map((app) => {
        const li = document.createElement('li');
        li.className = app.state;
        const name = document.createElement('span');
        name.textContent = host(app.url);
        const status = document.createElement('small');
        status.textContent = app.state === 'failed' && app.error ? `${words.failed}: ${app.error}` : words[app.state];
        li.append(name, status);
        return li;
      }),
    );
    if (state.status === 'ready') {
      title.textContent = 'your page is ready.';
      detail.textContent = 'Bookmark this private link. The public page is the one to share.';
      const link = (text, href, primary) => Object.assign(document.createElement('a'), { textContent: text, href, className: primary ? 'go' : 'btn', target: primary ? '_blank' : '' });
      const nodes = [link('Open your page ↗', state.pageUrl, true)];
      if (state.canDownload) nodes.push(link('Download zip', `/o/${id}/download`));
      if (state.refreshesLeft > 0) {
        const button = Object.assign(document.createElement('button'), { className: 'btn', type: 'button', textContent: `Re-capture (${state.refreshesLeft} left)` });
        button.onclick = async () => { button.disabled = true; await fetch(`/api/orders/${id}/refresh`, { method: 'POST' }); done.hidden = true; poll(); };
        nodes.push(button);
      }
      const share = Object.assign(document.createElement('input'), { readOnly: true, value: state.pageUrl, className: 'share' });
      share.onclick = () => share.select();
      done.replaceChildren(...nodes, share);
      done.hidden = false;
      return true;
    }
    if (state.status === 'failed') {
      title.textContent = 'this one did not work.';
      detail.textContent = `${state.error || 'Something went wrong.'}${state.refund === 'refunded' ? ' Your payment has been refunded.' : state.plan === 'pass' ? ' You will be refunded; nothing more to do.' : ''}`;
      return true;
    }
    [title.textContent, detail.textContent] = stage[state.status] ?? ['working on it…', ''];
    if (state.status === 'queued' && state.position > 1) detail.textContent = `${state.position - 1} ahead of you.`;
    return false;
  };

  async function poll() {
    try {
      const response = await fetch(`/api/orders/${id}`);
      if (response.ok && render(await response.json())) return;
    } catch {}
    setTimeout(poll, 2000);
  }
  poll();
}
