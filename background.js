// Runs inside the web page, not the extension. It can read the page's DOM but
// cannot see any variables from this file, so every helper lives inside it.
async function exportAppliedJobs() {
  if (window.seek2csvRunning) return;
  window.seek2csvRunning = true;

  // small status box in the corner of the page
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;' +
    'padding:8px 12px;border-radius:6px;background:#1c2330;color:#fff;font:14px system-ui,sans-serif;';
  document.body.appendChild(statusEl);
  const setStatus = (text) => { statusEl.textContent = `seek2csv: ${text}`; };

  // text directly inside el, ignoring text of its child elements
  const ownText = (el) =>
    [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
      .trim();

  // poll until check() returns something truthy, or give up after timeoutMs
  const waitFor = async (check, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = check();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  // clicking a job title opens a drawer with id "drawer-view-<number>"
  const drawerSelector = '[id^="drawer-view-"]';
  const seenDrawerIds = new Set();

  const findViewJobLink = () => {
    const drawer = [...document.querySelectorAll(drawerSelector)]
      .find((el) => !seenDrawerIds.has(el.id));
    if (!drawer) return null;
    const link = [...drawer.querySelectorAll('a')].find((a) =>
      a.getAttribute('aria-label') === 'View job' || /view job/i.test(a.textContent));
    return link ? { drawerId: drawer.id, href: link.href } : null;
  };

  const closeDrawer = async () => {
    const isClosed = () => !document.querySelector(drawerSelector);
    if (isClosed()) return;
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    if (await waitFor(isClosed, 1000)) return;
    // fall back to clicking the backdrop behind the drawer
    document.querySelector('#braid-modal-container > div > div:nth-of-type(2) > div:nth-of-type(1)')?.click();
    await waitFor(isClosed, 2000);
  };

  const toCsv = (rows) => {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((row) => headers.map((h) => escape(row[h])).join(','));
    return [headers.join(','), ...lines].join('\r\n');
  };

  const download = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // one per job title heading on the page currently shown
  const getTitleButtons = () => [...document.querySelectorAll('h4')]
    .map((titleElement) => titleElement.querySelector('[role="button"]'))
    .filter(Boolean);

  // changes whenever the list shows a different page of jobs
  const pageSignature = () => getTitleButtons()
    .map((titleButton) => titleButton.closest('h4').parentElement.textContent)
    .join('|');

  // returns false when there is no further page
  const goToNextPage = async () => {
    const nextLink = document.querySelector('a[rel="next"]');
    if (!nextLink || nextLink.getAttribute('aria-hidden') === 'true') return false;
    const before = pageSignature();
    nextLink.click();
    const changed = await waitFor(() => {
      const now = pageSignature();
      return now !== '' && now !== before;
    }, 10000);
    return Boolean(changed);
  };

  try {
    const maxPages = 100;
    const rows = [];
    for (let page = 1; page <= maxPages; page++) {
      const titleButtons = getTitleButtons();
      for (const [index, titleButton] of titleButtons.entries()) {
        setStatus(`page ${page}, reading job ${index + 1} of ${titleButtons.length}…`);
        const companyElement = titleButton.closest('h4').nextElementSibling;

        titleButton.click();
        const found = await waitFor(findViewJobLink, 5000);
        if (found) seenDrawerIds.add(found.drawerId);
        await closeDrawer();

        const row = {
          title: ownText(titleButton),
          company: companyElement ? ownText(companyElement) : '',
          link: found ? found.href : ''
        };
        rows.push(row);
      }

      setStatus(`page ${page} done, loading next page…`);
      if (!(await goToNextPage())) break;
    }

    if (rows.length === 0) {
      setStatus('no jobs found on this page.');
    } else {
      download('export.csv', toCsv(rows));
      setStatus(`exported ${rows.length} row(s).`);
    }
  } catch (err) {
    setStatus(`failed: ${err.message}`);
  } finally {
    window.seek2csvRunning = false;
    setTimeout(() => statusEl.remove(), 6000);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: exportAppliedJobs
    });
  } catch (err) {
    console.error('seek2csv:', err);
  }
});
