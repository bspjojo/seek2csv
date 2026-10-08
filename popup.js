const statusEl = document.getElementById('status');

// Runs inside the web page, not the popup. It can read the page's DOM but
// cannot see any variables from this file. Return an array of row objects.
function scrapePage() {
  // text directly inside el, ignoring text of its child elements
  const ownText = (el) =>
    [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
      .trim();

  // one row per job title heading
  const rows = [];
  document.querySelectorAll('h4').forEach((titleElement) => {
    // get role button attribute
    const titleButton = titleElement.querySelector('[role="button"]')
    const companyElement = titleElement.nextElementSibling;

    if (!titleButton) return; // skip if no button found

    const row = {
      title: ownText(titleButton),
      company: companyElement ? ownText(companyElement) : ''
    };
    rows.push(row);
  });
  return rows;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((row) => headers.map((h) => escape(row[h])).join(','));
  return [headers.join(','), ...lines].join('\r\n');
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: rows }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePage
    });
    download('export.csv', toCsv(rows));
    statusEl.textContent = `Exported ${rows.length} row(s).`;
  } catch (err) {
    statusEl.textContent = `Failed: ${err.message}`;
  }
});
