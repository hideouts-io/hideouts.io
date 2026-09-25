// Progressive enhancements only. Every page works without JavaScript.

const root = document.documentElement;
const prefersLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;
const current = () => (root.dataset.theme as 'light' | 'dark' | undefined) ?? (prefersLight() ? 'light' : 'dark');

document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((btn) => {
  const label = () => btn.setAttribute('aria-label', `Switch to ${current() === 'dark' ? 'light' : 'dark'} theme`);
  label();
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {}
    label();
  });
});

// Code blocks: language label + copy button.
document.querySelectorAll<HTMLPreElement>('.prose-readme pre').forEach((pre) => {
  const wrap = document.createElement('div');
  wrap.className = 'code-wrap';
  pre.replaceWith(wrap);
  wrap.append(pre);
  const bar = document.createElement('div');
  bar.className = 'code-bar';
  const lang = pre.dataset.lang;
  if (lang) {
    const l = document.createElement('span');
    l.className = 'code-lang';
    l.textContent = lang;
    bar.append(l);
  }
  if (navigator.clipboard) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy-btn';
    b.textContent = 'Copy';
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText.replace(/\n$/, ''));
        b.textContent = 'Copied';
        b.dataset.copied = '';
      } catch {
        b.textContent = 'Press ⌘C';
      }
      setTimeout(() => {
        b.textContent = 'Copy';
        delete b.dataset.copied;
      }, 1600);
    });
    bar.append(b);
  }
  wrap.prepend(bar);
});

// Table of contents: highlight the section in view.
const tocLinks = [...document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]')];
if (tocLinks.length) {
  const pairs = tocLinks
    .map((a) => [document.getElementById(decodeURIComponent(a.hash.slice(1))), a] as const)
    .filter(([h]) => h) as (readonly [HTMLElement, HTMLAnchorElement])[];
  let active: HTMLAnchorElement | undefined;
  let queued = false;
  const update = () => {
    queued = false;
    let current: HTMLAnchorElement | undefined;
    for (const [h, a] of pairs) {
      if (h.getBoundingClientRect().top < 140) current = a;
      else break;
    }
    if (current === active) return;
    active?.removeAttribute('aria-current');
    current?.setAttribute('aria-current', 'true');
    active = current;
    // Keep the active entry visible inside the TOC's own scroll box only.
    const box = current?.closest<HTMLElement>('[data-toc-scroll]');
    if (current && box) {
      const top = current.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = top - box.clientHeight / 3;
    }
  };
  addEventListener('scroll', () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

// Platform filter on app grids.
document.querySelectorAll<HTMLElement>('[data-filter-group]').forEach((group) => {
  const target = document.getElementById(group.dataset.filterGroup!);
  if (!target) return;
  group.hidden = false;
  group.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter!;
      group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      target.querySelectorAll<HTMLElement>('[data-platforms]').forEach((card) => {
        const show = f === 'all' || card.dataset.platforms!.split(' ').includes(f);
        (card.closest('li') ?? card).hidden = !show;
      });
    });
  });
});

// ── Screenshot lightbox ────────────────────────────────────────────────────
const lightboxLinks = document.querySelectorAll<HTMLAnchorElement>('a[data-lightbox]');
if (lightboxLinks.length && 'HTMLDialogElement' in window) {
  const dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.setAttribute('aria-label', 'Screenshot');
  dlg.innerHTML = '<div class="lb-bar"><p></p><button type="button" data-prev aria-label="Previous">←</button><button type="button" data-next aria-label="Next">→</button><button type="button" data-close>Close</button></div><img alt="">';
  document.body.append(dlg);
  const img = dlg.querySelector('img')!;
  const cap = dlg.querySelector('p')!;
  const list = [...lightboxLinks];
  let i = 0;
  const show = (n: number) => {
    i = (n + list.length) % list.length;
    img.src = list[i].href;
    img.alt = list[i].dataset.caption ?? '';
    cap.textContent = `${i + 1} / ${list.length}${img.alt ? ' · ' + img.alt : ''}`;
  };
  list.forEach((a, n) =>
    a.addEventListener('click', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      ev.preventDefault();
      show(n);
      dlg.showModal();
      dlg.querySelector<HTMLButtonElement>('[data-close]')!.focus();
    }),
  );
  dlg.querySelector('[data-close]')!.addEventListener('click', () => dlg.close());
  dlg.querySelector('[data-prev]')!.addEventListener('click', () => show(i - 1));
  dlg.querySelector('[data-next]')!.addEventListener('click', () => show(i + 1));
  dlg.addEventListener('click', (ev) => ev.target === dlg && dlg.close());
  dlg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') show(i - 1);
    if (ev.key === 'ArrowRight') show(i + 1);
  });
}

// ── Search (Pagefind, fully local) ─────────────────────────────────────────
const dialog = document.querySelector<HTMLDialogElement>('[data-search-dialog]');
if (dialog) {
  const input = dialog.querySelector<HTMLInputElement>('[data-search-input]')!;
  const results = dialog.querySelector<HTMLUListElement>('[data-search-results]')!;
  const status = dialog.querySelector<HTMLParagraphElement>('[data-search-status]')!;
  let pagefind: any;
  let seq = 0;
  let timer: number | undefined;
  let selected = -1;

  const load = async () => {
    if (pagefind) return pagefind;
    const path = '/pagefind/pagefind.js';
    try {
      pagefind = await import(/* @vite-ignore */ path);
      await pagefind.init?.();
    } catch {
      status.textContent = 'Search is available on the published site (run a production build to create the index).';
      pagefind = null;
    }
    return pagefind;
  };

  const select = (n: number) => {
    const items = [...results.querySelectorAll<HTMLAnchorElement>('a')];
    if (!items.length) return;
    selected = (n + items.length) % items.length;
    items.forEach((a, k) => a.setAttribute('aria-selected', String(k === selected)));
    items[selected].scrollIntoView({ block: 'nearest' });
  };

  const run = async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (!q) {
      results.replaceChildren();
      status.hidden = false;
      status.textContent = 'Type to search every app and research write-up.';
      return;
    }
    const pf = await load();
    if (!pf || mine !== seq) return;
    const res = await pf.search(q);
    const data = await Promise.all(res.results.slice(0, 8).map((r: any) => r.data()));
    if (mine !== seq) return;
    results.replaceChildren();
    selected = -1;
    status.hidden = data.length > 0;
    status.textContent = data.length ? '' : `No results for “${q}”.`;
    for (const d of data) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = d.url;
      a.setAttribute('role', 'option');
      a.className = 'block rounded-lg px-3 py-2.5 hover:bg-surface-2';
      const top = document.createElement('div');
      top.className = 'flex items-center gap-2';
      const kind = document.createElement('span');
      kind.className = 'chip';
      kind.textContent = d.filters?.kind?.[0] ?? 'Page';
      const title = document.createElement('span');
      title.className = 'truncate font-medium text-ink';
      title.textContent = d.meta?.title ?? d.url;
      top.append(kind, title);
      const ex = document.createElement('p');
      ex.className = 'mt-1 line-clamp-2 text-sm leading-6 text-ink-2';
      // Pagefind excerpts are escaped text with <mark> highlights only.
      ex.innerHTML = d.excerpt;
      a.append(top, ex);
      li.append(a);
      results.append(li);
    }
  };

  const open = () => {
    if (!dialog.open) dialog.showModal();
    input.select();
    load();
  };
  document.querySelectorAll('[data-open-search]').forEach((b) => b.addEventListener('click', open));
  dialog.querySelector('[data-close-search]')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-search-form]')!.addEventListener('submit', (ev) => ev.preventDefault());
  dialog.addEventListener('click', (ev) => ev.target === dialog && dialog.close());
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(run, 120);
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') (ev.preventDefault(), select(selected + 1));
    else if (ev.key === 'ArrowUp') (ev.preventDefault(), select(selected - 1));
    else if (ev.key === 'Enter') {
      const a = results.querySelectorAll<HTMLAnchorElement>('a')[Math.max(selected, 0)];
      if (a) location.href = a.href;
    }
  });
  addEventListener('keydown', (ev) => {
    const typing = (ev.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]');
    if ((ev.key === 'k' && (ev.metaKey || ev.ctrlKey)) || (ev.key === '/' && !typing)) {
      ev.preventDefault();
      open();
    }
  });
}
